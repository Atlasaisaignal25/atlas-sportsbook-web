import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  buildPerformanceAnalyticsSnapshot,
  MLB_PERFORMANCE_ANALYTICS_VERSION,
  type PerformanceAnalyticsSnapshot,
  type ValidationPerformanceRow,
} from "./performance-analytics-engine";

const TABLE = "mlb_performance_analytics";

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

function featureHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

async function loadValidationRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_research_validation_history")
    .select("market,selection,edge_classification,decision,conviction,confidence,no_pick,result,units,clv_probability")
    .eq("canonical", true)
    .limit(20000);
  if (error) throw error;
  return (data ?? []) as ValidationPerformanceRow[];
}

function snapshotRow(snapshot: PerformanceAnalyticsSnapshot) {
  const payload = {
    modelVersion: snapshot.modelVersion,
    sampleSize: snapshot.sampleSize,
    totalPicks: snapshot.totalPicks,
    totalNoPicks: snapshot.totalNoPicks,
    wins: snapshot.wins,
    losses: snapshot.losses,
    pushes: snapshot.pushes,
    winRate: snapshot.winRate,
    roi: snapshot.roi,
    averageClv: snapshot.averageClv,
    byMarket: snapshot.byMarket,
    byEdge: snapshot.byEdge,
    byDecision: snapshot.byDecision,
    byConviction: snapshot.byConviction,
    byConfidence: snapshot.byConfidence,
  };
  return {
    model_version: snapshot.modelVersion,
    sample_size: snapshot.sampleSize,
    total_picks: snapshot.totalPicks,
    total_no_picks: snapshot.totalNoPicks,
    wins: snapshot.wins,
    losses: snapshot.losses,
    pushes: snapshot.pushes,
    win_rate: snapshot.winRate,
    roi: snapshot.roi,
    average_clv: snapshot.averageClv,
    best_market: snapshot.bestMarket,
    worst_market: snapshot.worstMarket,
    best_edge_classification: snapshot.bestEdgeClassification,
    best_conviction: snapshot.bestConviction,
    best_confidence_bucket: snapshot.bestConfidenceBucket,
    low_sample_size: snapshot.lowSampleSize,
    global_metrics: snapshot.globalMetrics,
    by_market: snapshot.byMarket,
    by_edge: snapshot.byEdge,
    by_decision: snapshot.byDecision,
    by_conviction: snapshot.byConviction,
    by_confidence: snapshot.byConfidence,
    by_motor: snapshot.byMotor,
    source_table: snapshot.sourceTable,
    feature_hash: featureHash(payload),
    canonical: true,
    calculated_at: snapshot.calculatedAt,
  };
}

export async function calculatePerformanceAnalytics() {
  const rows = await loadValidationRows();
  const snapshot = buildPerformanceAnalyticsSnapshot(rows);
  const row = snapshotRow(snapshot);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "feature_hash", ignoreDuplicates: true })
    .select("id");
  if (error) return { snapshot, inserted: 0, skipped: 0, errors: [error.message] };

  const markCurrent = await supabase
    .from(TABLE)
    .update({ canonical: true, superseded_at: null, invalid_reason: null })
    .eq("feature_hash", row.feature_hash);
  if (markCurrent.error) return { snapshot, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };

  const markOld = await supabase
    .from(TABLE)
    .update({
      canonical: false,
      superseded_at: new Date().toISOString(),
      invalid_reason: "SUPERSEDED_BY_MLB_PERFORMANCE_ANALYTICS_CALCULATION",
    })
    .eq("model_version", MLB_PERFORMANCE_ANALYTICS_VERSION)
    .neq("feature_hash", row.feature_hash)
    .eq("canonical", true);
  if (markOld.error) return { snapshot, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };

  const inserted = data?.length ?? 0;
  return { snapshot, inserted, skipped: inserted ? 0 : 1, errors: [] as string[] };
}

export async function getPerformanceAnalyticsStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("model_version", MLB_PERFORMANCE_ANALYTICS_VERSION);
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, errors: [error.message] };

  const { count: canonicalSnapshots } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("model_version", MLB_PERFORMANCE_ANALYTICS_VERSION)
    .eq("canonical", true);

  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("sample_size,total_picks,total_no_picks,wins,losses,pushes,win_rate,roi,average_clv,best_market,worst_market,best_edge_classification,best_conviction,best_confidence_bucket,low_sample_size,global_metrics,by_market,by_edge,by_decision,by_conviction,by_confidence,by_motor,calculated_at")
    .eq("model_version", MLB_PERFORMANCE_ANALYTICS_VERSION)
    .eq("canonical", true)
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    latestSnapshot: data ?? null,
    sampleSize: data?.sample_size ?? 0,
    totalPicks: data?.total_picks ?? 0,
    totalNoPicks: data?.total_no_picks ?? 0,
    roi: data?.roi ?? null,
    averageClv: data?.average_clv ?? null,
    bestMarket: data?.best_market ?? null,
    worstMarket: data?.worst_market ?? null,
    bestEdgeClassification: data?.best_edge_classification ?? null,
    bestConviction: data?.best_conviction ?? null,
    bestConfidenceBucket: data?.best_confidence_bucket ?? null,
    lowSampleSize: data?.low_sample_size ?? true,
    warnings: data?.low_sample_size ? ["LOW SAMPLE SIZE: fewer than 100 graded picks. Do not draw conclusions or recalibrate weights."] : [],
    errors: latestError ? [latestError.message] : [] as string[],
  };
}

