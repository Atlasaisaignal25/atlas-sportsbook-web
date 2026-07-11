import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  buildLearningAnalysis,
  MLB_LEARNING_ENGINE_VERSION,
  type LearningAnalysis,
  type LearningInsight,
  type LearningRow,
} from "./learning-engine";

const TABLE = "mlb_learning_insights";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function hash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

async function loadLearningRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_research_validation_history")
    .select("market,selection,edge_classification,decision,consensus,consensus_score,conviction,confidence,no_pick,result,units,clv_probability,atlas_probability,projected_home_runs,projected_away_runs,projected_total,final_home_score,final_away_score")
    .eq("canonical", true)
    .limit(20000);
  if (error) throw error;
  return (data ?? []) as LearningRow[];
}

async function loadPerformanceSnapshot() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("mlb_performance_analytics")
    .select("sample_size,total_picks,total_no_picks,roi,average_clv,low_sample_size,calculated_at")
    .eq("model_version", "mlb_performance_analytics_v1")
    .eq("canonical", true)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

function insightRow(insight: LearningInsight) {
  const payload = {
    metric: insight.metric,
    segment: insight.segment,
    sample: insight.sample,
    winRate: insight.winRate,
    roi: insight.roi,
    clv: insight.clv,
    projectionError: insight.projectionError,
    calibrationError: insight.calibrationError,
    recommendation: insight.recommendation,
    version: insight.version,
  };
  return {
    metric: insight.metric,
    segment: insight.segment,
    sample: insight.sample,
    win_rate: insight.winRate,
    roi: insight.roi,
    clv: insight.clv,
    projection_error: insight.projectionError,
    calibration_error: insight.calibrationError,
    recommendation: insight.recommendation,
    confidence: insight.confidence,
    version: insight.version,
    source_tables: insight.sourceTables,
    metadata: insight.metadata,
    insight_hash: hash(payload),
    canonical: true,
    timestamp: insight.timestamp,
  };
}

export async function analyzeLearningInsights() {
  const [rows, performanceSnapshot] = await Promise.all([loadLearningRows(), loadPerformanceSnapshot()]);
  const analysis = buildLearningAnalysis(rows, performanceSnapshot);
  const insightRows = analysis.insights.map(insightRow);
  const supabase = getSupabaseAdmin();
  if (insightRows.length === 0) return { analysis, inserted: 0, skipped: 0, errors: [] as string[] };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(insightRows, { onConflict: "insight_hash", ignoreDuplicates: true })
    .select("id");
  if (error) return { analysis, inserted: 0, skipped: 0, errors: [error.message] };

  const hashes = insightRows.map((row) => row.insight_hash);
  const markCurrent = await supabase
    .from(TABLE)
    .update({ canonical: true, superseded_at: null, invalid_reason: null })
    .in("insight_hash", hashes);
  if (markCurrent.error) return { analysis, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };

  const quotedHashes = hashes.map((item) => `"${item}"`).join(",");
  const markOld = await supabase
    .from(TABLE)
    .update({
      canonical: false,
      superseded_at: new Date().toISOString(),
      invalid_reason: "SUPERSEDED_BY_MLB_LEARNING_ENGINE_ANALYSIS",
    })
    .eq("version", MLB_LEARNING_ENGINE_VERSION)
    .not("insight_hash", "in", `(${quotedHashes})`)
    .eq("canonical", true);
  if (markOld.error) return { analysis, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };

  const inserted = data?.length ?? 0;
  return { analysis, inserted, skipped: insightRows.length - inserted, errors: [] as string[] };
}

export async function getLearningEngineStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("version", MLB_LEARNING_ENGINE_VERSION);
  if (error) return { healthy: false, totalInsights: 0, canonicalInsights: 0, errors: [error.message] };

  const { data, error: rowsError } = await supabase
    .from(TABLE)
    .select("metric,segment,sample,win_rate,roi,clv,projection_error,calibration_error,recommendation,confidence,timestamp")
    .eq("version", MLB_LEARNING_ENGINE_VERSION)
    .eq("canonical", true)
    .order("timestamp", { ascending: false })
    .limit(100);

  const rows = rowsError ? [] : (data ?? []);
  const sampleSize = Math.max(...rows.map((row: any) => Number(row.sample ?? 0)), 0);
  const byMetric = rows.reduce((acc: Record<string, number>, row: any) => {
    const metric = String(row.metric ?? "UNAVAILABLE");
    acc[metric] = (acc[metric] ?? 0) + 1;
    return acc;
  }, {});
  const best = (metric: string) =>
    rows
      .filter((row: any) => row.metric === metric && row.sample > 0 && row.roi !== null)
      .toSorted((a: any, b: any) => Number(b.roi ?? -Infinity) - Number(a.roi ?? -Infinity))[0]?.segment ?? null;
  const worst = (metric: string) =>
    rows
      .filter((row: any) => row.metric === metric && row.sample > 0 && row.roi !== null)
      .toSorted((a: any, b: any) => Number(a.roi ?? Infinity) - Number(b.roi ?? Infinity))[0]?.segment ?? null;
  const projection = rows.find((row: any) => row.metric === "PROJECTION_ERROR");
  const calibration = rows.find((row: any) => row.metric === "MONEYLINE_CALIBRATION");
  const lowSampleSize = sampleSize < 100;

  return {
    healthy: !rowsError,
    totalInsights: count ?? 0,
    canonicalInsights: rows.length,
    sampleSize,
    lowSampleSize,
    insightsFound: rows.length,
    bestEdge: best("EDGE"),
    worstEdge: worst("EDGE"),
    bestConviction: best("CONVICTION"),
    bestConfidence: best("CONFIDENCE"),
    calibrationError: calibration?.calibration_error ?? null,
    projectionError: projection?.projection_error ?? null,
    byMetric,
    examples: rows.slice(0, 10),
    warnings: lowSampleSize ? ["LOW SAMPLE SIZE: fewer than 100 graded games. Learning recommendations are observational only."] : [],
    errors: rowsError ? [rowsError.message] : [] as string[],
  };
}

