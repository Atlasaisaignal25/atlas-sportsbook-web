export const MLB_DECISION_RESEARCH_VERSION = "mlb_decision_engine_v1";

export type DecisionSide = "HOME" | "AWAY" | "TOTAL_OVER" | "TOTAL_UNDER" | "NONE";
export type ConsensusGrade = "STRONG_HOME" | "LEAN_HOME" | "STRONG_AWAY" | "LEAN_AWAY" | "TOTAL_OVER" | "TOTAL_UNDER" | "NO_CONSENSUS";
export type ConvictionGrade = "HIGH" | "MEDIUM" | "LOW" | "NONE";
export type DecisionGrade = "HOME_ML" | "AWAY_ML" | "LEAN_HOME" | "LEAN_AWAY" | "LEAN_TOTAL_OVER" | "LEAN_TOTAL_UNDER" | "NO_PICK";
export type DecisionConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";

export type DecisionTeamInput = {
  teamId: string;
  teamName: string;
  teamQuality?: number;
  offense?: number;
  pitcherQuality?: number;
  bullpenQuality?: number;
  bullpenFatigue?: number;
  gameReadiness?: number;
  contextCertainty?: number;
};

export type MarketIntelligenceInput = {
  movementCount: number;
  strongestDirection?: string;
  strongestImpact?: string;
  sportsbookCount?: number;
  consensusPercent?: number;
  magnitudeScore?: number;
  warnings?: string[];
};

export type DecisionResearchInput = {
  officialGameId: string;
  home: DecisionTeamInput;
  away: DecisionTeamInput;
  projectedHomeRuns?: number;
  projectedAwayRuns?: number;
  projectedTotalRuns?: number;
  homeWinProbability?: number;
  awayWinProbability?: number;
  projectionConfidenceScore?: number;
  projectionAvailability?: string;
  weatherRunEnvironment?: number;
  parkEnvironment?: number;
  marketIntelligence?: MarketIntelligenceInput;
  asOf?: string;
  warnings?: string[];
};

