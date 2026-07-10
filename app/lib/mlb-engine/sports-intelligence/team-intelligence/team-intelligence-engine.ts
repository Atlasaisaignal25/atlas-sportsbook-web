import type { MlbTeamBullpenFeatures, OffensiveTeamForm, WeatherParkFeatures } from "../types";
import type { TeamStrengthLineupStabilityInput, TeamStrengthPitcherStatus } from "../team-strength/team-strength-engine";

export const TEAM_QUALITY_VERSION = "team_quality_v1";
export const GAME_READINESS_VERSION = "game_readiness_v1";
export const GAME_CONTEXT_CERTAINTY_VERSION = "game_context_certainty_v1";
export const TEAM_INTELLIGENCE_CONFIDENCE_VERSION = "team_intelligence_confidence_v1";

export type IntelligenceAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
export type IntelligenceConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";

export type TeamScoreComponent = {
  component: string;
  rawValue?: number | string | boolean | Record<string, unknown>;
  normalizedValue?: number;
  weight: number;
  effectiveWeight: number;
  availability: IntelligenceAvailability;
  confidence?: number;
  warnings: string[];
};

export type AtlasTeamQuality = {
  score?: number;
  version: typeof TEAM_QUALITY_VERSION;
  components: {
    offense?: TeamScoreComponent;
    bullpenQuality?: TeamScoreComponent;
    startingPitcherQuality?: TeamScoreComponent;
    defense?: TeamScoreComponent;
    baserunning?: TeamScoreComponent;
  };
  availableQualityWeight: number;
  expectedQualityWeight: number;
  qualityCoveragePercent: number;
  availability: IntelligenceAvailability;
  confidence: IntelligenceConfidenceTier;
  warnings: string[];
};

export type AtlasGameReadiness = {
  score?: number;
  version: typeof GAME_READINESS_VERSION;
  components: {
    bullpenReadiness?: TeamScoreComponent;
    lineupReadiness?: TeamScoreComponent;
    starterCertainty?: TeamScoreComponent;
    rosterAvailability?: TeamScoreComponent;
  };
  readinessCoveragePercent: number;
  availability: IntelligenceAvailability;
  confidence: IntelligenceConfidenceTier;
  warnings: string[];
};

export type AtlasGameContextCertainty = {
  score?: number;
  version: typeof GAME_CONTEXT_CERTAINTY_VERSION;
  components: TeamScoreComponent[];
  availability: IntelligenceAvailability;
  warnings: string[];
};

export type AtlasTeamIntelligenceConfidence = {
  score?: number;
  version: typeof TEAM_INTELLIGENCE_CONFIDENCE_VERSION;
  tier: IntelligenceConfidenceTier;
  qualityConfidence: IntelligenceConfidenceTier;
  readinessConfidence: IntelligenceConfidenceTier;
  components: TeamScoreComponent[];
  warnings: string[];
};

export type TeamIntelligenceInput = {
  teamId: string;
  teamName: string;
  side?: "HOME" | "AWAY";
  officialGameId?: string;
  oddsEventId?: string;
  offense?: OffensiveTeamForm;
  bullpen?: MlbTeamBullpenFeatures;
  lineupStability?: TeamStrengthLineupStabilityInput;
  pitcherStatus?: TeamStrengthPitcherStatus;
  weatherPark?: WeatherParkFeatures;
  sourceVersions?: Record<string, string | undefined>;
  asOf?: string;
};

export type TeamIntelligenceSnapshot = {
  officialGameId?: string;
  oddsEventId?: string;
  teamId: string;
  teamName: string;
  side?: "HOME" | "AWAY";
  teamQuality: AtlasTeamQuality;
  gameReadiness: AtlasGameReadiness;
  contextCertainty: AtlasGameContextCertainty;
  intelligenceConfidence: AtlasTeamIntelligenceConfidence;
  sourceVersions: Record<string, string | undefined>;
  warnings: string[];
  capturedAt: string;
};

export const TEAM_QUALITY_WEIGHTS = {
  offense: 0.65,
  bullpenQuality: 0.35,
} as const;

