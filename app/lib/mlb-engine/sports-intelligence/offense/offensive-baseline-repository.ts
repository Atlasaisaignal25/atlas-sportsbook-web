import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type { OffensiveMetricBreakdown, OffensiveRollingWindow, OffensiveTeamForm } from "../types";

export const OFFENSIVE_SCORE_VERSION = "offensive_score_v1";
export const OFFENSIVE_BASELINE_VERSION = "offensive_baseline_v1";

export const BASELINE_METRICS = [
  "hard_hit_rate",
  "barrel_rate",
  "average_exit_velocity",
  "walk_rate",
  "strikeout_rate",
  "expected_ba_on_contact",
  "expected_slg_on_contact",
  "expected_woba_on_contact",
  "atlas_expected_offense_rate",
] as const;

export type BaselineMetricName = (typeof BASELINE_METRICS)[number];

export type OffensiveBaselineMetric = {
  season: number;
  windowGames: 7 | 14 | 30;
  metric: BaselineMetricName;
  teamCount: number;
  mean?: number;
  standardDeviation?: number;
  median?: number;
  minimum?: number;
  maximum?: number;
  sampleQualityPolicy: "SUFFICIENT_OR_LIMITED";
  asOf: string;
  source: "BASEBALL_SAVANT";
  sourceUpdatedAt?: string;
  baselineHash: string;
  ready: boolean;
  warnings: string[];
};

export type OffensiveBaselineSet = {
  asOf: string;
  season: number;
  metrics: Record<string, OffensiveBaselineMetric>;
  inserted: number;
  skipped: number;
  errors: string[];
};

const WINDOW_KEY: Record<7 | 14 | 30, OffensiveRollingWindow> = {
  7: "last7",
  14: "last14",
  30: "last30",
};

const WINDOW_WEIGHT: Record<OffensiveRollingWindow, number> = {
  last7: 0.5,
  last14: 0.3,
  last30: 0.2,
};

const METRIC_TO_FORM_KEY: Record<BaselineMetricName, keyof NonNullable<OffensiveTeamForm["rollingWindows"]["last7"]>> = {
  hard_hit_rate: "hardHitRate",
  barrel_rate: "barrelRate",
  average_exit_velocity: "averageExitVelocity",
  walk_rate: "walkRate",
  strikeout_rate: "strikeoutRate",
  expected_ba_on_contact: "expectedBAOnContact",
  expected_slg_on_contact: "expectedSLGOnContact",
  expected_woba_on_contact: "expectedWOBAOnContact",
  atlas_expected_offense_rate: "atlasExpectedOffenseRate",
};

const METRIC_WEIGHTS: Record<BaselineMetricName, { weight: number; higherIsBetter: boolean }> = {
  hard_hit_rate: { weight: 0.14, higherIsBetter: true },
  barrel_rate: { weight: 0.14, higherIsBetter: true },
  average_exit_velocity: { weight: 0.1, higherIsBetter: true },
  walk_rate: { weight: 0.12, higherIsBetter: true },
  strikeout_rate: { weight: 0.12, higherIsBetter: false },
  expected_ba_on_contact: { weight: 0.06, higherIsBetter: true },
  expected_slg_on_contact: { weight: 0.08, higherIsBetter: true },
  expected_woba_on_contact: { weight: 0.09, higherIsBetter: true },
  atlas_expected_offense_rate: { weight: 0.15, higherIsBetter: true },
};

function hash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
}

function rowMetric(row: any, metric: BaselineMetricName) {
  return row[metric];
}

