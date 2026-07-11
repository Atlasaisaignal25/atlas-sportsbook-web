export const MLB_LEARNING_ENGINE_VERSION = "mlb_learning_engine_v1";
export const MLB_LEARNING_LOW_SAMPLE_THRESHOLD = 100;

export type LearningRow = {
  market: string | null;
  selection: string | null;
  edge_classification: string | null;
  decision: string | null;
  consensus: string | null;
  consensus_score: number | string | null;
  conviction: string | null;
  confidence: number | string | null;
  no_pick: boolean | null;
  result: string | null;
  units: number | string | null;
  clv_probability: number | string | null;
  atlas_probability: number | string | null;
  projected_home_runs: number | string | null;
  projected_away_runs: number | string | null;
  projected_total: number | string | null;
  final_home_score: number | string | null;
  final_away_score: number | string | null;
};

export type LearningInsight = {
  metric: string;
  segment: string;
  sample: number;
  winRate: number | null;
  roi: number | null;
  clv: number | null;
  projectionError: number | null;
  calibrationError: number | null;
  recommendation: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  version: typeof MLB_LEARNING_ENGINE_VERSION;
  sourceTables: string[];
  metadata: Record<string, unknown>;
  timestamp: string;
};

export type LearningAnalysis = {
  version: typeof MLB_LEARNING_ENGINE_VERSION;
  timestamp: string;
  sampleSize: number;
  lowSampleSize: boolean;
  insights: LearningInsight[];
  bestEdge: string | null;
  worstEdge: string | null;
  bestConviction: string | null;
  bestConfidence: string | null;
  calibrationError: number | null;
  projectionError: number | null;
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

function isPick(row: LearningRow) {
  return !row.no_pick && row.selection !== "NONE";
}

function isGradedPick(row: LearningRow) {
  return isPick(row) && ["WON", "LOST", "PUSH"].includes(String(row.result ?? ""));
}

function normalizedDecision(row: LearningRow) {
  if (row.no_pick) return "NO_PICK";
  const decision = String(row.decision ?? "").toUpperCase();
  if (decision.includes("NO_PICK")) return "NO_PICK";
  if (row.market === "RUN_LINE") return "RUN_LINE";
  if (row.market === "TOTALS") return "TOTALS";
  if (decision.includes("HOME")) return "HOME_ML";
  if (decision.includes("AWAY")) return "AWAY_ML";
  return decision || "UNAVAILABLE";
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

function metrics(rows: LearningRow[]) {
  const graded = rows.filter(isGradedPick);
  const wins = graded.filter((row) => row.result === "WON").length;
  const losses = graded.filter((row) => row.result === "LOST").length;
  const pushes = graded.filter((row) => row.result === "PUSH").length;
  const risked = wins + losses;
  const units = graded.reduce((sum, row) => sum + (toNumber(row.units) ?? 0), 0);
  const clvValues = rows.map((row) => toNumber(row.clv_probability)).filter(isNumber);
  return {
    sample: graded.length,
    wins,
    losses,
    pushes,
    winRate: risked > 0 ? round(wins / risked, 4) : null,
    roi: risked > 0 ? round(units / risked, 4) : null,
    clv: clvValues.length > 0 ? round(clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length, 4) : null,
  };
}

function average(values: Array<number | null>) {
  const real = values.filter(isNumber);
  if (!real.length) return null;
  return round(real.reduce((sum, value) => sum + value, 0) / real.length, 4);
}

function projectionError(rows: LearningRow[]) {
  const errors = rows
    .filter((row) => row.result && row.result !== "PENDING")
    .map((row) => {
      const projectedHome = toNumber(row.projected_home_runs);
      const projectedAway = toNumber(row.projected_away_runs);
      const finalHome = toNumber(row.final_home_score);
      const finalAway = toNumber(row.final_away_score);
      if (projectedHome === null || projectedAway === null || finalHome === null || finalAway === null) return null;
      return Math.abs(projectedHome - finalHome) + Math.abs(projectedAway - finalAway);
    });
  return average(errors);
}

function moneylineCalibrationError(rows: LearningRow[]) {
  const errors = rows
    .filter((row) => row.market === "MONEYLINE" && isGradedPick(row))
    .map((row) => {
      const probability = toNumber(row.atlas_probability);
      if (probability === null) return null;
      const selectedWon = row.result === "WON" ? 1 : row.result === "LOST" ? 0 : null;
      if (selectedWon === null) return null;
      return Math.abs(probability - selectedWon);
    });
  return average(errors);
}

function recommendation(params: {
  metric: string;
  segment: string;
  sample: number;
  roi: number | null;
  clv: number | null;
  lowSampleSize: boolean;
  projectionError?: number | null;
  calibrationError?: number | null;
}) {
  if (params.lowSampleSize) {
    return `LOW SAMPLE SIZE: observe ${params.metric} ${params.segment}; do not recalibrate or change weights yet.`;
  }
  if (params.projectionError !== undefined) {
    if (params.projectionError === null) return "Projection error unavailable; continue collecting graded games.";
    return params.projectionError > 2
      ? "Projection error is elevated; flag for future research review without changing the model."
      : "Projection error is within the current research tolerance; continue monitoring.";
  }
  if (params.calibrationError !== undefined) {
    if (params.calibrationError === null) return "Moneyline calibration unavailable; continue collecting graded moneyline outcomes.";
    return params.calibrationError > 0.12
      ? "Moneyline calibration error is elevated; flag for later calibration research without changing decisions."
      : "Moneyline calibration is tracking acceptably for research; continue monitoring.";
  }
  if (params.roi !== null && params.roi > 0 && params.clv !== null && params.clv > 0) {
    return `${params.metric} ${params.segment} is positive on ROI and CLV; monitor as a candidate success pattern.`;
  }
  if (params.roi !== null && params.roi < 0) {
    return `${params.metric} ${params.segment} is negative on ROI; monitor as a candidate risk pattern.`;
  }
  return `${params.metric} ${params.segment} has insufficient graded signal for a directional recommendation.`;
}

function confidenceFor(sample: number, lowSampleSize: boolean): "LOW" | "MEDIUM" | "HIGH" {
  if (lowSampleSize || sample < 100) return "LOW";
  if (sample < 250) return "MEDIUM";
  return "HIGH";
}

function insight(params: {
  metric: string;
  segment: string;
  rows: LearningRow[];
  allLowSample: boolean;
  timestamp: string;
  projectionError?: number | null;
  calibrationError?: number | null;
  metadata?: Record<string, unknown>;
}): LearningInsight {
  const item = metrics(params.rows);
  const projection = params.projectionError ?? null;
  const calibration = params.calibrationError ?? null;
  return {
    metric: params.metric,
    segment: params.segment,
    sample: item.sample,
    winRate: item.winRate,
    roi: item.roi,
    clv: item.clv,
    projectionError: projection,
    calibrationError: calibration,
    recommendation: recommendation({
      metric: params.metric,
      segment: params.segment,
      sample: item.sample,
      roi: item.roi,
      clv: item.clv,
      lowSampleSize: params.allLowSample,
      projectionError: params.projectionError,
      calibrationError: params.calibrationError,
    }),
    confidence: confidenceFor(item.sample, params.allLowSample),
    version: MLB_LEARNING_ENGINE_VERSION,
    sourceTables: ["public.mlb_research_validation_history", "public.mlb_performance_analytics"],
    metadata: params.metadata ?? {},
    timestamp: params.timestamp,
  };
}

function groups(rows: LearningRow[], keys: string[], fn: (row: LearningRow) => string) {
  return keys.map((key) => ({ key, rows: rows.filter((row) => fn(row) === key) }));
}

function bestByRoi(insights: LearningInsight[], metric: string) {
  return insights
    .filter((item) => item.metric === metric && item.sample > 0 && item.roi !== null)
    .toSorted((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity))[0]?.segment ?? null;
}

function worstByRoi(insights: LearningInsight[], metric: string) {
  return insights
    .filter((item) => item.metric === metric && item.sample > 0 && item.roi !== null)
    .toSorted((a, b) => (a.roi ?? Infinity) - (b.roi ?? Infinity))[0]?.segment ?? null;
}

export function buildLearningAnalysis(rows: LearningRow[], performanceSnapshot: Record<string, unknown> | null, timestamp = new Date().toISOString()): LearningAnalysis {
  const sampleSize = rows.filter(isGradedPick).length;
  const lowSampleSize = sampleSize < MLB_LEARNING_LOW_SAMPLE_THRESHOLD;
  const insights: LearningInsight[] = [];

  for (const group of groups(rows, ["NO_EDGE", "SMALL_EDGE", "MODERATE_EDGE", "HIGH_EDGE", "EXTREME_EDGE"], (row) => String(row.edge_classification ?? "NO_EDGE"))) {
    insights.push(insight({ metric: "EDGE", segment: group.key, rows: group.rows, allLowSample: lowSampleSize, timestamp }));
  }

  for (const group of groups(rows, ["NONE", "LOW", "MEDIUM", "HIGH"], (row) => String(row.consensus ?? "NONE").toUpperCase())) {
    insights.push(insight({ metric: "CONSENSUS", segment: group.key, rows: group.rows, allLowSample: lowSampleSize, timestamp }));
  }

  for (const group of groups(rows, ["NONE", "LOW", "MEDIUM", "HIGH"], (row) => String(row.conviction ?? "NONE").toUpperCase())) {
    insights.push(insight({ metric: "CONVICTION", segment: group.key, rows: group.rows, allLowSample: lowSampleSize, timestamp }));
  }

  for (const group of groups(rows, ["0-50", "51-60", "61-70", "71-80", "81-90", "91-100"], (row) => confidenceBucket(row.confidence))) {
    insights.push(insight({ metric: "CONFIDENCE", segment: group.key, rows: group.rows, allLowSample: lowSampleSize, timestamp }));
  }

  for (const group of groups(rows, ["HOME_ML", "AWAY_ML", "RUN_LINE", "TOTALS", "NO_PICK"], normalizedDecision)) {
    insights.push(insight({ metric: "DECISION", segment: group.key, rows: group.rows, allLowSample: lowSampleSize, timestamp }));
  }

  const projectedError = projectionError(rows);
  const calibrationError = moneylineCalibrationError(rows);
  insights.push(insight({
    metric: "PROJECTION_ERROR",
    segment: "OVERALL",
    rows,
    allLowSample: lowSampleSize,
    timestamp,
    projectionError: projectedError,
    metadata: { performanceSampleSize: performanceSnapshot?.sample_size ?? performanceSnapshot?.sampleSize ?? null },
  }));
  insights.push(insight({
    metric: "MONEYLINE_CALIBRATION",
    segment: "OVERALL",
    rows: rows.filter((row) => row.market === "MONEYLINE"),
    allLowSample: lowSampleSize,
    timestamp,
    calibrationError,
  }));

  return {
    version: MLB_LEARNING_ENGINE_VERSION,
    timestamp,
    sampleSize,
    lowSampleSize,
    insights,
    bestEdge: bestByRoi(insights, "EDGE"),
    worstEdge: worstByRoi(insights, "EDGE"),
    bestConviction: bestByRoi(insights, "CONVICTION"),
    bestConfidence: bestByRoi(insights, "CONFIDENCE"),
    calibrationError,
    projectionError: projectedError,
  };
}