const GAME_READINESS_WEIGHTS = {
  bullpenReadiness: 0.4,
  lineupReadiness: 0.35,
  starterCertainty: 0.25,
} as const;

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

function tier(score: number | undefined): IntelligenceConfidenceTier {
  if (!isNumber(score)) return "UNAVAILABLE";
  if (score >= 78) return "HIGH";
  if (score >= 55) return "MEDIUM";
  if (score >= 25) return "LOW";
  return "UNAVAILABLE";
}

function component(input: Omit<TeamScoreComponent, "effectiveWeight">): TeamScoreComponent {
  return { ...input, effectiveWeight: 0 };
}

function offensiveScore(form: OffensiveTeamForm | undefined) {
  if (!form) return undefined;
  if (isNumber(form.atlasOffensiveScore)) return form.atlasOffensiveScore;
  if (isNumber(form.currentScore)) return form.currentScore;
  if (isNumber(form.last7Score) || isNumber(form.last14Score) || isNumber(form.last30Score)) {
    const scores = [
      { value: form.last7Score, weight: 0.5 },
      { value: form.last14Score, weight: 0.3 },
      { value: form.last30Score, weight: 0.2 },
    ].filter((item): item is { value: number; weight: number } => isNumber(item.value));
    const weight = scores.reduce((sum, item) => sum + item.weight, 0);
    return scores.reduce((sum, item) => sum + item.value * (item.weight / weight), 0);
  }
  return undefined;
}

function qualityScoreWithCoveragePenalty(weightedAverage: number, coveragePercent: number) {
  return clamp(weightedAverage * (0.65 + 0.35 * (coveragePercent / 100)));
}

export function buildTeamQuality(input: TeamIntelligenceInput): AtlasTeamQuality {
  const offense = offensiveScore(input.offense);
  const bullpenQuality = input.bullpen?.qualityScoreV2 ?? input.bullpen?.qualityScore;
  const offenseComponent = component({
    component: "offense",
    rawValue: isNumber(offense) ? round(offense) : undefined,
    normalizedValue: isNumber(offense) ? round(clamp(offense)) : undefined,
    weight: TEAM_QUALITY_WEIGHTS.offense,
    availability: isNumber(offense) ? "AVAILABLE" : input.offense ? "PARTIAL" : "UNAVAILABLE",
    confidence: input.offense?.availability === "AVAILABLE" && isNumber(offense) ? 85 : input.offense ? 45 : 0,
    warnings: [
      ...(!input.offense ? ["Offense quality module unavailable."] : []),
      ...(input.offense && !isNumber(offense) ? ["Offense module exists but Atlas Offensive Score is unavailable."] : []),
    ],
  });
  const bullpenQualityComponent = component({
    component: "bullpenQuality",
    rawValue: isNumber(bullpenQuality) ? round(bullpenQuality) : undefined,
    normalizedValue: isNumber(bullpenQuality) ? round(clamp(bullpenQuality)) : undefined,
    weight: TEAM_QUALITY_WEIGHTS.bullpenQuality,
    availability: isNumber(bullpenQuality) ? "AVAILABLE" : input.bullpen ? "PARTIAL" : "UNAVAILABLE",
    confidence: input.bullpen?.qualityConfidence?.score ?? (input.bullpen ? 45 : 0),
    warnings: [
      ...(!input.bullpen ? ["Bullpen quality module unavailable."] : []),
      ...(input.bullpen && !isNumber(bullpenQuality) ? ["Bullpen quality score unavailable."] : []),
      ...(input.bullpen?.qualityConfidence?.warnings ?? []),
    ],
  });
  const components = [offenseComponent, bullpenQualityComponent];
  const available = components.filter((item) => item.normalizedValue !== undefined);
  const availableQualityWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const expectedQualityWeight = TEAM_QUALITY_WEIGHTS.offense + TEAM_QUALITY_WEIGHTS.bullpenQuality;
  const qualityCoveragePercent = round((availableQualityWeight / expectedQualityWeight) * 100);
  const weightedAverage = availableQualityWeight > 0
    ? available.reduce((sum, item) => sum + (item.normalizedValue ?? 0) * (item.weight / availableQualityWeight), 0)
    : undefined;
  const score = isNumber(weightedAverage) ? round(qualityScoreWithCoveragePenalty(weightedAverage, qualityCoveragePercent)) : undefined;
  const availability: IntelligenceAvailability = available.length === 2 ? "AVAILABLE" : available.length === 1 ? "PARTIAL" : "UNAVAILABLE";
  const confidence: IntelligenceConfidenceTier = availability === "AVAILABLE"
    ? tier(Math.min(95, 65 + qualityCoveragePercent * 0.3))
    : availability === "PARTIAL"
      ? "LOW"
      : "UNAVAILABLE";
  const withEffective = components.map((item) => ({
    ...item,
    effectiveWeight: item.normalizedValue !== undefined && availableQualityWeight > 0 ? round(item.weight / availableQualityWeight, 4) : 0,
  }));
  const warnings = [
    ...withEffective.flatMap((item) => item.warnings),
    ...(availability === "PARTIAL" ? ["Team Quality is partial and carries a coverage penalty."] : []),
    ...(availability === "UNAVAILABLE" ? ["No verified quality module is available."] : []),
  ];

  return {
    score,
    version: TEAM_QUALITY_VERSION,
    components: {
      offense: withEffective[0],
      bullpenQuality: withEffective[1],
      startingPitcherQuality: undefined,
      defense: undefined,
      baserunning: undefined,
    },
    availableQualityWeight: round(availableQualityWeight, 4),
    expectedQualityWeight,
    qualityCoveragePercent,
    availability,
    confidence,
    warnings,
  };
}