function snapshotRowsToTeamForms(rows: any[]): OffensiveTeamForm[] {
  const byTeam = new Map<string, OffensiveTeamForm>();
  rows.forEach((row) => {
    const form: OffensiveTeamForm = byTeam.get(row.team_id) ?? {
      teamId: row.team_id,
      teamName: row.team_name,
      source: "BASEBALL_SAVANT",
      availability: "AVAILABLE",
      rollingWindows: {},
      componentBreakdown: [],
    };
    const window = WINDOW_KEY[row.window_games as 7 | 14 | 30];
    form.rollingWindows[window] = {
      window,
      games: row.window_games,
      gamesRequested: row.window_games,
      gamesIncluded: row.games_included,
      startDate: row.start_date,
      endDate: row.end_date,
      plateAppearances: row.plate_appearances,
      battedBallEvents: row.batted_ball_events,
      hardHitRate: row.hard_hit_rate,
      barrelRate: row.barrel_rate,
      averageExitVelocity: row.average_exit_velocity,
      exitVelocity: row.average_exit_velocity,
      walkRate: row.walk_rate,
      strikeoutRate: row.strikeout_rate,
      expectedBAOnContact: row.expected_ba_on_contact,
      expectedSLGOnContact: row.expected_slg_on_contact,
      expectedWOBAOnContact: row.expected_woba_on_contact,
      atlasExpectedOffenseRate: row.atlas_expected_offense_rate,
      score: row.atlas_offensive_score === null ? undefined : Number(row.atlas_offensive_score),
      scoreVersion: row.score_version,
      baselineAsOf: row.baseline_as_of,
      baselineVersion: row.baseline_version,
      sampleQuality: row.sample_quality,
      componentBreakdown: row.score_components ?? [],
    };
    byTeam.set(row.team_id, form);
  });
  return Array.from(byTeam.values()).map((form) => {
    const availableScores = (["last7", "last14", "last30"] as OffensiveRollingWindow[])
      .map((window) => ({ window, score: form.rollingWindows[window]?.score }))
      .filter((item): item is { window: OffensiveRollingWindow; score: number } => isNumber(item.score));
    const totalWeight = availableScores.reduce((sum, item) => sum + WINDOW_WEIGHT[item.window], 0);
    const atlasOffensiveScore = totalWeight > 0
      ? round(availableScores.reduce((sum, item) => sum + item.score * WINDOW_WEIGHT[item.window], 0) / totalWeight, 1)
      : undefined;
    const currentWindow = form.rollingWindows.last7 ?? form.rollingWindows.last14 ?? form.rollingWindows.last30;
    return {
      ...form,
      atlasOffensiveScore,
      currentScore: atlasOffensiveScore,
      scoreTimestamp: currentWindow?.endDate ?? currentWindow?.startDate,
      scoreVersion: atlasOffensiveScore === undefined ? undefined : currentWindow?.scoreVersion,
      baselineAsOf: currentWindow?.baselineAsOf,
      baselineVersion: currentWindow?.baselineVersion,
      componentBreakdown: currentWindow?.componentBreakdown ?? [],
      last7Score: form.rollingWindows.last7?.score,
      last14Score: form.rollingWindows.last14?.score,
      last30Score: form.rollingWindows.last30?.score,
    };
  });
}