export type DecisionResearchSnapshot = {
  officialGameId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  consensus: {
    grade: ConsensusGrade;
    side: DecisionSide;
    score: number;
    moduleAgreement: number;
    components: Record<string, number | undefined>;
  };
  conviction: {
    grade: ConvictionGrade;
    score: number;
    drivers: string[];
  };
  decision: DecisionGrade;
  noPick: {
    isNoPick: boolean;
    reasons: string[];
  };
  decisionConfidence: {
    score?: number;
    tier: DecisionConfidenceTier;
    coveragePercent: number;
    warnings: string[];
  };
  componentBreakdown: Record<string, unknown>;
  sourceVersions: Record<string, string | undefined>;
  modelVersion: typeof MLB_DECISION_RESEARCH_VERSION;
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

function confidenceTier(score: number | undefined): DecisionConfidenceTier {
  if (!isNumber(score)) return "UNAVAILABLE";
  if (score >= 82) return "HIGH";
  if (score >= 58) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNAVAILABLE";
}

function consensusGrade(sideScore: number, totalScore: number): { grade: ConsensusGrade; side: DecisionSide } {
  if (Math.abs(sideScore) >= Math.abs(totalScore) && Math.abs(sideScore) >= 18) {
    if (sideScore >= 32) return { grade: "STRONG_HOME", side: "HOME" };
    if (sideScore >= 18) return { grade: "LEAN_HOME", side: "HOME" };
    if (sideScore <= -32) return { grade: "STRONG_AWAY", side: "AWAY" };
    return { grade: "LEAN_AWAY", side: "AWAY" };
  }
  if (Math.abs(totalScore) >= 18) {
    return totalScore > 0
      ? { grade: "TOTAL_OVER", side: "TOTAL_OVER" }
      : { grade: "TOTAL_UNDER", side: "TOTAL_UNDER" };
  }
  return { grade: "NO_CONSENSUS", side: "NONE" };
}

function convictionGrade(score: number): ConvictionGrade {
  if (score >= 76) return "HIGH";
  if (score >= 58) return "MEDIUM";
  if (score >= 35) return "LOW";
  return "NONE";
}

function decisionFrom(consensus: { side: DecisionSide }, conviction: ConvictionGrade): DecisionGrade {
  if (conviction === "NONE" || consensus.side === "NONE") return "NO_PICK";
  if (conviction === "LOW") {
    if (consensus.side === "HOME") return "LEAN_HOME";
    if (consensus.side === "AWAY") return "LEAN_AWAY";
    if (consensus.side === "TOTAL_OVER") return "LEAN_TOTAL_OVER";
    if (consensus.side === "TOTAL_UNDER") return "LEAN_TOTAL_UNDER";
  }
  if (consensus.side === "HOME") return "HOME_ML";
  if (consensus.side === "AWAY") return "AWAY_ML";
  if (consensus.side === "TOTAL_OVER") return "LEAN_TOTAL_OVER";
  if (consensus.side === "TOTAL_UNDER") return "LEAN_TOTAL_UNDER";
  return "NO_PICK";
}

function sideDrivers(components: Record<string, number | undefined>) {
  return Object.entries(components)
    .filter(([, value]) => isNumber(value) && Math.abs(value) >= 8)
    .sort(([, a], [, b]) => Math.abs(b ?? 0) - Math.abs(a ?? 0))
    .slice(0, 5)
    .map(([key, value]) => `${key}:${value! > 0 ? "HOME" : "AWAY"}`);
}

export function buildAtlasDecisionResearch(input: DecisionResearchInput): DecisionResearchSnapshot {
  const capturedAt = input.asOf ?? new Date().toISOString();
  const warnings = [...(input.warnings ?? []), ...(input.marketIntelligence?.warnings ?? [])];
  const sideComponents = {
    projectionWinProbability: isNumber(input.homeWinProbability) ? (input.homeWinProbability - 0.5) * 100 : undefined,
    teamQuality: isNumber(input.home.teamQuality) && isNumber(input.away.teamQuality) ? (input.home.teamQuality - input.away.teamQuality) * 0.9 : undefined,
    offense: isNumber(input.home.offense) && isNumber(input.away.offense) ? (input.home.offense - input.away.offense) * 0.55 : undefined,
    pitcherQuality: isNumber(input.home.pitcherQuality) && isNumber(input.away.pitcherQuality) ? (input.home.pitcherQuality - input.away.pitcherQuality) * 0.6 : undefined,
    bullpenQuality: isNumber(input.home.bullpenQuality) && isNumber(input.away.bullpenQuality) ? (input.home.bullpenQuality - input.away.bullpenQuality) * 0.45 : undefined,
    bullpenFatigue: isNumber(input.home.bullpenFatigue) && isNumber(input.away.bullpenFatigue) ? (input.away.bullpenFatigue - input.home.bullpenFatigue) * 0.35 : undefined,
    gameReadiness: isNumber(input.home.gameReadiness) && isNumber(input.away.gameReadiness) ? (input.home.gameReadiness - input.away.gameReadiness) * 0.35 : undefined,
    contextCertainty: isNumber(input.home.contextCertainty) && isNumber(input.away.contextCertainty) ? (input.home.contextCertainty - input.away.contextCertainty) * 0.12 : undefined,
    marketIntelligence: isNumber(input.marketIntelligence?.magnitudeScore) && isNumber(input.marketIntelligence?.consensusPercent)
      ? clamp((input.marketIntelligence.magnitudeScore * input.marketIntelligence.consensusPercent) / 1000, -12, 12)
      : undefined,
  };
  const sideValues = Object.values(sideComponents).filter(isNumber);
  const sideScore = round(clamp(sideValues.reduce((sum, value) => sum + value, 0), -100, 100), 1);

  const totalComponents = {
    projectedTotal: isNumber(input.projectedTotalRuns) ? (input.projectedTotalRuns - 8.7) * 14 : undefined,
    weatherRunEnvironment: isNumber(input.weatherRunEnvironment) ? (input.weatherRunEnvironment - 50) * 0.45 : undefined,
    parkEnvironment: isNumber(input.parkEnvironment) ? (input.parkEnvironment - 50) * 0.42 : undefined,
    offensiveEnvironment: isNumber(input.home.offense) && isNumber(input.away.offense) ? ((input.home.offense + input.away.offense) / 2 - 50) * 0.35 : undefined,
    bullpenRunRisk: isNumber(input.home.bullpenFatigue) && isNumber(input.away.bullpenFatigue) ? ((input.home.bullpenFatigue + input.away.bullpenFatigue) / 2 - 50) * 0.28 : undefined,
  };
  const totalValues = Object.values(totalComponents).filter(isNumber);
  const totalScore = round(clamp(totalValues.reduce((sum, value) => sum + value, 0), -100, 100), 1);

  const consensus = consensusGrade(sideScore, totalScore);
  const aligned = consensus.side === "NONE"
    ? 0
    : [...sideValues, ...totalValues].filter((value) => {
        if (consensus.side === "HOME" || consensus.side === "TOTAL_OVER") return value > 0;
        return value < 0;
      }).length;
  const totalSignals = sideValues.length + totalValues.length;
  const moduleAgreement = totalSignals === 0 ? 0 : round((aligned / totalSignals) * 100, 1);
  const coverageChecks = [
    input.home.teamQuality,
    input.away.teamQuality,
    input.home.offense,
    input.away.offense,
    input.home.pitcherQuality,
    input.away.pitcherQuality,
    input.home.bullpenQuality,
    input.away.bullpenQuality,
    input.home.bullpenFatigue,
    input.away.bullpenFatigue,
    input.home.gameReadiness,
    input.away.gameReadiness,
    input.projectedHomeRuns,
    input.projectedAwayRuns,
    input.homeWinProbability,
    input.awayWinProbability,
    input.weatherRunEnvironment,
    input.parkEnvironment,
  ];
  const coveragePercent = round((coverageChecks.filter(isNumber).length / coverageChecks.length) * 100, 1);
  const consensusScore = round(consensus.side === "NONE" ? 0 : Math.max(Math.abs(sideScore), Math.abs(totalScore)), 1);
  const projectionConfidence = isNumber(input.projectionConfidenceScore) ? input.projectionConfidenceScore : 0;
  const convictionScore = round(clamp(consensusScore * 0.52 + moduleAgreement * 0.24 + coveragePercent * 0.14 + projectionConfidence * 0.1, 0, 100), 1);
  const conviction = convictionGrade(convictionScore);
  const decision = decisionFrom(consensus, conviction);
  const noPickReasons = [
    ...(decision === "NO_PICK" ? ["No research decision cleared conviction requirements."] : []),
    ...(consensus.side === "NONE" ? ["Consensus did not align across modules."] : []),
    ...(coveragePercent < 75 ? ["Verified input coverage below research threshold."] : []),
    ...(input.projectionAvailability !== "AVAILABLE" ? ["Projection Research is not fully available."] : []),
  ];
  const noPick = decision === "NO_PICK" || noPickReasons.length > 0;
  const confidenceScore = noPick
    ? round(clamp(convictionScore - 12, 0, 100), 1)
    : convictionScore;

  return {
    officialGameId: input.officialGameId,
    homeTeamId: input.home.teamId,
    homeTeamName: input.home.teamName,
    awayTeamId: input.away.teamId,
    awayTeamName: input.away.teamName,
    consensus: {
      grade: consensus.grade,
      side: consensus.side,
      score: consensusScore,
      moduleAgreement,
      components: {
        ...sideComponents,
        totalScore,
      },
    },
    conviction: {
      grade: conviction,
      score: convictionScore,
      drivers: sideDrivers(consensus.side === "TOTAL_OVER" || consensus.side === "TOTAL_UNDER" ? totalComponents : sideComponents),
    },
    decision: noPick ? "NO_PICK" : decision,
    noPick: {
      isNoPick: noPick,
      reasons: noPickReasons,
    },
    decisionConfidence: {
      score: confidenceScore,
      tier: confidenceTier(confidenceScore),
      coveragePercent,
      warnings,
    },
    componentBreakdown: {
      sideScore,
      totalScore,
      sideComponents,
      totalComponents,
      marketIntelligence: input.marketIntelligence ?? null,
      projection: {
        projectedHomeRuns: input.projectedHomeRuns,
        projectedAwayRuns: input.projectedAwayRuns,
        projectedTotalRuns: input.projectedTotalRuns,
        homeWinProbability: input.homeWinProbability,
        awayWinProbability: input.awayWinProbability,
        availability: input.projectionAvailability,
      },
    },
    sourceVersions: {
      marketIntelligence: "odds_movement_consensus_v1",
      projectionResearch: "mlb_projection_research_v1",
      teamQualityResearch: "team_quality_v2_research",
      gameReadiness: "game_readiness_v1",
      pitcherQuality: "starting_pitcher_quality_v1",
      bullpenQuality: "bullpen_quality_v2",
      bullpenFatigue: "bullpen_fatigue_v2",
      offensiveScore: "offensive_score_v1",
      weather: isNumber(input.weatherRunEnvironment) ? "weather_run_environment_v1" : undefined,
      park: isNumber(input.parkEnvironment) ? "park_environment_v1" : undefined,
      contextCertainty: "game_context_certainty_v1",
    },
    modelVersion: MLB_DECISION_RESEARCH_VERSION,
    capturedAt,
  };
}

export function decisionDistribution(values: string[]) {
  return values.reduce((acc: Record<string, number>, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