function fatigueReadiness(fatigue: number | undefined) {
  if (!isNumber(fatigue)) return undefined;
  if (fatigue <= 25) return 92;
  if (fatigue <= 45) return 78;
  if (fatigue <= 65) return 58;
  if (fatigue <= 82) return 38;
  return 22;
}

function bullpenReadiness(input: TeamIntelligenceInput): TeamScoreComponent {
  const fatigue = input.bullpen?.fatigueScoreV2 ?? input.bullpen?.fatigueScore;
  const fatigueScore = fatigueReadiness(fatigue);
  const depthScore = input.bullpen?.effectiveDepth?.depthAvailability === "DEEP"
    ? 90
    : input.bullpen?.effectiveDepth?.depthAvailability === "ADEQUATE"
      ? 72
      : input.bullpen?.effectiveDepth?.depthAvailability === "THIN"
        ? 42
        : undefined;
  const parts = [
    isNumber(fatigueScore) ? { value: fatigueScore, weight: 0.7 } : undefined,
    isNumber(depthScore) ? { value: depthScore, weight: 0.3 } : undefined,
  ].filter((item): item is { value: number; weight: number } => Boolean(item));
  const total = parts.reduce((sum, item) => sum + item.weight, 0);
  const score = total > 0 ? parts.reduce((sum, item) => sum + item.value * (item.weight / total), 0) : undefined;
  return component({
    component: "bullpenReadiness",
    rawValue: {
      fatigue,
      fatigueReadiness: fatigueScore,
      depthAvailability: input.bullpen?.effectiveDepth?.depthAvailability,
    },
    normalizedValue: isNumber(score) ? round(score) : undefined,
    weight: GAME_READINESS_WEIGHTS.bullpenReadiness,
    availability: isNumber(score) ? "AVAILABLE" : input.bullpen ? "PARTIAL" : "UNAVAILABLE",
    confidence: isNumber(score) ? 75 : input.bullpen ? 40 : 0,
    warnings: [
      ...(!input.bullpen ? ["Bullpen readiness inputs unavailable."] : []),
      ...(input.bullpen && !isNumber(fatigue) ? ["Bullpen fatigue score unavailable."] : []),
    ],
  });
}

