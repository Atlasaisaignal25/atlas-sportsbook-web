import { TEAM_QUALITY_VERSION, type AtlasGameReadiness, type TeamScoreComponent } from "./team-intelligence-engine";

export const TEAM_QUALITY_RESEARCH_VERSION = "team_quality_v2_research";
export const TEAM_QUALITY_RESEARCH_WEIGHT_VERSION = "tq_research_v1";

export type TeamQualityResearchAvailability = "AVAILABLE" | "PARTIAL" | "LIMITED" | "UNAVAILABLE";
export type TeamQualityResearchConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";

export type TeamQualityResearchWeights = {
  startingPitcherQuality: number;
  offense: number;
  bullpenQuality: number;
};

export const TEAM_QUALITY_RESEARCH_WEIGHTS: Record<"A" | "B" | "C", TeamQualityResearchWeights> = {
  A: { startingPitcherQuality: 0.45, offense: 0.35, bullpenQuality: 0.2 },
  B: { startingPitcherQuality: 0.4, offense: 0.4, bullpenQuality: 0.2 },
  C: { startingPitcherQuality: 0.5, offense: 0.3, bullpenQuality: 0.2 },
};

export const DEFAULT_TEAM_QUALITY_RESEARCH_WEIGHTS = TEAM_QUALITY_RESEARCH_WEIGHTS.A;

export type TeamQualityResearchConfidence = {
  score: number;
  tier: TeamQualityResearchConfidenceTier;
  qualityCoveragePercent: number;
  moduleConfidence: {
    offense?: number;
    startingPitcher?: number;
    bullpen?: number;
  };
  baselineCompatibility: boolean;
  freshnessStatus: string;
  warnings: string[];
};

export type TeamQualityResearchInput = {
  officialGameId?: string;
  teamId: string;
  teamName: string;
  side?: "HOME" | "AWAY";
  offenseScore?: number;
  offenseVersion?: string;
  offenseConfidence?: number;
  startingPitcherQualityScore?: number;
  startingPitcherQualityVersion?: string;
  startingPitcherBaselineVersion?: string;
  startingPitcherBaselineSource?: string;
  startingPitcherId?: string;
  startingPitcherName?: string;
  startingPitcherConfidence?: number;
  bullpenQualityScore?: number;
  bullpenQualityVersion?: string;
  bullpenConfidence?: number;
  gameReadiness?: AtlasGameReadiness;
  weights?: TeamQualityResearchWeights;
  weightVersion?: string;
  asOf?: string;
  warnings?: string[];
};

