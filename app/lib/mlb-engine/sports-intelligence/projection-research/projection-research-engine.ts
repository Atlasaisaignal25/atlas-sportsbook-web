export const MLB_PROJECTION_RESEARCH_VERSION = "mlb_projection_research_v1";

export type MlbProjectionResearchAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
export type MlbProjectionResearchConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";

export type MlbProjectionTeamInput = {
  teamId: string;
  teamName: string;
  teamQuality?: number;
  offense?: number;
  startingPitcherQuality?: number;
  bullpenQuality?: number;
  bullpenFatigue?: number;
  gameReadiness?: number;
  contextCertainty?: number;
  qualityAvailability?: string;
  confidenceTier?: string;
};

export type MlbProjectionResearchInput = {
  officialGameId: string;
  home: MlbProjectionTeamInput;
  away: MlbProjectionTeamInput;
  weatherRunEnvironment?: number;
  parkEnvironment?: number;
  modelVersion?: string;
  asOf?: string;
  warnings?: string[];
};

export type MlbProjectionResearchSnapshot = {
  officialGameId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  projectedHomeRuns?: number;
  projectedAwayRuns?: number;
  projectedTotalRuns?: number;
  homeWinProbability?: number;
  awayWinProbability?: number;
  fairMoneylineHome?: number;
  fairMoneylineAway?: number;
  projectionConfidence: {
    score?: number;
    tier: MlbProjectionResearchConfidenceTier;
    criticalCoveragePercent: number;
    optionalCoveragePercent: number;
    warnings: string[];
  };
  availability: MlbProjectionResearchAvailability;
  componentBreakdown: Record<string, unknown>;
  modelVersion: typeof MLB_PROJECTION_RESEARCH_VERSION;
  sourceVersions: Record<string, string | undefined>;
  warnings: string[];
  capturedAt: string;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fairMoneyline(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  return p >= 0.5 ? Math.round(-100 * p / (1 - p)) : Math.round(100 * (1 - p) / p);
}

function confidenceTier(score: number | undefined): MlbProjectionResearchConfidenceTier {
  if (!isNumber(score)) return "UNAVAILABLE";
  if (score >= 82) return "HIGH";
  if (score >= 58) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNAVAILABLE";
}

function moduleValue(team: MlbProjectionTeamInput, key: keyof MlbProjectionTeamInput) {
  const value = team[key];
  return isNumber(value) ? value : undefined;
}

function teamRunContributions(team: MlbProjectionTeamInput, opponent: MlbProjectionTeamInput) {
  const offense = moduleValue(team, "offense");
  const teamQuality = moduleValue(team, "teamQuality");
  const oppPitcher = moduleValue(opponent, "startingPitcherQuality");
  const oppBullpen = moduleValue(opponent, "bullpenQuality");
  const oppBullpenFatigue = moduleValue(opponent, "bullpenFatigue");
  const readiness = moduleValue(team, "gameReadiness");

  return {
    teamQuality: isNumber(teamQuality) ? round((teamQuality - 50) * 0.018, 3) : undefined,
    offense: isNumber(offense) ? round((offense - 50) * 0.025, 3) : undefined,
    opponentStartingPitcher: isNumber(oppPitcher) ? round((50 - oppPitcher) * 0.02, 3) : undefined,
    opponentBullpenQuality: isNumber(oppBullpen) ? round((50 - oppBullpen) * 0.012, 3) : undefined,
    opponentBullpenFatigue: isNumber(oppBullpenFatigue) ? round((oppBullpenFatigue - 50) * 0.01, 3) : undefined,
    gameReadiness: isNumber(readiness) ? round((readiness - 50) * 0.006, 3) : undefined,
  };
}

function sumAvailable(values: Array<number | undefined>) {
  const available = values.filter(isNumber);
  return available.reduce((sum, value) => sum + value, 0);
}

function criticalCoverage(input: MlbProjectionResearchInput) {
  const checks = [
    input.home.teamQuality,
    input.away.teamQuality,
    input.home.offense,
    input.away.offense,
    input.home.startingPitcherQuality,
    input.away.startingPitcherQuality,
    input.home.bullpenQuality,
    input.away.bullpenQuality,
  ];
  const available = checks.filter(isNumber).length;
  return { available, total: checks.length, percent: round((available / checks.length) * 100, 1) };
}

function optionalCoverage(input: MlbProjectionResearchInput) {
  const checks = [
    input.home.bullpenFatigue,
    input.away.bullpenFatigue,
    input.home.gameReadiness,
    input.away.gameReadiness,
    input.home.contextCertainty,
    input.away.contextCertainty,
    input.weatherRunEnvironment,
    input.parkEnvironment,
  ];
  const available = checks.filter(isNumber).length;
  return { available, total: checks.length, percent: round((available / checks.length) * 100, 1) };
}

function availabilityLabel(criticalPercent: number, optionalPercent: number): MlbProjectionResearchAvailability {
  if (criticalPercent < 50) return "UNAVAILABLE";
  if (criticalPercent < 100 || optionalPercent < 50) return "PARTIAL";
  return "AVAILABLE";
}

export function buildMlbProjectionResearch(input: MlbProjectionResearchInput): MlbProjectionResearchSnapshot {
  const capturedAt = input.asOf ?? new Date().toISOString();
  const critical = criticalCoverage(input);
  const optional = optionalCoverage(input);
  const availability = availabilityLabel(critical.percent, optional.percent);
  const warnings = [
    ...(input.warnings ?? []),
    ...(critical.percent < 100 ? ["Critical projection inputs are incomplete."] : []),
    ...(!isNumber(input.weatherRunEnvironment) ? ["Weather run environment unavailable."] : []),
    ...(!isNumber(input.parkEnvironment) ? ["Park environment unavailable."] : []),
  ];

  let projectedHomeRuns: number | undefined;
  let projectedAwayRuns: number | undefined;
  let projectedTotalRuns: number | undefined;
  let homeWinProbability: number | undefined;
  let awayWinProbability: number | undefined;

  const homeContrib = teamRunContributions(input.home, input.away);
  const awayContrib = teamRunContributions(input.away, input.home);
  const environmentTotal =
    (isNumber(input.weatherRunEnvironment) ? (input.weatherRunEnvironment - 50) * 0.018 : 0) +
    (isNumber(input.parkEnvironment) ? (input.parkEnvironment - 50) * 0.015 : 0);
  const homeFieldRuns = 0.12;

  if (critical.percent >= 50) {
    projectedHomeRuns = round(clamp(
      4.35 + homeFieldRuns + sumAvailable(Object.values(homeContrib)) + environmentTotal / 2,
      1.5,
      9.5,
    ), 2);
    projectedAwayRuns = round(clamp(
      4.35 - homeFieldRuns + sumAvailable(Object.values(awayContrib)) + environmentTotal / 2,
      1.5,
      9.5,
    ), 2);
    projectedTotalRuns = round(projectedHomeRuns + projectedAwayRuns, 2);
    const runDiff = projectedHomeRuns - projectedAwayRuns;
    homeWinProbability = round(clamp(1 / (1 + Math.exp(-runDiff * 0.56)), 0.03, 0.97), 4);
    awayWinProbability = round(1 - homeWinProbability, 4);
  }

  const confidenceScore = availability === "UNAVAILABLE"
    ? undefined
    : round(clamp(critical.percent * 0.72 + optional.percent * 0.18 + 10 - warnings.length * 2, 0, 100), 1);

  return {
    officialGameId: input.officialGameId,
    homeTeamId: input.home.teamId,
    homeTeamName: input.home.teamName,
    awayTeamId: input.away.teamId,
    awayTeamName: input.away.teamName,
    projectedHomeRuns,
    projectedAwayRuns,
    projectedTotalRuns,
    homeWinProbability,
    awayWinProbability,
    fairMoneylineHome: isNumber(homeWinProbability) ? fairMoneyline(homeWinProbability) : undefined,
    fairMoneylineAway: isNumber(awayWinProbability) ? fairMoneyline(awayWinProbability) : undefined,
    projectionConfidence: {
      score: confidenceScore,
      tier: confidenceTier(confidenceScore),
      criticalCoveragePercent: critical.percent,
      optionalCoveragePercent: optional.percent,
      warnings,
    },
    availability,
    componentBreakdown: {
      baselineRunsPerTeam: 4.35,
      documentedTransform: "Each 0-100 score is transformed as a delta from neutral 50 into run adjustments, never directly treated as runs.",
      home: homeContrib,
      away: awayContrib,
      environment: {
        weatherRunEnvironment: input.weatherRunEnvironment,
        parkEnvironment: input.parkEnvironment,
        totalRunAdjustment: round(environmentTotal, 3),
      },
      readiness: {
        home: input.home.gameReadiness,
        away: input.away.gameReadiness,
      },
      contextCertainty: {
        home: input.home.contextCertainty,
        away: input.away.contextCertainty,
      },
    },
    modelVersion: MLB_PROJECTION_RESEARCH_VERSION,
    sourceVersions: {
      teamQualityResearch: "team_quality_v2_research",
      startingPitcherQuality: "starting_pitcher_quality_v1",
      bullpenQuality: "bullpen_quality_v2",
      bullpenFatigue: "bullpen_fatigue_v2",
      offensiveScore: "offensive_score_v1",
      weatherRunEnvironment: isNumber(input.weatherRunEnvironment) ? "weather_run_environment_v1" : undefined,
      parkEnvironment: isNumber(input.parkEnvironment) ? "park_environment_v1" : undefined,
    },
    warnings,
    capturedAt,
  };
}

export function projectionDistribution(values: Array<number | undefined>) {
  const scores = values.filter(isNumber).sort((a, b) => a - b);
  if (scores.length === 0) return { count: 0 };
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const percentile = (p: number) => scores[Math.min(scores.length - 1, Math.max(0, Math.floor((scores.length - 1) * p)))];
  return {
    count: scores.length,
    mean: round(mean, 2),
    median: round(percentile(0.5), 2),
    min: round(scores[0], 2),
    max: round(scores[scores.length - 1], 2),
    p10: round(percentile(0.1), 2),
    p25: round(percentile(0.25), 2),
    p75: round(percentile(0.75), 2),
    p90: round(percentile(0.9), 2),
  };
}