function lineupReadiness(input: TeamIntelligenceInput): TeamScoreComponent {
  const lineup = input.lineupStability;
  if (!lineup) {
    return component({
      component: "lineupReadiness",
      weight: GAME_READINESS_WEIGHTS.lineupReadiness,
      availability: "UNAVAILABLE",
      confidence: 0,
      warnings: ["Lineup readiness evidence unavailable."],
    });
  }
  let score = 45;
  if (lineup.confirmedLineup) score += 25;
  if (lineup.battingOrderComplete) score += 15;
  if (isNumber(lineup.playerCount) && lineup.playerCount >= 9) score += 10;
  if (lineup.lineupChangesLast7Days) score -= Math.min(25, lineup.lineupChangesLast7Days * 6);
  if (lineup.lateScratchesLast7Days) score -= Math.min(35, lineup.lateScratchesLast7Days * 18);
  if (isNumber(lineup.daysSinceLineupDisruption)) score += Math.min(8, lineup.daysSinceLineupDisruption);
  return component({
    component: "lineupReadiness",
    rawValue: lineup as Record<string, unknown>,
    normalizedValue: round(clamp(score)),
    weight: GAME_READINESS_WEIGHTS.lineupReadiness,
    availability: lineup.confirmedLineup || lineup.lineupChangesLast7Days !== undefined ? "AVAILABLE" : "PARTIAL",
    confidence: lineup.confirmedLineup && lineup.battingOrderComplete ? 85 : 50,
    warnings: [
      ...(!lineup.confirmedLineup ? ["Official lineup is not confirmed."] : []),
      ...(lineup.lateScratchesLast7Days ? ["Recent late scratch evidence present."] : []),
    ],
  });
}

function starterCertainty(input: TeamIntelligenceInput): TeamScoreComponent {
  const status = input.pitcherStatus ?? "UNKNOWN";
  const score = status === "CONFIRMED" ? 100 : status === "PROBABLE" ? 72 : status === "CHANGED" ? 32 : undefined;
  return component({
    component: "starterCertainty",
    rawValue: status,
    normalizedValue: score,
    weight: GAME_READINESS_WEIGHTS.starterCertainty,
    availability: score === undefined ? "UNAVAILABLE" : "AVAILABLE",
    confidence: score === undefined ? 0 : status === "CONFIRMED" ? 95 : status === "PROBABLE" ? 65 : 35,
    warnings: [
      ...(status === "UNKNOWN" ? ["Starter certainty unavailable."] : []),
      ...(status === "CHANGED" ? ["Starter changed warning present."] : []),
    ],
  });
}

export function buildGameReadiness(input: TeamIntelligenceInput): AtlasGameReadiness {
  const components = [bullpenReadiness(input), lineupReadiness(input), starterCertainty(input)];
  const usable = components.filter((item) => item.normalizedValue !== undefined);
  const availableWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  const score = availableWeight > 0
    ? round(usable.reduce((sum, item) => sum + (item.normalizedValue ?? 0) * (item.weight / availableWeight), 0))
    : undefined;
  const withEffective = components.map((item) => ({
    ...item,
    effectiveWeight: item.normalizedValue !== undefined && availableWeight > 0 ? round(item.weight / availableWeight, 4) : 0,
  }));
  const readinessCoveragePercent = round((availableWeight / 1) * 100);
  const availability: IntelligenceAvailability = readinessCoveragePercent >= 85 ? "AVAILABLE" : readinessCoveragePercent > 0 ? "PARTIAL" : "UNAVAILABLE";
  const confidence = availability === "AVAILABLE" ? tier(Math.min(92, 55 + readinessCoveragePercent * 0.35)) : availability === "PARTIAL" ? "LOW" : "UNAVAILABLE";
  return {
    score,
    version: GAME_READINESS_VERSION,
    components: {
      bullpenReadiness: withEffective[0],
      lineupReadiness: withEffective[1],
      starterCertainty: withEffective[2],
      rosterAvailability: undefined,
    },
    readinessCoveragePercent,
    availability,
    confidence,
    warnings: [
      ...withEffective.flatMap((item) => item.warnings),
      ...(availability === "PARTIAL" ? ["Game Readiness is partial because one or more operational modules are missing."] : []),
    ],
  };
}

