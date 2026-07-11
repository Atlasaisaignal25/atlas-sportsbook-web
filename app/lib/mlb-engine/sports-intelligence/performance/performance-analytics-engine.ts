export const MLB_PERFORMANCE_ANALYTICS_VERSION = "mlb_performance_analytics_v1";
export const MLB_PERFORMANCE_LOW_SAMPLE_THRESHOLD = 100;

export type PerformanceResult = "WON" | "LOST" | "PUSH" | "VOID" | "PENDING";

export type ValidationPerformanceRow = {
  market: string | null;
  selection: string | null;
  edge_classification: string | null;
  decision: string | null;
  conviction: string | null;
  confidence: number | string | null;
  no_pick: boolean | null;
  result: PerformanceResult | string | null;
  units: number | string | null;
  clv_probability: number | string | null;
};

export type PerformanceBucket = {
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  roi: number | null;
  averageClv: number | null;
};

export type PerformanceAnalyticsSnapshot = {
  modelVersion: typeof MLB_PERFORMANCE_ANALYTICS_VERSION;
  sampleSize: number;
  totalPicks: number;
  totalNoPicks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  roi: number | null;
  averageClv: number | null;
  bestMarket: string | null;
  worstMarket: string | null;
  bestEdgeClassification: string | null;
  bestConviction: string | null;
  bestConfidenceBucket: string | null;
  lowSampleSize: boolean;
  globalMetrics: PerformanceBucket & { totalNoPicks: number; lowSampleSize: boolean };
  byMarket: Record<string, PerformanceBucket>;
  byEdge: Record<string, PerformanceBucket>;
  byDecision: Record<string, PerformanceBucket>;
  byConviction: Record<string, PerformanceBucket>;
  byConfidence: Record<string, PerformanceBucket>;
  byMotor: Record<string, unknown>;
  sourceTable: "public.mlb_research_validation_history";
  calculatedAt: string;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isPick(row: ValidationPerformanceRow) {
  return !row.no_pick && row.selection !== "NONE";
}

function isGradedPick(row: ValidationPerformanceRow) {
  return isPick(row) && ["WON", "LOST", "PUSH"].includes(String(row.result ?? ""));
}

function metrics(rows: ValidationPerformanceRow[]): PerformanceBucket {
  const graded = rows.filter(isGradedPick);
  const wins = graded.filter((row) => row.result === "WON").length;
  const losses = graded.filter((row) => row.result === "LOST").length;
  const pushes = graded.filter((row) => row.result === "PUSH").length;
  const risked = wins + losses;
  const units = graded.reduce((sum, row) => sum + (toNumber(row.units) ?? 0), 0);
  const clvValues = rows.map((row) => toNumber(row.clv_probability)).filter(isNumber);

  return {
    picks: graded.length,
    wins,
    losses,
    pushes,
    winRate: risked > 0 ? round(wins / risked, 4) : null,
    roi: risked > 0 ? round(units / risked, 4) : null,
    averageClv: clvValues.length > 0 ? round(clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length, 4) : null,
  };
}

function groupBy(rows: ValidationPerformanceRow[], key: (row: ValidationPerformanceRow) => string, forcedKeys: string[] = []) {
  const groups = new Map<string, ValidationPerformanceRow[]>();
  forcedKeys.forEach((forcedKey) => groups.set(forcedKey, []));
  for (const row of rows) {
    const group = key(row);
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }
  return Object.fromEntries(Array.from(groups.entries()).map(([group, groupRows]) => [group, metrics(groupRows)]));
}

function normalizeDecision(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "NO_PICK";
  if (raw.includes("NO_PICK")) return "NO_PICK";
  if (raw === "HOME_ML" || raw.includes("HOME_MONEYLINE")) return "HOME_ML";
  if (raw === "AWAY_ML" || raw.includes("AWAY_MONEYLINE")) return "AWAY_ML";
  if (raw.includes("LEAN_HOME")) return "LEAN_HOME";
  if (raw.includes("LEAN_AWAY")) return "LEAN_AWAY";
  if (raw.includes("TOTAL_OVER") || raw.includes("OVER")) return "TOTAL_OVER";
  if (raw.includes("TOTAL_UNDER") || raw.includes("UNDER")) return "TOTAL_UNDER";
  return raw;
}

function normalizeConviction(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "LOW" || raw === "MEDIUM" || raw === "HIGH") return raw;
  return "NONE";
}

