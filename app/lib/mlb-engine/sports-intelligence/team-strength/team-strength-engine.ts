import type { MlbTeamBullpenFeatures, OffensiveTeamForm, WeatherParkFeatures } from "../types";

export const TEAM_STRENGTH_VERSION = "team_strength_v1";

export type TeamStrengthConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type TeamStrengthPitcherStatus = "CONFIRMED" | "PROBABLE" | "CHANGED" | "UNKNOWN";
export type TeamStrengthAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

export type TeamStrengthComponentName =
  | "offense"
  | "bullpenQuality"
  | "bullpenReadiness"
  | "lineupStability"
  | "startingPitcherAvailability"
  | "environmentReadiness"
  | "dataConfidence";

export type TeamStrengthComponent = {
  component: TeamStrengthComponentName;
  label: string;
  rawValue?: number | string | Record<string, unknown>;
  normalizedValue?: number;
  weight: number;
  effectiveWeight: number;
  availability: TeamStrengthAvailability;
  confidence?: number;
  warnings: string[];
};

export type TeamStrengthLineupStabilityInput = {
  confirmedLineup?: boolean;
  battingOrderComplete?: boolean;
  playerCount?: number;
  lineupChangesLast7Days?: number;
  lateScratchesLast7Days?: number;
  daysSinceLineupDisruption?: number;
  latestSnapshotAt?: string;
};

export type TeamStrengthInput = {
  teamId: string;
  teamName: string;
  offense?: OffensiveTeamForm;
  bullpen?: MlbTeamBullpenFeatures;
  lineupStability?: TeamStrengthLineupStabilityInput;
  pitcherStatus?: TeamStrengthPitcherStatus;
  weatherPark?: WeatherParkFeatures;
  asOf?: string;
};

export type TeamStrengthSnapshot = {
  teamId: string;
  teamName: string;
  offensiveScore?: number;
  bullpenQuality?: number;
  bullpenFatigue?: number;
  bullpenReadiness?: number;
  lineupStability?: number;
  pitcherStatus: TeamStrengthPitcherStatus;
  weatherConfidence?: number;
  parkEnvironment?: number;
  teamStrength?: number;
  teamConfidence: {
    score?: number;
    tier: TeamStrengthConfidenceTier;
    componentAvailability: number;
    warnings: string[];
  };
  componentBreakdown: TeamStrengthComponent[];
  scoreVersion: typeof TEAM_STRENGTH_VERSION;
  capturedAt: string;
  warnings: string[];
};