export function buildContextCertainty(input: TeamIntelligenceInput): AtlasGameContextCertainty {
  const feature = input.weatherPark;
  const components = [
    component({
      component: "officialGameMapping",
      rawValue: { officialGameId: input.officialGameId ?? feature?.officialGameId, oddsEventId: input.oddsEventId },
      normalizedValue: input.officialGameId || feature?.officialGameId ? 100 : undefined,
      weight: 0.2,
      availability: input.officialGameId || feature?.officialGameId ? "AVAILABLE" : "UNAVAILABLE",
      confidence: input.officialGameId || feature?.officialGameId ? 90 : 0,
      warnings: input.officialGameId || feature?.officialGameId ? [] : ["Official game mapping unavailable."],
    }),
    component({
      component: "venueResolved",
      rawValue: feature?.venueId,
      normalizedValue: feature?.venueId ? 100 : undefined,
      weight: 0.2,
      availability: feature?.venueId ? "AVAILABLE" : "UNAVAILABLE",
      confidence: feature?.venueId ? 90 : 0,
      warnings: feature?.venueId ? [] : ["Venue not resolved."],
    }),
    component({
      component: "forecastAvailable",
      rawValue: Boolean(feature?.forecast),
      normalizedValue: feature?.forecast ? 100 : undefined,
      weight: 0.25,
      availability: feature?.forecast ? "AVAILABLE" : "UNAVAILABLE",
      confidence: feature?.forecast ? 85 : 0,
      warnings: feature?.forecast ? [] : ["Forecast unavailable."],
    }),
    component({
      component: "roofCertainty",
      rawValue: feature?.roof ? { roofType: feature.roof.roofType, roofStatus: feature.roof.roofStatus, verified: feature.roof.verified } : undefined,
      normalizedValue: feature?.roof?.verified ? 100 : feature?.roof ? 60 : undefined,
      weight: 0.2,
      availability: feature?.roof ? "AVAILABLE" : "UNAVAILABLE",
      confidence: feature?.roof?.verified ? 90 : feature?.roof ? 55 : 0,
      warnings: feature?.roof?.verified ? [] : ["Roof certainty is incomplete."],
    }),
    component({
      component: "parkFactorAvailability",
      rawValue: feature?.parkEnvironmentScore,
      normalizedValue: isNumber(feature?.parkEnvironmentScore) ? 100 : undefined,
      weight: 0.15,
      availability: isNumber(feature?.parkEnvironmentScore) ? "AVAILABLE" : "UNAVAILABLE",
      confidence: isNumber(feature?.parkEnvironmentScore) ? 80 : 0,
      warnings: isNumber(feature?.parkEnvironmentScore) ? [] : ["Park environment data unavailable."],
    }),
  ];
  const usable = components.filter((item) => item.normalizedValue !== undefined);
  const availableWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  const withEffective = components.map((item) => ({
    ...item,
    effectiveWeight: item.normalizedValue !== undefined && availableWeight > 0 ? round(item.weight / availableWeight, 4) : 0,
  }));
  const score = availableWeight > 0
    ? round(usable.reduce((sum, item) => sum + (item.normalizedValue ?? 0) * (item.weight / availableWeight), 0) * availableWeight)
    : undefined;
  const availability: IntelligenceAvailability = availableWeight >= 0.8 ? "AVAILABLE" : availableWeight > 0 ? "PARTIAL" : "UNAVAILABLE";
  return {
    score,
    version: GAME_CONTEXT_CERTAINTY_VERSION,
    components: withEffective,
    availability,
    warnings: withEffective.flatMap((item) => item.warnings),
  };
}

