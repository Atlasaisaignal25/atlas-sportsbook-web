import type {
  BullpenFatigueComponent,
  BullpenQualityComponent,
  EffectiveReliefDepth,
  MlbRelieverAppearance,
  MlbRelieverWorkload,
  MlbTeamBullpenFeatures,
  RelieverFatigueEstimate,
} from "../types";

export const BULLPEN_FATIGUE_SCORE_VERSION_V2 = "bullpen_fatigue_v2";
export const RELIEVER_FATIGUE_SCORE_VERSION = "reliever_fatigue_v1";
export const BULLPEN_QUALITY_SCORE_VERSION = "bullpen_quality_v1";

function round(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function ageDays(asOf: string, gameDate: string) {
  const a = new Date(`${asOf.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${gameDate.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((a - b) / 86_400_000);
}

function inWindow(appearances: MlbRelieverAppearance[], asOf: string, days: number) {
  return appearances.filter((appearance) => {
    const age = ageDays(asOf, appearance.gameDate);
    return age >= 0 && age <= days;
  });
}

function sum(values: Array<number | undefined>) {
  const numeric = values.filter((value): value is number => Number.isFinite(value));
  if (numeric.length === 0) return undefined;
  return numeric.reduce((total, value) => total + value, 0);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

export function distribution(values: Array<number | undefined>) {
  const numeric = values.filter((value): value is number => Number.isFinite(value)).sort((a, b) => a - b);
  if (numeric.length === 0) return { count: 0 };
  const mean = numeric.reduce((total, value) => total + value, 0) / numeric.length;
  const variance = numeric.reduce((total, value) => total + (value - mean) ** 2, 0) / numeric.length;
  const median = numeric.length % 2
    ? numeric[Math.floor(numeric.length / 2)]
    : (numeric[numeric.length / 2 - 1] + numeric[numeric.length / 2]) / 2;
  return {
    count: numeric.length,
    mean: round(mean, 2),
    median: round(median, 2),
    standardDeviation: round(Math.sqrt(variance), 2),
    minimum: numeric[0],
    maximum: numeric.at(-1),
    p10: percentile(numeric, 0.1),
    p25: percentile(numeric, 0.25),
    p75: percentile(numeric, 0.75),
    p90: percentile(numeric, 0.9),
  };
}

export function rawBullpenWorkloadDistribution(teams: MlbTeamBullpenFeatures[]) {
  const relieverSum = (team: MlbTeamBullpenFeatures, key: keyof MlbRelieverWorkload) =>
    sum(team.relievers.map((reliever) => reliever[key] as number | undefined));
  return {
    totalPitchesLast1Day: distribution(teams.map((team) => relieverSum(team, "pitchesLast1Day"))),
    totalPitchesLast2Days: distribution(teams.map((team) => relieverSum(team, "pitchesLast2Days"))),
    totalPitchesLast3Days: distribution(teams.map((team) => team.totalPitchesLast3Days)),
    totalPitchesLast7Days: distribution(teams.map((team) => relieverSum(team, "pitchesLast7Days"))),
    bullpenInningsLast3Days: distribution(teams.map((team) => team.totalInningsLast3Days)),
    bullpenInningsLast7Days: distribution(teams.map((team) => relieverSum(team, "inningsLast7Days"))),
    relieversUsedLast1Day: distribution(teams.map((team) => team.relieversUsedLast1Day)),
    relieversUsedLast2Days: distribution(teams.map((team) => team.relieversUsedLast2Days)),
    relieversUsedLast3Days: distribution(teams.map((team) => team.relieversUsedLast3Days)),
    relieversOnConsecutiveDays: distribution(teams.map((team) => team.relieversOnConsecutiveDays)),
    heavyWorkloadRelievers: distribution(teams.map((team) => team.relieversWithHeavyWorkload)),
    highLeverageCandidates: distribution(teams.map((team) => team.highLeverageRelievers.length)),
  };
}

export function fatigueDistribution(teams: MlbTeamBullpenFeatures[]) {
  return distribution(teams.map((team) => team.fatigueScore));
}

function tier(score: number | undefined): RelieverFatigueEstimate["fatigueTier"] {
  if (score === undefined) return "UNKNOWN";
  if (score <= 20) return "RESTED";
  if (score <= 45) return "NORMAL";
  if (score <= 70) return "ELEVATED";
  return "HIGH";
}

export function estimateRelieverFatigue(reliever: MlbRelieverWorkload): RelieverFatigueEstimate {
  const previousDayLoad = clamp(((reliever.pitchesLast1Day ?? 0) / 35) * 100);
  const threeDayLoad = clamp(((reliever.pitchesLast3Days ?? 0) / 75) * 100);
  const consecutiveDays = clamp((reliever.consecutiveDaysUsed / 3) * 100);
  const multiInningUsage = clamp(((reliever.inningsLast3Days ?? 0) / 4) * 100);
  const recencyRecovery = reliever.appearancesLast2Days === 0 ? 0 : reliever.appearancesLast1Day > 0 ? 45 : 20;
  const confidence = reliever.pitchesLast3Days === undefined ? 65 : 95;
  const baseScore =
    previousDayLoad * 0.28 +
    threeDayLoad * 0.3 +
    consecutiveDays * 0.22 +
    multiInningUsage * 0.12 +
    recencyRecovery * 0.08;
  const score = round(reliever.consecutiveDaysUsed >= 3 ? Math.max(baseScore, 75) : baseScore, 1);
  return {
    playerId: reliever.playerId,
    playerName: reliever.playerName,
    fatigueScore: score,
    fatigueTier: tier(score),
    confidence,
    components: {
      previousDayLoad: round(previousDayLoad, 1),
      threeDayLoad: round(threeDayLoad, 1),
      consecutiveDays: round(consecutiveDays, 1),
      multiInningUsage: round(multiInningUsage, 1),
      recencyRecovery: round(recencyRecovery, 1),
    },
    warnings: reliever.warnings,
  };
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function teamFatigueV2Components(team: MlbTeamBullpenFeatures): BullpenFatigueComponent[] {
  const estimates = team.relieverFatigue ?? team.relievers.map(estimateRelieverFatigue);
  const scores = estimates.map((item) => item.fatigueScore).filter((value): value is number => Number.isFinite(value));
  const elevatedOrHigh = estimates.filter((item) => item.fatigueTier === "ELEVATED" || item.fatigueTier === "HIGH").length;
  const high = estimates.filter((item) => item.fatigueTier === "HIGH").length;
  const rested = estimates.filter((item) => item.fatigueTier === "RESTED").length;
  const closerScore = team.closerCandidate
    ? estimates.find((item) => item.playerId === team.closerCandidate?.playerId)?.fatigueScore
    : undefined;
  const highLeverageScores = team.highLeverageRelievers
    .map((item) => estimates.find((estimate) => estimate.playerId === item.playerId)?.fatigueScore)
    .filter((value): value is number => Number.isFinite(value));
  const perGamePitches = team.bullpenPitchesPerGameLast3;
  const components: BullpenFatigueComponent[] = [];
  const add = (component: string, rawValue: number | undefined, normalizedScore: number | undefined, weight: number) => {
    if (rawValue === undefined || normalizedScore === undefined) return;
    components.push({ component, rawValue: round(rawValue, 2), normalizedScore: round(clamp(normalizedScore), 1) ?? 0, weight });
  };
  add("averageRelieverFatigue", average(scores), average(scores), 0.24);
  add("elevatedOrHighRelievers", elevatedOrHigh, (elevatedOrHigh / Math.max(1, team.relievers.length)) * 100, 0.14);
  add("highFatigueRelievers", high, (high / Math.max(1, team.relievers.length)) * 100, 0.12);
  add("closerCandidateFatigue", closerScore, closerScore, 0.1);
  add("highLeverageFatigue", average(highLeverageScores), average(highLeverageScores), 0.1);
  add("absolutePitchesLast3Days", team.totalPitchesLast3Days, ((team.totalPitchesLast3Days ?? 0) / 260) * 100, 0.12);
  add("pitchesPerGameLast3Days", perGamePitches, ((perGamePitches ?? 0) / 95) * 100, 0.1);
  add("relieversUsedPerGameLast3Days", team.relieverUsagePerGameLast3, ((team.relieverUsagePerGameLast3 ?? 0) / 4.2) * 100, 0.05);
  add("restedRelieverBuffer", rested, clamp(100 - (rested / Math.max(1, team.relievers.length)) * 100), 0.03);
  return components;
}

export function effectiveDepth(team: MlbTeamBullpenFeatures): EffectiveReliefDepth {
  const estimates = team.relieverFatigue ?? team.relievers.map(estimateRelieverFatigue);
  const restedRelieverCount = estimates.filter((item) => item.fatigueTier === "RESTED").length;
  const normalRelieverCount = estimates.filter((item) => item.fatigueTier === "NORMAL").length;
  const elevatedFatigueCount = estimates.filter((item) => item.fatigueTier === "ELEVATED").length;
  const highFatigueCount = estimates.filter((item) => item.fatigueTier === "HIGH").length;
  const availableHighLeverageCandidates = team.highLeverageRelievers.filter((candidate) => {
    const estimate = estimates.find((item) => item.playerId === candidate.playerId);
    return estimate?.fatigueTier === "RESTED" || estimate?.fatigueTier === "NORMAL";
  }).length;
  const usable = restedRelieverCount + normalRelieverCount;
  return {
    restedRelieverCount,
    normalRelieverCount,
    elevatedFatigueCount,
    highFatigueCount,
    availableHighLeverageCandidates,
    qualityRelieversWithLowFatigue: undefined,
    depthAvailability: estimates.length === 0
      ? "UNKNOWN"
      : usable >= 7 && availableHighLeverageCandidates >= 3 && highFatigueCount <= 1
        ? "DEEP"
        : usable >= 5 && highFatigueCount <= 3
          ? "ADEQUATE"
          : "THIN",
  };
}

export function applyBullpenFatigueV2(team: MlbTeamBullpenFeatures) {
  const relieverFatigue = team.relievers.map(estimateRelieverFatigue);
  const withRelievers = { ...team, relieverFatigue };
  const components = teamFatigueV2Components(withRelievers);
  const totalWeight = components.reduce((total, item) => total + item.weight, 0);
  const score = totalWeight > 0
    ? components.reduce((total, item) => total + item.normalizedScore * item.weight, 0) / totalWeight
    : undefined;
  const completenessPenalty = (team.metadata.appearancesMissingPitchCounts ?? 0) > 0
    ? Math.min(5, (team.metadata.appearancesMissingPitchCounts ?? 0))
    : 0;
  return {
    ...withRelievers,
    fatigueScoreV1: team.fatigueScoreV1 ?? (team.fatigueScoreVersion === "bullpen_fatigue_v1" ? team.fatigueScore : undefined),
    fatigueScoreV2: score === undefined ? undefined : round(clamp(score + completenessPenalty), 1),
    fatigueScore: score === undefined ? undefined : round(clamp(score + completenessPenalty), 1),
    fatigueScoreVersion: BULLPEN_FATIGUE_SCORE_VERSION_V2,
    fatigueComponents: components,
    effectiveDepth: effectiveDepth(withRelievers),
  };
}

type QualityRaw = {
  reliefInnings?: number;
  earnedRuns?: number;
  hits?: number;
  walks?: number;
  strikeouts?: number;
  homeRuns?: number;
  battersFaced?: number;
  saves?: number;
  holds?: number;
  blownSaves?: number;
};

function qualityRaw(appearances: MlbRelieverAppearance[]): QualityRaw {
  return {
    reliefInnings: sum(appearances.map((appearance) => appearance.inningsPitched)),
    earnedRuns: sum(appearances.map((appearance) => appearance.earnedRunsAllowed)),
    hits: sum(appearances.map((appearance) => appearance.hitsAllowed)),
    walks: sum(appearances.map((appearance) => appearance.walksAllowed)),
    strikeouts: sum(appearances.map((appearance) => appearance.strikeouts)),
    battersFaced: sum(appearances.map((appearance) => appearance.battersFaced)),
    saves: appearances.filter((appearance) => appearance.save).length,
    holds: appearances.filter((appearance) => appearance.hold).length,
    blownSaves: appearances.filter((appearance) => appearance.blownSave).length,
  };
}

function qualityMetrics(raw: QualityRaw) {
  const innings = raw.reliefInnings;
  const bf = raw.battersFaced;
  return {
    era: innings ? ((raw.earnedRuns ?? 0) * 9) / innings : undefined,
    whip: innings ? ((raw.hits ?? 0) + (raw.walks ?? 0)) / innings : undefined,
    strikeoutRate: bf ? (raw.strikeouts ?? 0) / bf : undefined,
    walkRate: bf ? (raw.walks ?? 0) / bf : undefined,
    kMinusBbRate: bf ? ((raw.strikeouts ?? 0) - (raw.walks ?? 0)) / bf : undefined,
    hitsPerBatterFaced: bf ? (raw.hits ?? 0) / bf : undefined,
    runsAllowedPerInning: innings ? (raw.earnedRuns ?? 0) / innings : undefined,
    leverageExecution: ((raw.saves ?? 0) + (raw.holds ?? 0) + (raw.blownSaves ?? 0)) > 0
      ? ((raw.saves ?? 0) + (raw.holds ?? 0)) / ((raw.saves ?? 0) + (raw.holds ?? 0) + (raw.blownSaves ?? 0))
      : undefined,
  };
}

function normalizeMetric(value: number | undefined, mean: number | undefined, sd: number | undefined, higherIsBetter: boolean) {
  if (value === undefined || mean === undefined || !sd || sd <= 0.000001) return undefined;
  const z = clamp((value - mean) / sd, -3, 3);
  return higherIsBetter ? 50 + z * 12.5 : 50 - z * 12.5;
}

export function applyBullpenQualityScores(teams: MlbTeamBullpenFeatures[], appearancesByTeam: Map<string, MlbRelieverAppearance[]>) {
  const metricRows = teams.map((team) => {
    const appearances = appearancesByTeam.get(team.teamId)?.filter((appearance) => appearance.reliefAppearance) ?? [];
    const last7 = inWindow(appearances, team.metadata.observedAt ?? new Date().toISOString(), 7);
    const last14 = inWindow(appearances, team.metadata.observedAt ?? new Date().toISOString(), 14);
    return {
      team,
      appearances,
      season: qualityMetrics(qualityRaw(appearances)),
      last14: qualityMetrics(qualityRaw(last14)),
      last7: qualityMetrics(qualityRaw(last7)),
      raw: qualityRaw(appearances),
    };
  });
  const metricNames = ["era", "whip", "strikeoutRate", "walkRate", "kMinusBbRate", "hitsPerBatterFaced", "runsAllowedPerInning", "leverageExecution"] as const;
  const baselines = Object.fromEntries(metricNames.map((metric) => {
    const values = metricRows.map((row) => row.season[metric]).filter((value): value is number => Number.isFinite(value));
    const dist = distribution(values);
    return [metric, { mean: dist.mean, sd: dist.standardDeviation }];
  }));
  return metricRows.map(({ team, season, last14, last7, raw }) => {
    const sampleWarnings: string[] = [];
    const reliefInnings = raw.reliefInnings ?? 0;
    const battersFaced = raw.battersFaced ?? 0;
    if (reliefInnings < 15 || battersFaced < 60) sampleWarnings.push("Relief sample below quality scoring threshold.");
    const availability: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" = reliefInnings >= 15 && battersFaced >= 60 ? "AVAILABLE" : reliefInnings > 0 ? "PARTIAL" : "UNAVAILABLE";
    const components: BullpenQualityComponent[] = [];
    const add = (component: string, value: number | undefined, metric: keyof typeof baselines, weight: number, higherIsBetter: boolean, recentBoost = 0) => {
      const normalized = normalizeMetric(value, baselines[metric].mean, baselines[metric].sd, higherIsBetter);
      if (normalized === undefined) return;
      components.push({ component, rawValue: round(value, 4), normalizedScore: round(clamp(normalized + recentBoost), 1) ?? 0, weight, higherIsBetter });
    };
    const recentFormBoost = (last14.kMinusBbRate !== undefined && season.kMinusBbRate !== undefined)
      ? clamp((last14.kMinusBbRate - season.kMinusBbRate) * 100, -8, 8)
      : 0;
    add("runPreventionEra", season.era, "era", 0.18, false);
    add("trafficWhip", season.whip, "whip", 0.18, false);
    add("strikeoutRate", season.strikeoutRate, "strikeoutRate", 0.14, true);
    add("walkRate", season.walkRate, "walkRate", 0.12, false);
    add("kMinusBbRate", season.kMinusBbRate, "kMinusBbRate", 0.18, true, recentFormBoost);
    add("hitsPerBatterFaced", season.hitsPerBatterFaced, "hitsPerBatterFaced", 0.1, false);
    add("recentRunPrevention", last7.runsAllowedPerInning, "runsAllowedPerInning", 0.06, false);
    add("highLeverageExecution", season.leverageExecution, "leverageExecution", 0.04, true);
    const totalWeight = components.reduce((total, item) => total + item.weight, 0);
    const qualityScore = availability === "AVAILABLE" && totalWeight > 0
      ? round(components.reduce((total, item) => total + item.normalizedScore * item.weight, 0) / totalWeight, 1)
      : undefined;
    return {
      ...team,
      qualityScore,
      qualityScoreVersion: BULLPEN_QUALITY_SCORE_VERSION,
      qualityComponents: components,
      qualitySample: {
        availability,
        seasonReliefInnings: round(reliefInnings, 2),
        recentReliefInnings: round(qualityRaw(inWindow(appearancesByTeam.get(team.teamId) ?? [], team.metadata.observedAt ?? new Date().toISOString(), 14)).reliefInnings, 2),
        battersFaced,
        warnings: sampleWarnings,
      },
      effectiveDepth: team.effectiveDepth ? {
        ...team.effectiveDepth,
        qualityRelieversWithLowFatigue: qualityScore !== undefined && qualityScore >= 55
          ? team.effectiveDepth.restedRelieverCount + team.effectiveDepth.normalRelieverCount
          : undefined,
      } : team.effectiveDepth,
    };
  });
}

export function qualityDistribution(teams: MlbTeamBullpenFeatures[]) {
  return distribution(teams.map((team) => team.qualityScore));
}

export function effectiveDepthDistribution(teams: MlbTeamBullpenFeatures[]) {
  return teams.reduce((acc: Record<string, number>, team) => {
    const key = team.effectiveDepth?.depthAvailability ?? "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