function confidenceBucket(value: unknown) {
  const confidence = toNumber(value);
  if (confidence === null) return "0-50";
  if (confidence <= 50) return "0-50";
  if (confidence <= 60) return "51-60";
  if (confidence <= 70) return "61-70";
  if (confidence <= 80) return "71-80";
  if (confidence <= 90) return "81-90";
  return "91-100";
}

function bestByRoi(groups: Record<string, PerformanceBucket>) {
  return Object.entries(groups)
    .filter(([, bucket]) => bucket.picks > 0 && bucket.roi !== null)
    .toSorted(([, first], [, second]) => (second.roi ?? -Infinity) - (first.roi ?? -Infinity))[0]?.[0] ?? null;
}

function worstByRoi(groups: Record<string, PerformanceBucket>) {
  return Object.entries(groups)
    .filter(([, bucket]) => bucket.picks > 0 && bucket.roi !== null)
    .toSorted(([, first], [, second]) => (first.roi ?? Infinity) - (second.roi ?? Infinity))[0]?.[0] ?? null;
}

export function buildPerformanceAnalyticsSnapshot(
  rows: ValidationPerformanceRow[],
  calculatedAt = new Date().toISOString(),
): PerformanceAnalyticsSnapshot {
  const pickRows = rows.filter(isPick);
  const gradedRows = rows.filter(isGradedPick);
  const global = metrics(rows);
  const totalNoPicks = rows.filter((row) => row.no_pick || normalizeDecision(row.decision) === "NO_PICK").length;
  const byMarket = groupBy(rows, (row) => String(row.market ?? "UNAVAILABLE"), ["MONEYLINE", "RUN_LINE", "TOTALS"]);
  const byEdge = groupBy(rows, (row) => String(row.edge_classification ?? "NO_EDGE"), ["NO_EDGE", "SMALL_EDGE", "MODERATE_EDGE", "HIGH_EDGE", "EXTREME_EDGE"]);
  const byDecision = groupBy(rows, (row) => normalizeDecision(row.decision), ["HOME_ML", "AWAY_ML", "LEAN_HOME", "LEAN_AWAY", "TOTAL_OVER", "TOTAL_UNDER", "NO_PICK"]);
  const byConviction = groupBy(rows, (row) => normalizeConviction(row.conviction), ["NONE", "LOW", "MEDIUM", "HIGH"]);
  const byConfidence = groupBy(rows, (row) => confidenceBucket(row.confidence), ["0-50", "51-60", "61-70", "71-80", "81-90", "91-100"]);
  const sampleSize = gradedRows.length;
  const lowSampleSize = sampleSize < MLB_PERFORMANCE_LOW_SAMPLE_THRESHOLD;

  return {
    modelVersion: MLB_PERFORMANCE_ANALYTICS_VERSION,
    sampleSize,
    totalPicks: pickRows.length,
    totalNoPicks,
    wins: global.wins,
    losses: global.losses,
    pushes: global.pushes,
    winRate: global.winRate,
    roi: global.roi,
    averageClv: global.averageClv,
    bestMarket: bestByRoi(byMarket),
    worstMarket: worstByRoi(byMarket),
    bestEdgeClassification: bestByRoi(byEdge),
    bestConviction: bestByRoi(byConviction),
    bestConfidenceBucket: bestByRoi(byConfidence),
    lowSampleSize,
    globalMetrics: { ...global, totalNoPicks, lowSampleSize },
    byMarket,
    byEdge,
    byDecision,
    byConviction,
    byConfidence,
    byMotor: {
      status: "UNAVAILABLE",
      reason: "public.mlb_research_validation_history does not store per-engine contribution fields. Phase 15 does not join external engine tables or invent motor relationships.",
      requestedMotors: ["Projection", "Pitcher", "Offense", "Bullpen", "Weather", "Park"],
    },
    sourceTable: "public.mlb_research_validation_history",
    calculatedAt,
  };
}