async function latestCanonicalRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_offensive_form_snapshots")
    .select("*")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const seen = new Set<string>();
  return (data ?? []).filter((row: any) => {
    const key = `${row.team_id}:${row.window_games}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadLatestCanonicalOffensiveTeamForms() {
  return snapshotRowsToTeamForms(await latestCanonicalRows());
}

export async function buildAndPersistOffensiveBaselines(input: { asOf?: string; season?: number } = {}): Promise<OffensiveBaselineSet> {
  const asOf = input.asOf ?? new Date().toISOString();
  const season = input.season ?? new Date(asOf).getUTCFullYear();
  const rows = await latestCanonicalRows();
  const supabase = getSupabaseAdmin();
  const baselines: OffensiveBaselineMetric[] = [];

  ([7, 14, 30] as const).forEach((windowGames) => {
    BASELINE_METRICS.forEach((metric) => {
      const values: Array<{ teamId: string; value: number }> = rows
        .filter((row: any) =>
          row.window_games === windowGames &&
          (row.sample_quality === "SUFFICIENT" || row.sample_quality === "LIMITED") &&
          row.canonical === true,
        )
        .map((row: any) => ({ teamId: row.team_id, value: Number(rowMetric(row, metric)) }))
        .filter((item: { teamId: string; value: number }) => Number.isFinite(item.value));
      const uniqueTeams = new Set(values.map((item) => item.teamId));
      const numericValues = Array.from(uniqueTeams)
        .map((teamId) => values.find((item) => item.teamId === teamId)?.value)
        .filter(isNumber);
      const sd = numericValues.length >= 2 ? standardDeviation(numericValues) : undefined;
      const mean = numericValues.length ? average(numericValues) : undefined;
      const warnings: string[] = [];
      if (numericValues.length < 26) warnings.push("Fewer than 26 teams available.");
      if (!isNumber(sd) || sd <= 0.000001) warnings.push("Standard deviation unavailable or too small.");
      const baselineHash = hash({
        version: OFFENSIVE_BASELINE_VERSION,
        season,
        windowGames,
        metric,
        teamCount: numericValues.length,
        mean: isNumber(mean) ? round(mean, 6) : undefined,
        standardDeviation: isNumber(sd) ? round(sd, 6) : undefined,
        median: numericValues.length ? round(median(numericValues), 6) : undefined,
        minimum: numericValues.length ? round(Math.min(...numericValues), 6) : undefined,
        maximum: numericValues.length ? round(Math.max(...numericValues), 6) : undefined,
      });
      baselines.push({
        season,
        windowGames,
        metric,
        teamCount: numericValues.length,
        sampleQualityPolicy: "SUFFICIENT_OR_LIMITED",
        mean: isNumber(mean) ? round(mean, 6) : undefined,
        standardDeviation: isNumber(sd) ? round(sd, 6) : undefined,
        median: numericValues.length ? round(median(numericValues), 6) : undefined,
        minimum: numericValues.length ? round(Math.min(...numericValues), 6) : undefined,
        maximum: numericValues.length ? round(Math.max(...numericValues), 6) : undefined,
        asOf,
        source: "BASEBALL_SAVANT",
        sourceUpdatedAt: asOf,
        baselineHash,
        ready: warnings.length === 0,
        warnings,
      });
    });
  });

  const rowsToInsert = baselines.map((baseline) => ({
    season: baseline.season,
    window_games: baseline.windowGames,
    metric: baseline.metric,
    team_count: baseline.teamCount,
    sample_quality_policy: baseline.sampleQualityPolicy,
    mean: baseline.mean,
    standard_deviation: baseline.standardDeviation,
    median: baseline.median,
    minimum: baseline.minimum,
    maximum: baseline.maximum,
    as_of: baseline.asOf,
    source: baseline.source,
    source_updated_at: baseline.sourceUpdatedAt,
    baseline_hash: baseline.baselineHash,
    canonical: baseline.ready,
  }));
  const { data, error } = await supabase
    .from("mlb_offensive_baseline_snapshots")
    .upsert(rowsToInsert, { onConflict: "baseline_hash", ignoreDuplicates: true })
    .select("id");
  const inserted = data?.length ?? 0;

  return {
    asOf,
    season,
    metrics: Object.fromEntries(baselines.map((baseline) => [`${baseline.windowGames}:${baseline.metric}`, baseline])),
    inserted,
    skipped: rowsToInsert.length - inserted,
    errors: error ? [error.message] : [],
  };
}

function normalizeMetric(value: number, baseline: OffensiveBaselineMetric, higherIsBetter: boolean) {
  if (!isNumber(baseline.standardDeviation) || baseline.standardDeviation <= 0) return undefined;
  const z = Math.max(-3, Math.min(3, (value - (baseline.mean ?? 0)) / baseline.standardDeviation));
  const score = higherIsBetter ? 50 + z * 12.5 : 50 - z * 12.5;
  return Math.max(0, Math.min(100, score));
}

function scoreWindow(form: OffensiveTeamForm, window: OffensiveRollingWindow, baselineSet: OffensiveBaselineSet) {
  const item = form.rollingWindows[window];
  if (!item || item.sampleQuality === "UNAVAILABLE" || item.sampleQuality === "INSUFFICIENT") return undefined;
  const windowGames = item.gamesRequested ?? item.games;
  const breakdown: OffensiveMetricBreakdown[] = [];
  BASELINE_METRICS.forEach((metric) => {
    const baseline = baselineSet.metrics[`${windowGames}:${metric}`];
    if (!baseline?.ready) return;
    const raw = item[METRIC_TO_FORM_KEY[metric]];
    if (!isNumber(raw)) return;
    const profile = METRIC_WEIGHTS[metric];
    const normalizedScore = normalizeMetric(raw, baseline, profile.higherIsBetter);
    if (!isNumber(normalizedScore)) return;
    breakdown.push({
      metric: metric === "average_exit_velocity" ? "exitVelocity" : METRIC_TO_FORM_KEY[metric] as any,
      rawValue: raw,
      normalizedScore: round(normalizedScore, 1),
      weight: profile.weight,
      higherIsBetter: profile.higherIsBetter,
    });
  });
  const totalWeight = breakdown.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return undefined;
  const score = breakdown.reduce((sum, part) => sum + part.normalizedScore * part.weight, 0) / totalWeight;
  return { score: round(score, 1), breakdown };
}

export function applyAuditOnlyOffensiveScores(forms: OffensiveTeamForm[], baselineSet: OffensiveBaselineSet) {
  return forms.map((form): OffensiveTeamForm => {
    const rollingWindows = { ...form.rollingWindows };
    (["last7", "last14", "last30"] as OffensiveRollingWindow[]).forEach((window) => {
      const scored = scoreWindow(form, window, baselineSet);
      if (!rollingWindows[window] || !scored) return;
      rollingWindows[window] = {
        ...rollingWindows[window],
        score: scored.score,
        componentBreakdown: scored.breakdown,
        scoreVersion: OFFENSIVE_SCORE_VERSION,
        baselineAsOf: baselineSet.asOf,
        baselineVersion: OFFENSIVE_BASELINE_VERSION,
      };
    });
    const availableScores = (["last7", "last14", "last30"] as OffensiveRollingWindow[])
      .map((window) => ({ window, score: rollingWindows[window]?.score }))
      .filter((item): item is { window: OffensiveRollingWindow; score: number } => isNumber(item.score));
    const totalWeight = availableScores.reduce((sum, item) => sum + WINDOW_WEIGHT[item.window], 0);
    const atlasOffensiveScore = totalWeight > 0
      ? round(availableScores.reduce((sum, item) => sum + item.score * WINDOW_WEIGHT[item.window], 0) / totalWeight, 1)
      : undefined;
    return {
      ...form,
      rollingWindows,
      atlasOffensiveScore,
      currentScore: atlasOffensiveScore,
      scoreVersion: atlasOffensiveScore === undefined ? undefined : OFFENSIVE_SCORE_VERSION,
      baselineAsOf: atlasOffensiveScore === undefined ? undefined : baselineSet.asOf,
      baselineVersion: atlasOffensiveScore === undefined ? undefined : OFFENSIVE_BASELINE_VERSION,
      componentBreakdown: rollingWindows.last7?.componentBreakdown ?? [],
      last7Score: rollingWindows.last7?.score,
      last14Score: rollingWindows.last14?.score,
      last30Score: rollingWindows.last30?.score,
    };
  });
}

export function scoreDistribution(forms: OffensiveTeamForm[]) {
  const scores = forms.map((form) => form.atlasOffensiveScore).filter(isNumber).sort((a, b) => a - b);
  if (scores.length === 0) return { teamCount: 0 };
  return {
    teamCount: scores.length,
    mean: round(average(scores), 2),
    median: round(median(scores), 2),
    standardDeviation: round(standardDeviation(scores), 2),
    minimum: scores[0],
    maximum: scores.at(-1),
    p10: percentile(scores, 0.1),
    p25: percentile(scores, 0.25),
    p75: percentile(scores, 0.75),
    p90: percentile(scores, 0.9),
  };
}

export async function getOffensiveBaselineStorageStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("mlb_offensive_baseline_snapshots")
    .select("id", { count: "exact", head: true });
  if (error) {
    return { healthy: false, totalBaselines: 0, latestAsOf: undefined as string | undefined, errors: [error.message] };
  }
  const { data, error: latestError } = await supabase
    .from("mlb_offensive_baseline_snapshots")
    .select("as_of,window_games,metric,team_count")
    .eq("canonical", true)
    .order("as_of", { ascending: false })
    .limit(27);
  return {
    healthy: !latestError,
    totalBaselines: count ?? 0,
    latestAsOf: data?.[0]?.as_of as string | undefined,
    latestCanonicalMetrics: data?.length ?? 0,
    errors: latestError ? [latestError.message] : [] as string[],
  };
}