export function buildIntelligenceConfidence(input: {
  quality: AtlasTeamQuality;
  readiness: AtlasGameReadiness;
  contextCertainty: AtlasGameContextCertainty;
  canonicalModuleCount?: number;
  warnings?: string[];
}): AtlasTeamIntelligenceConfidence {
  const components = [
    component({
      component: "qualityCoverage",
      rawValue: input.quality.qualityCoveragePercent,
      normalizedValue: input.quality.availability === "UNAVAILABLE" ? undefined : input.quality.qualityCoveragePercent,
      weight: 0.35,
      availability: input.quality.availability,
      confidence: input.quality.qualityCoveragePercent,
      warnings: input.quality.warnings,
    }),
    component({
      component: "readinessCoverage",
      rawValue: input.readiness.readinessCoveragePercent,
      normalizedValue: input.readiness.availability === "UNAVAILABLE" ? undefined : input.readiness.readinessCoveragePercent,
      weight: 0.3,
      availability: input.readiness.availability,
      confidence: input.readiness.readinessCoveragePercent,
      warnings: input.readiness.warnings,
    }),
    component({
      component: "contextCertainty",
      rawValue: input.contextCertainty.score,
      normalizedValue: input.contextCertainty.score,
      weight: 0.2,
      availability: input.contextCertainty.availability,
      confidence: input.contextCertainty.score,
      warnings: input.contextCertainty.warnings,
    }),
    component({
      component: "warningPenalty",
      rawValue: input.warnings?.length ?? 0,
      normalizedValue: clamp(100 - Math.min(60, (input.warnings?.length ?? 0) * 5)),
      weight: 0.15,
      availability: "AVAILABLE",
      confidence: clamp(100 - Math.min(60, (input.warnings?.length ?? 0) * 5)),
      warnings: input.warnings ?? [],
    }),
  ];
  const usable = components.filter((item) => item.normalizedValue !== undefined);
  const availableWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  const withEffective = components.map((item) => ({
    ...item,
    effectiveWeight: item.normalizedValue !== undefined && availableWeight > 0 ? round(item.weight / availableWeight, 4) : 0,
  }));
  const score = availableWeight > 0
    ? round(usable.reduce((sum, item) => sum + (item.normalizedValue ?? 0) * (item.weight / availableWeight), 0))
    : undefined;
  return {
    score,
    version: TEAM_INTELLIGENCE_CONFIDENCE_VERSION,
    tier: tier(score),
    qualityConfidence: input.quality.confidence,
    readinessConfidence: input.readiness.confidence,
    components: withEffective,
    warnings: Array.from(new Set(withEffective.flatMap((item) => item.warnings))),
  };
}

export function buildTeamIntelligence(input: TeamIntelligenceInput): TeamIntelligenceSnapshot {
  const capturedAt = input.asOf ?? new Date().toISOString();
  const teamQuality = buildTeamQuality(input);
  const gameReadiness = buildGameReadiness(input);
  const contextCertainty = buildContextCertainty(input);
  const warnings = Array.from(new Set([
    ...teamQuality.warnings,
    ...gameReadiness.warnings,
    ...contextCertainty.warnings,
  ]));
  const intelligenceConfidence = buildIntelligenceConfidence({
    quality: teamQuality,
    readiness: gameReadiness,
    contextCertainty,
    warnings,
  });
  return {
    officialGameId: input.officialGameId ?? input.weatherPark?.officialGameId,
    oddsEventId: input.oddsEventId,
    teamId: input.teamId,
    teamName: input.teamName,
    side: input.side,
    teamQuality,
    gameReadiness,
    contextCertainty,
    intelligenceConfidence,
    sourceVersions: {
      teamQuality: TEAM_QUALITY_VERSION,
      gameReadiness: GAME_READINESS_VERSION,
      contextCertainty: GAME_CONTEXT_CERTAINTY_VERSION,
      intelligenceConfidence: TEAM_INTELLIGENCE_CONFIDENCE_VERSION,
      ...input.sourceVersions,
    },
    warnings: Array.from(new Set([...warnings, ...intelligenceConfidence.warnings])),
    capturedAt,
  };
}

export function intelligenceScoreDistribution(values: Array<number | undefined>) {
  const scores = values.filter(isNumber).sort((a, b) => a - b);
  if (scores.length === 0) return { count: 0 };
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance = scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length;
  const percentile = (p: number) => scores[Math.min(scores.length - 1, Math.max(0, Math.floor((scores.length - 1) * p)))];
  return {
    count: scores.length,
    min: round(scores[0]),
    max: round(scores[scores.length - 1]),
    mean: round(mean),
    median: round(percentile(0.5)),
    sd: round(Math.sqrt(variance)),
    p10: round(percentile(0.1)),
    p25: round(percentile(0.25)),
    p75: round(percentile(0.75)),
    p90: round(percentile(0.9)),
  };
}