const WEIGHTS: Record<TeamStrengthComponentName, number> = {
  offense: 0.24,
  bullpenQuality: 0.18,
  bullpenReadiness: 0.16,
  lineupStability: 0.14,
  startingPitcherAvailability: 0.1,
  environmentReadiness: 0.08,
  dataConfidence: 0.1,
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

function component(input: Omit<TeamStrengthComponent, "effectiveWeight">): TeamStrengthComponent {
  return { ...input, effectiveWeight: 0 };
}

function offenseScore(form: OffensiveTeamForm | undefined) {
  if (!form) return undefined;
  if (isNumber(form.atlasOffensiveScore)) return form.atlasOffensiveScore;
  if (isNumber(form.currentScore)) return form.currentScore;
  const scored = [
    { score: form.last7Score, weight: 0.5 },
    { score: form.last14Score, weight: 0.3 },
    { score: form.last30Score, weight: 0.2 },
  ].filter((item): item is { score: number; weight: number } => isNumber(item.score));
  if (scored.length === 0) return undefined;
  const totalWeight = scored.reduce((sum, item) => sum + item.weight, 0);
  return scored.reduce((sum, item) => sum + item.score * (item.weight / totalWeight), 0);
}

function offenseComponent(form: OffensiveTeamForm | undefined): TeamStrengthComponent {
  const score = offenseScore(form);
  const warnings: string[] = [];
  if (!form) warnings.push("No canonical offensive form snapshot available.");
  if (form && !isNumber(score)) warnings.push("Offensive form exists but Atlas Offensive Score is unavailable.");
  return component({
    component: "offense",
    label: "Offense Component",
    rawValue: isNumber(score) ? round(score) : undefined,
    normalizedValue: isNumber(score) ? round(clamp(score)) : undefined,
    weight: WEIGHTS.offense,
    availability: isNumber(score) ? "AVAILABLE" : form ? "PARTIAL" : "UNAVAILABLE",
    confidence: form?.availability === "AVAILABLE" ? 90 : form ? 55 : 0,
    warnings,
  });
}

function bullpenQualityComponent(team: MlbTeamBullpenFeatures | undefined): TeamStrengthComponent {
  const score = team?.qualityScoreV2 ?? team?.qualityScore;
  return component({
    component: "bullpenQuality",
    label: "Bullpen Quality Component",
    rawValue: isNumber(score) ? round(score) : undefined,
    normalizedValue: isNumber(score) ? round(clamp(score)) : undefined,
    weight: WEIGHTS.bullpenQuality,
    availability: isNumber(score) ? "AVAILABLE" : team ? "PARTIAL" : "UNAVAILABLE",
    confidence: team?.qualityConfidence?.score ?? (team ? 55 : 0),
    warnings: [
      ...(!team ? ["No canonical bullpen snapshot available."] : []),
      ...(team && !isNumber(score) ? ["Bullpen quality score unavailable."] : []),
      ...(team?.qualityConfidence?.warnings ?? []),
    ],
  });
}

function fatigueReadinessTier(fatigue: number | undefined) {
  if (!isNumber(fatigue)) return undefined;
  if (fatigue <= 25) return 92;
  if (fatigue <= 45) return 78;
  if (fatigue <= 65) return 58;
  if (fatigue <= 82) return 38;
  return 22;
}

function bullpenReadinessComponent(team: MlbTeamBullpenFeatures | undefined): TeamStrengthComponent {
  const quality = team?.qualityScoreV2 ?? team?.qualityScore;
  const fatigue = team?.fatigueScoreV2 ?? team?.fatigueScore;
  const fatigueReadiness = fatigueReadinessTier(fatigue);
  const depthScore = team?.effectiveDepth?.depthAvailability === "DEEP"
    ? 90
    : team?.effectiveDepth?.depthAvailability === "ADEQUATE"
      ? 72
      : team?.effectiveDepth?.depthAvailability === "THIN"
        ? 42
        : undefined;
  const parts = [
    isNumber(quality) ? { value: quality, weight: 0.35 } : undefined,
    isNumber(fatigueReadiness) ? { value: fatigueReadiness, weight: 0.45 } : undefined,
    isNumber(depthScore) ? { value: depthScore, weight: 0.2 } : undefined,
  ].filter((item): item is { value: number; weight: number } => Boolean(item));
  const totalWeight = parts.reduce((sum, item) => sum + item.weight, 0);
  const readiness = totalWeight > 0
    ? parts.reduce((sum, item) => sum + item.value * (item.weight / totalWeight), 0)
    : undefined;
  return component({
    component: "bullpenReadiness",
    label: "Bullpen Readiness Component",
    rawValue: {
      quality: isNumber(quality) ? round(quality) : undefined,
      fatigue: isNumber(fatigue) ? round(fatigue) : undefined,
      fatigueReadiness: isNumber(fatigueReadiness) ? round(fatigueReadiness) : undefined,
      depthAvailability: team?.effectiveDepth?.depthAvailability,
    },
    normalizedValue: isNumber(readiness) ? round(clamp(readiness)) : undefined,
    weight: WEIGHTS.bullpenReadiness,
    availability: isNumber(readiness) ? "AVAILABLE" : team ? "PARTIAL" : "UNAVAILABLE",
    confidence: team?.qualityConfidence?.score ?? (team ? 55 : 0),
    warnings: [
      ...(!team ? ["No canonical bullpen readiness inputs available."] : []),
      ...(team && !isNumber(fatigue) ? ["Bullpen fatigue score unavailable."] : []),
      ...(team && !isNumber(quality) ? ["Bullpen quality score unavailable for readiness blend."] : []),
    ],
  });
}

function lineupStabilityComponent(input: TeamStrengthLineupStabilityInput | undefined): TeamStrengthComponent {
  if (!input) {
    return component({
      component: "lineupStability",
      label: "Lineup Stability Component",
      weight: WEIGHTS.lineupStability,
      availability: "UNAVAILABLE",
      confidence: 0,
      warnings: ["No lineup stability evidence available."],
    });
  }

  let score = 50;
  if (input.confirmedLineup) score += 20;
  if (input.battingOrderComplete) score += 12;
  if (isNumber(input.playerCount) && input.playerCount >= 9) score += 8;
  if (isNumber(input.lineupChangesLast7Days)) score -= Math.min(28, input.lineupChangesLast7Days * 7);
  if (isNumber(input.lateScratchesLast7Days)) score -= Math.min(32, input.lateScratchesLast7Days * 16);
  if (isNumber(input.daysSinceLineupDisruption)) score += Math.min(10, input.daysSinceLineupDisruption * 1.5);
  const normalized = clamp(score);

  return component({
    component: "lineupStability",
    label: "Lineup Stability Component",
    rawValue: {
      confirmedLineup: input.confirmedLineup,
      battingOrderComplete: input.battingOrderComplete,
      playerCount: input.playerCount,
      lineupChangesLast7Days: input.lineupChangesLast7Days,
      lateScratchesLast7Days: input.lateScratchesLast7Days,
      daysSinceLineupDisruption: input.daysSinceLineupDisruption,
    },
    normalizedValue: round(normalized),
    weight: WEIGHTS.lineupStability,
    availability: input.confirmedLineup || input.lineupChangesLast7Days !== undefined ? "AVAILABLE" : "PARTIAL",
    confidence: input.confirmedLineup && input.battingOrderComplete ? 85 : 55,
    warnings: [
      ...(!input.confirmedLineup ? ["No confirmed lineup snapshot for latest team evidence."] : []),
      ...(input.lateScratchesLast7Days ? ["Recent late scratch evidence present."] : []),
    ],
  });
}

function pitcherStatusComponent(status: TeamStrengthPitcherStatus | undefined): TeamStrengthComponent {
  const normalized = status === "CONFIRMED" ? 100 : status === "PROBABLE" ? 72 : status === "CHANGED" ? 38 : undefined;
  return component({
    component: "startingPitcherAvailability",
    label: "Starting Pitcher Availability Component",
    rawValue: status ?? "UNKNOWN",
    normalizedValue: normalized,
    weight: WEIGHTS.startingPitcherAvailability,
    availability: normalized === undefined ? "UNAVAILABLE" : "AVAILABLE",
    confidence: normalized === undefined ? 0 : status === "CONFIRMED" ? 95 : status === "PROBABLE" ? 65 : 45,
    warnings: [
      ...(!status || status === "UNKNOWN" ? ["No starter verification evidence available."] : []),
      ...(status === "CHANGED" ? ["Starter verification detected changed status."] : []),
    ],
  });
}

function environmentReadinessComponent(feature: WeatherParkFeatures | undefined): TeamStrengthComponent {
  if (!feature) {
    return component({
      component: "environmentReadiness",
      label: "Environment Readiness Component",
      weight: WEIGHTS.environmentReadiness,
      availability: "UNAVAILABLE",
      confidence: 0,
      warnings: ["No canonical weather or park evidence available."],
    });
  }
  const completeness = [
    feature.forecast ? 35 : 0,
    feature.roof ? 25 : 0,
    feature.roof?.verified ? 15 : 0,
    isNumber(feature.parkEnvironmentScore) ? 15 : 0,
    feature.metadata.availability === "AVAILABLE" ? 10 : feature.metadata.availability === "PARTIAL" ? 5 : 0,
  ].reduce((sum, value) => sum + value, 0);
  return component({
    component: "environmentReadiness",
    label: "Environment Readiness Component",
    rawValue: {
      availability: feature.metadata.availability,
      hasForecast: Boolean(feature.forecast),
      roofType: feature.roof?.roofType,
      roofStatus: feature.roof?.roofStatus,
      roofVerified: feature.roof?.verified,
      parkEnvironmentScore: feature.parkEnvironmentScore,
    },
    normalizedValue: round(clamp(completeness)),
    weight: WEIGHTS.environmentReadiness,
    availability: completeness > 0 ? feature.metadata.availability === "UNAVAILABLE" ? "PARTIAL" : "AVAILABLE" : "UNAVAILABLE",
    confidence: round(clamp(completeness)),
    warnings: [
      ...(!feature.forecast ? ["Forecast unavailable for current canonical environment evidence."] : []),
      ...(!feature.roof?.verified ? ["Roof state is not verified."] : []),
    ],
  });
}

function confidenceComponent(components: TeamStrengthComponent[]): TeamStrengthComponent {
  const usable = components.filter((item) => item.normalizedValue !== undefined);
  const availability = usable.length / Math.max(1, components.length);
  const confidenceValues = components
    .map((item) => item.confidence)
    .filter((value): value is number => isNumber(value));
  const avgConfidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;
  const warningPenalty = Math.min(20, components.reduce((sum, item) => sum + item.warnings.length, 0) * 2);
  const score = clamp(availability * 60 + avgConfidence * 0.4 - warningPenalty);
  return component({
    component: "dataConfidence",
    label: "Data Confidence Component",
    rawValue: {
      availableComponents: usable.length,
      totalComponents: components.length,
      averageComponentConfidence: round(avgConfidence),
      warningCount: components.reduce((sum, item) => sum + item.warnings.length, 0),
    },
    normalizedValue: round(score),
    weight: WEIGHTS.dataConfidence,
    availability: usable.length >= 3 ? "AVAILABLE" : usable.length > 0 ? "PARTIAL" : "UNAVAILABLE",
    confidence: round(score),
    warnings: usable.length < 4 ? ["Fewer than four team strength components are currently available."] : [],
  });
}

export function teamConfidenceTier(score: number | undefined): TeamStrengthConfidenceTier {
  if (!isNumber(score)) return "UNKNOWN";
  if (score >= 78) return "HIGH";
  if (score >= 55) return "MEDIUM";
  if (score >= 30) return "LOW";
  return "UNKNOWN";
}

export function buildTeamStrength(input: TeamStrengthInput): TeamStrengthSnapshot {
  const capturedAt = input.asOf ?? new Date().toISOString();
  const baseComponents = [
    offenseComponent(input.offense),
    bullpenQualityComponent(input.bullpen),
    bullpenReadinessComponent(input.bullpen),
    lineupStabilityComponent(input.lineupStability),
    pitcherStatusComponent(input.pitcherStatus),
    environmentReadinessComponent(input.weatherPark),
  ];
  const components = [...baseComponents, confidenceComponent(baseComponents)];
  const usable = components.filter((item) => item.normalizedValue !== undefined);
  const availableWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  const componentBreakdown = components.map((item) => ({
    ...item,
    effectiveWeight: item.normalizedValue !== undefined && availableWeight > 0 ? round(item.weight / availableWeight, 4) : 0,
  }));
  const teamStrength = usable.length > 0 && availableWeight > 0
    ? round(usable.reduce((sum, item) => sum + (item.normalizedValue ?? 0) * (item.weight / availableWeight), 0))
    : undefined;
  const confidenceScore = componentBreakdown.find((item) => item.component === "dataConfidence")?.normalizedValue;
  const warnings = Array.from(new Set(componentBreakdown.flatMap((item) => item.warnings)));

  return {
    teamId: input.teamId,
    teamName: input.teamName,
    offensiveScore: componentBreakdown.find((item) => item.component === "offense")?.normalizedValue,
    bullpenQuality: componentBreakdown.find((item) => item.component === "bullpenQuality")?.normalizedValue,
    bullpenFatigue: input.bullpen?.fatigueScoreV2 ?? input.bullpen?.fatigueScore,
    bullpenReadiness: componentBreakdown.find((item) => item.component === "bullpenReadiness")?.normalizedValue,
    lineupStability: componentBreakdown.find((item) => item.component === "lineupStability")?.normalizedValue,
    pitcherStatus: input.pitcherStatus ?? "UNKNOWN",
    weatherConfidence: componentBreakdown.find((item) => item.component === "environmentReadiness")?.normalizedValue,
    parkEnvironment: input.weatherPark?.parkEnvironmentScore,
    teamStrength,
    teamConfidence: {
      score: confidenceScore,
      tier: teamConfidenceTier(confidenceScore),
      componentAvailability: round(usable.length / components.length, 3),
      warnings,
    },
    componentBreakdown,
    scoreVersion: TEAM_STRENGTH_VERSION,
    capturedAt,
    warnings,
  };
}

export function teamStrengthDistribution(snapshots: Array<{ teamStrength?: number }>) {
  const values = snapshots.map((item) => item.teamStrength).filter(isNumber).sort((a, b) => a - b);
  if (values.length === 0) return { count: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length,
    min: round(values[0]),
    max: round(values[values.length - 1]),
    mean: round(mean),
    median: round(values[Math.floor(values.length / 2)]),
  };
}