export type TeamQualityResearchSnapshot = {
  officialGameId?: string;
  teamId: string;
  teamName: string;
  side?: "HOME" | "AWAY";
  version: typeof TEAM_QUALITY_RESEARCH_VERSION;
  weightVersion: string;
  weights: TeamQualityResearchWeights;
  score?: number;
  availability: TeamQualityResearchAvailability;
  offenseScore?: number;
  offenseVersion?: string;
  startingPitcherQualityScore?: number;
  startingPitcherQualityVersion?: string;
  startingPitcherBaselineVersion?: string;
  startingPitcherBaselineSource?: string;
  startingPitcherId?: string;
  startingPitcherName?: string;
  bullpenQualityScore?: number;
  bullpenQualityVersion?: string;
  qualityCoveragePercent: number;
  confidence: TeamQualityResearchConfidence;
  components: {
    offense?: TeamScoreComponent;
    startingPitcherQuality?: TeamScoreComponent;
    bullpenQuality?: TeamScoreComponent;
  };
  gameReadiness?: AtlasGameReadiness;
  warnings: string[];
  capturedAt: string;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function tier(score: number): TeamQualityResearchConfidenceTier {
  if (score >= 82) return "HIGH";
  if (score >= 58) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNAVAILABLE";
}

function normalizedWeights(weights: TeamQualityResearchWeights): TeamQualityResearchWeights {
  const total = weights.startingPitcherQuality + weights.offense + weights.bullpenQuality;
  if (total <= 0) return DEFAULT_TEAM_QUALITY_RESEARCH_WEIGHTS;
  return {
    startingPitcherQuality: round(weights.startingPitcherQuality / total, 4),
    offense: round(weights.offense / total, 4),
    bullpenQuality: round(weights.bullpenQuality / total, 4),
  };
}

function component(input: {
  component: string;
  rawValue?: number | string | Record<string, unknown>;
  value?: number;
  weight: number;
  confidence?: number;
  warnings: string[];
}): TeamScoreComponent {
  return {
    component: input.component,
    rawValue: input.rawValue,
    normalizedValue: isNumber(input.value) ? round(clamp(input.value)) : undefined,
    weight: input.weight,
    effectiveWeight: 0,
    availability: isNumber(input.value) ? "AVAILABLE" : "UNAVAILABLE",
    confidence: input.confidence,
    warnings: input.warnings,
  };
}

function coverageLabel(availableCount: number): TeamQualityResearchAvailability {
  if (availableCount === 3) return "AVAILABLE";
  if (availableCount === 2) return "PARTIAL";
  if (availableCount === 1) return "LIMITED";
  return "UNAVAILABLE";
}

export function buildTeamQualityResearch(input: TeamQualityResearchInput): TeamQualityResearchSnapshot {
  const weights = normalizedWeights(input.weights ?? DEFAULT_TEAM_QUALITY_RESEARCH_WEIGHTS);
  const capturedAt = input.asOf ?? new Date().toISOString();
  const baselineCompatibility =
    input.startingPitcherBaselineSource === "PRODUCTION_BASELINE" &&
    input.startingPitcherBaselineVersion === "starting_pitcher_baseline_v1";
  const warnings = [
    ...(input.warnings ?? []),
    ...(!isNumber(input.offenseScore) ? ["Offense score unavailable for research Team Quality."] : []),
    ...(!isNumber(input.startingPitcherQualityScore) ? ["Starting Pitcher Quality unavailable for research Team Quality."] : []),
    ...(!baselineCompatibility && isNumber(input.startingPitcherQualityScore) ? ["Starting pitcher baseline is not production-compatible."] : []),
    ...(!isNumber(input.bullpenQualityScore) ? ["Bullpen Quality v2 unavailable for research Team Quality."] : []),
  ];
  const components = {
    offense: component({
      component: "offense",
      rawValue: input.offenseVersion ? { score: input.offenseScore, version: input.offenseVersion } : input.offenseScore,
      value: input.offenseScore,
      weight: weights.offense,
      confidence: input.offenseConfidence,
      warnings: !isNumber(input.offenseScore) ? ["Missing offense does not become zero."] : [],
    }),
    startingPitcherQuality: component({
      component: "startingPitcherQuality",
      rawValue: {
        playerId: input.startingPitcherId,
        playerName: input.startingPitcherName,
        score: input.startingPitcherQualityScore,
        version: input.startingPitcherQualityVersion,
        baselineVersion: input.startingPitcherBaselineVersion,
        baselineSource: input.startingPitcherBaselineSource,
      },
      value: baselineCompatibility ? input.startingPitcherQualityScore : undefined,
      weight: weights.startingPitcherQuality,
      confidence: input.startingPitcherConfidence,
      warnings: !baselineCompatibility ? ["Pitcher Quality rejected unless same game/team/side uses production baseline."] : [],
    }),
    bullpenQuality: component({
      component: "bullpenQuality",
      rawValue: input.bullpenQualityVersion ? { score: input.bullpenQualityScore, version: input.bullpenQualityVersion } : input.bullpenQualityScore,
      value: input.bullpenQualityScore,
      weight: weights.bullpenQuality,
      confidence: input.bullpenConfidence,
      warnings: !isNumber(input.bullpenQualityScore) ? ["Missing bullpen quality does not become zero."] : [],
    }),
  };
  const list = [components.startingPitcherQuality, components.offense, components.bullpenQuality];
  const available = list.filter((item) => item.normalizedValue !== undefined);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const qualityCoveragePercent = round((available.length / 3) * 100);
  const availability = coverageLabel(available.length);
  const weightedAverage = availableWeight > 0
    ? available.reduce((sum, item) => sum + (item.normalizedValue ?? 0) * (item.weight / availableWeight), 0)
    : undefined;
  const coveragePenalty = availability === "AVAILABLE" ? 1 : availability === "PARTIAL" ? 0.92 : availability === "LIMITED" ? 0.78 : 0;
  const score = isNumber(weightedAverage) ? round(weightedAverage * coveragePenalty) : undefined;
  const effectiveComponents = list.map((item) => ({
    ...item,
    effectiveWeight: item.normalizedValue !== undefined && availableWeight > 0 ? round(item.weight / availableWeight, 4) : 0,
  }));
  const moduleConfidenceValues = [
    input.offenseConfidence,
    input.startingPitcherConfidence,
    input.bullpenConfidence,
  ].filter(isNumber);
  const moduleConfidenceAverage = moduleConfidenceValues.length
    ? moduleConfidenceValues.reduce((sum, value) => sum + value, 0) / moduleConfidenceValues.length
    : 0;
  const pitcherConfidenceCap = isNumber(input.startingPitcherConfidence)
    ? Math.min(82, input.startingPitcherConfidence)
    : 55;
  const confidenceScore = round(clamp(Math.min(
    moduleConfidenceAverage * 0.65 + qualityCoveragePercent * 0.35,
    pitcherConfidenceCap,
  ) - (warnings.length > 0 ? Math.min(12, warnings.length * 2) : 0)));
  return {
    officialGameId: input.officialGameId,
    teamId: input.teamId,
    teamName: input.teamName,
    side: input.side,
    version: TEAM_QUALITY_RESEARCH_VERSION,
    weightVersion: input.weightVersion ?? TEAM_QUALITY_RESEARCH_WEIGHT_VERSION,
    weights,
    score,
    availability,
    offenseScore: input.offenseScore,
    offenseVersion: input.offenseVersion,
    startingPitcherQualityScore: input.startingPitcherQualityScore,
    startingPitcherQualityVersion: input.startingPitcherQualityVersion,
    startingPitcherBaselineVersion: input.startingPitcherBaselineVersion,
    startingPitcherBaselineSource: input.startingPitcherBaselineSource,
    startingPitcherId: input.startingPitcherId,
    startingPitcherName: input.startingPitcherName,
    bullpenQualityScore: input.bullpenQualityScore,
    bullpenQualityVersion: input.bullpenQualityVersion,
    qualityCoveragePercent,
    confidence: {
      score: confidenceScore,
      tier: availability === "UNAVAILABLE" ? "UNAVAILABLE" : tier(confidenceScore),
      qualityCoveragePercent,
      moduleConfidence: {
        offense: input.offenseConfidence,
        startingPitcher: input.startingPitcherConfidence,
        bullpen: input.bullpenConfidence,
      },
      baselineCompatibility,
      freshnessStatus: "LATEST_CANONICAL_SNAPSHOTS",
      warnings,
    },
    components: {
      startingPitcherQuality: effectiveComponents[0],
      offense: effectiveComponents[1],
      bullpenQuality: effectiveComponents[2],
    },
    gameReadiness: input.gameReadiness,
    warnings,
    capturedAt,
  };
}

export function compareTeamQualityV1V2(input: Array<{
  teamId: string;
  teamName: string;
  officialGameId?: string;
  side?: "HOME" | "AWAY";
  v1Score?: number;
  v2Score?: number;
}>) {
  const rows = input
    .filter((row) => isNumber(row.v1Score) && isNumber(row.v2Score))
    .map((row) => ({ ...row, delta: round((row.v2Score ?? 0) - (row.v1Score ?? 0)) }));
  const abs = rows.map((row) => Math.abs(row.delta)).sort((a, b) => a - b);
  const meanAbs = abs.length ? round(abs.reduce((sum, value) => sum + value, 0) / abs.length) : 0;
  const medianAbs = abs.length ? round(abs[Math.floor((abs.length - 1) * 0.5)]) : 0;
  return {
    compared: rows.length,
    meanAbsoluteDelta: meanAbs,
    medianAbsoluteDelta: medianAbs,
    maxPositiveDelta: rows.toSorted((a, b) => b.delta - a.delta)[0],
    maxNegativeDelta: rows.toSorted((a, b) => a.delta - b.delta)[0],
    changedMoreThan5: rows.filter((row) => Math.abs(row.delta) > 5).length,
    changedMoreThan10: rows.filter((row) => Math.abs(row.delta) > 10).length,
    examples: rows.toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10),
  };
}

export function researchScoreDistribution(values: Array<number | undefined>) {
  const scores = values.filter(isNumber).sort((a, b) => a - b);
  if (scores.length === 0) return { count: 0 };
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance = scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length;
  const percentile = (p: number) => scores[Math.min(scores.length - 1, Math.max(0, Math.floor((scores.length - 1) * p)))];
  return {
    count: scores.length,
    mean: round(mean),
    median: round(percentile(0.5)),
    sd: round(Math.sqrt(variance)),
    min: round(scores[0]),
    max: round(scores[scores.length - 1]),
    p10: round(percentile(0.1)),
    p25: round(percentile(0.25)),
    p75: round(percentile(0.75)),
    p90: round(percentile(0.9)),
  };
}

export function v1Version() {
  return TEAM_QUALITY_VERSION;
}
