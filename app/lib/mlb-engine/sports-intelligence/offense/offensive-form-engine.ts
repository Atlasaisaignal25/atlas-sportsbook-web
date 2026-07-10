import type {
  DataAvailability,
  FeatureSource,
  OffensiveFormFeatures,
  OffensiveMetricBreakdown,
  OffensiveRollingWindow,
  OffensiveSampleQuality,
  OffensiveTeamForm,
  SportsFeatureMetadata,
} from "../types";

export type OffensiveMetricKey =
  | "hardHitRate"
  | "barrelRate"
  | "exitVelocity"
  | "walkRate"
  | "strikeoutRate"
  | "expectedBattingAverage"
  | "expectedSlugging"
  | "expectedWeightedOnBaseAverage";

export type VerifiedOffensiveRollingStats = {
  teamId?: string;
  teamName: string;
  asOf: string;
  source: Extract<FeatureSource, "MLB_OFFICIAL" | "BASEBALL_SAVANT">;
  windows: Partial<Record<OffensiveRollingWindow, {
    games: number;
    gamesRequested?: 7 | 14 | 30;
    gamesIncluded?: number;
    startDate?: string;
    endDate?: string;
    plateAppearances?: number;
    battedBallEvents?: number;
    hits?: number;
    walks?: number;
    strikeouts?: number;
    hardHitBalls?: number;
    barrels?: number;
    hardHitRate?: number;
    barrelRate?: number;
    exitVelocity?: number;
    averageExitVelocity?: number;
    walkRate?: number;
    strikeoutRate?: number;
    expectedBattingAverage?: number;
    expectedSlugging?: number;
    expectedWeightedOnBaseAverage?: number;
    xBA?: number;
    xSLG?: number;
    xwOBA?: number;
    sampleQuality?: OffensiveSampleQuality;
    warnings?: string[];
  }>>;
};

type MetricProfile = {
  weight: number;
  higherIsBetter: boolean;
};

export type OffensiveLeagueBaselineMetric = {
  mean: number;
  standardDeviation: number;
};

export type OffensiveLeagueBaseline = {
  source: Extract<FeatureSource, "BASEBALL_SAVANT">;
  asOf: string;
  sampleSize: {
    plateAppearances: number;
    battedBallEvents: number;
  };
  metrics: Partial<Record<OffensiveMetricKey, OffensiveLeagueBaselineMetric>>;
  warnings: string[];
};

const WINDOW_WEIGHTS: Record<OffensiveRollingWindow, number> = {
  last7: 0.5,
  last14: 0.3,
  last30: 0.2,
};

const METRIC_PROFILES: Record<OffensiveMetricKey, MetricProfile> = {
  hardHitRate: { weight: 0.16, higherIsBetter: true },
  barrelRate: { weight: 0.16, higherIsBetter: true },
  exitVelocity: { weight: 0.12, higherIsBetter: true },
  walkRate: { weight: 0.12, higherIsBetter: true },
  strikeoutRate: { weight: 0.12, higherIsBetter: false },
  expectedBattingAverage: { weight: 0.1, higherIsBetter: true },
  expectedSlugging: { weight: 0.14, higherIsBetter: true },
  expectedWeightedOnBaseAverage: { weight: 0.18, higherIsBetter: true },
};

const METRIC_KEYS = Object.keys(METRIC_PROFILES) as OffensiveMetricKey[];

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMetric(value: number, profile: MetricProfile, baseline: OffensiveLeagueBaselineMetric) {
  if (!Number.isFinite(baseline.standardDeviation) || baseline.standardDeviation <= 0) return undefined;
  const zScore = (value - baseline.mean) / baseline.standardDeviation;
  const normalized = 50 + zScore * 12.5;
  const score = profile.higherIsBetter ? normalized : 100 - normalized;
  return round(clamp(score));
}

function metricValue(
  stats: NonNullable<VerifiedOffensiveRollingStats["windows"][OffensiveRollingWindow]>,
  key: OffensiveMetricKey,
) {
  if (key === "exitVelocity") return stats.exitVelocity ?? stats.averageExitVelocity;
  if (key === "expectedBattingAverage") return stats.expectedBattingAverage ?? stats.xBA;
  if (key === "expectedSlugging") return stats.expectedSlugging ?? stats.xSLG;
  if (key === "expectedWeightedOnBaseAverage") return stats.expectedWeightedOnBaseAverage ?? stats.xwOBA;
  return stats[key];
}

function buildMetricBreakdown(
  stats: NonNullable<VerifiedOffensiveRollingStats["windows"][OffensiveRollingWindow]>,
  baseline?: OffensiveLeagueBaseline,
) {
  const breakdown: OffensiveMetricBreakdown[] = [];
  if (!baseline) return breakdown;

  METRIC_KEYS.forEach((key) => {
    const rawValue = metricValue(stats, key);
    if (!isFiniteNumber(rawValue)) return;
    const baselineMetric = baseline.metrics[key];
    if (!baselineMetric) return;
    const profile = METRIC_PROFILES[key];
    const normalizedScore = normalizeMetric(rawValue, profile, baselineMetric);
    if (!isFiniteNumber(normalizedScore)) return;
    breakdown.push({
      metric: key,
      rawValue,
      normalizedScore,
      weight: profile.weight,
      higherIsBetter: profile.higherIsBetter,
    });
  });

  return breakdown;
}

function calculateWindowScore(breakdown: OffensiveMetricBreakdown[]) {
  const totalWeight = breakdown.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return undefined;

  const weightedScore = breakdown.reduce((sum, item) => sum + item.normalizedScore * item.weight, 0) / totalWeight;
  return round(weightedScore);
}

function buildWindow(
  window: OffensiveRollingWindow,
  stats: NonNullable<VerifiedOffensiveRollingStats["windows"][OffensiveRollingWindow]> | undefined,
  baseline?: OffensiveLeagueBaseline,
  scoringEnabled = false,
) {
  if (!stats) return undefined;

  const breakdown = scoringEnabled ? buildMetricBreakdown(stats, baseline) : [];
  const score = scoringEnabled ? calculateWindowScore(breakdown) : undefined;
  return {
    window,
    games: stats.games,
    gamesRequested: stats.gamesRequested,
    gamesIncluded: stats.gamesIncluded ?? stats.games,
    startDate: stats.startDate,
    endDate: stats.endDate,
    plateAppearances: stats.plateAppearances,
    battedBallEvents: stats.battedBallEvents,
    hits: stats.hits,
    walks: stats.walks,
    strikeouts: stats.strikeouts,
    hardHitBalls: stats.hardHitBalls,
    barrels: stats.barrels,
    score,
    hardHitRate: stats.hardHitRate,
    barrelRate: stats.barrelRate,
    exitVelocity: stats.exitVelocity ?? stats.averageExitVelocity,
    averageExitVelocity: stats.averageExitVelocity ?? stats.exitVelocity,
    walkRate: stats.walkRate,
    strikeoutRate: stats.strikeoutRate,
    expectedBattingAverage: stats.expectedBattingAverage ?? stats.xBA,
    expectedSlugging: stats.expectedSlugging ?? stats.xSLG,
    expectedWeightedOnBaseAverage: stats.expectedWeightedOnBaseAverage ?? stats.xwOBA,
    xBA: stats.xBA ?? stats.expectedBattingAverage,
    xSLG: stats.xSLG ?? stats.expectedSlugging,
    xwOBA: stats.xwOBA ?? stats.expectedWeightedOnBaseAverage,
    sampleQuality: stats.sampleQuality,
    warnings: stats.warnings ?? [],
    componentBreakdown: breakdown,
  };
}

function calculateAtlasOffensiveScore(windows: OffensiveTeamForm["rollingWindows"]) {
  const scored = (["last7", "last14", "last30"] as OffensiveRollingWindow[])
    .map((window) => ({ window, score: windows[window]?.score }))
    .filter((item): item is { window: OffensiveRollingWindow; score: number } => isFiniteNumber(item.score));
  const totalWeight = scored.reduce((sum, item) => sum + WINDOW_WEIGHTS[item.window], 0);
  if (totalWeight <= 0) return undefined;

  return round(scored.reduce((sum, item) => sum + item.score * WINDOW_WEIGHTS[item.window], 0) / totalWeight);
}

function hasRawWindowData(windows: OffensiveTeamForm["rollingWindows"]) {
  return Object.values(windows).some((window) =>
    Boolean(window && (window.plateAppearances || window.battedBallEvents || window.gamesIncluded)),
  );
}

function buildTeamForm(
  input: VerifiedOffensiveRollingStats,
  baseline?: OffensiveLeagueBaseline,
  scoringEnabled = false,
): OffensiveTeamForm {
  const rollingWindows = {
    last7: buildWindow("last7", input.windows.last7, baseline, scoringEnabled),
    last14: buildWindow("last14", input.windows.last14, baseline, scoringEnabled),
    last30: buildWindow("last30", input.windows.last30, baseline, scoringEnabled),
  };

  const atlasOffensiveScore = calculateAtlasOffensiveScore(rollingWindows);
  const currentWindow = rollingWindows.last7 ?? rollingWindows.last14 ?? rollingWindows.last30;
  const hasRawData = hasRawWindowData(rollingWindows);

  return {
    teamId: input.teamId,
    teamName: input.teamName,
    atlasOffensiveScore,
    currentScore: atlasOffensiveScore,
    scoreTimestamp: input.asOf,
    source: input.source,
    availability: atlasOffensiveScore !== undefined || hasRawData ? "AVAILABLE" : "UNAVAILABLE",
    rollingWindows,
    componentBreakdown: currentWindow?.componentBreakdown ?? [],
    last7Score: rollingWindows.last7?.score,
    last14Score: rollingWindows.last14?.score,
    last30Score: rollingWindows.last30?.score,
    hardHitRate: currentWindow?.hardHitRate,
    barrelRate: currentWindow?.barrelRate,
    exitVelocity: currentWindow?.exitVelocity,
    strikeoutRate: currentWindow?.strikeoutRate,
    walkRate: currentWindow?.walkRate,
    xBA: currentWindow?.expectedBattingAverage,
    xSLG: currentWindow?.expectedSlugging,
    xWoba: currentWindow?.expectedWeightedOnBaseAverage,
  };
}

function metadataFromForms(input: {
  home?: OffensiveTeamForm;
  away?: OffensiveTeamForm;
  observedAt: string;
  source?: FeatureSource;
}): SportsFeatureMetadata {
  const forms = [input.home, input.away].filter(Boolean) as OffensiveTeamForm[];
  const availableCount = forms.filter((form) => form.availability === "AVAILABLE").length;
  const availability: DataAvailability =
    availableCount === 2 ? "AVAILABLE" : availableCount === 1 ? "PARTIAL" : "UNAVAILABLE";

  return {
    availability,
    source: input.source ?? "UNKNOWN",
    observedAt: input.observedAt,
    updatedAt: forms
      .map((form) => form.scoreTimestamp)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1),
    confidence: availability === "AVAILABLE" ? 85 : availability === "PARTIAL" ? 50 : undefined,
    warnings: availability === "UNAVAILABLE" ? ["Verified offensive rolling-form data is unavailable."] : [],
  };
}

export function buildOffensiveFormFeatures(input: {
  home?: VerifiedOffensiveRollingStats;
  away?: VerifiedOffensiveRollingStats;
  observedAt?: string;
  baseline?: OffensiveLeagueBaseline;
  scoringEnabled?: boolean;
}): OffensiveFormFeatures {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const scoringEnabled = Boolean(input.scoringEnabled && input.baseline);
  const home = input.home ? buildTeamForm(input.home, input.baseline, scoringEnabled) : undefined;
  const away = input.away ? buildTeamForm(input.away, input.baseline, scoringEnabled) : undefined;
  const source = home?.source ?? away?.source;
  const homeScore = home?.atlasOffensiveScore;
  const awayScore = away?.atlasOffensiveScore;
  const formAdvantage =
    isFiniteNumber(homeScore) && isFiniteNumber(awayScore)
      ? homeScore > awayScore
        ? "HOME"
        : awayScore > homeScore
          ? "AWAY"
          : "NEUTRAL"
      : undefined;

  return {
    metadata: metadataFromForms({ home, away, observedAt, source }),
    home,
    away,
    formAdvantage,
  };
}

export function buildUnavailableOffensiveFormFeatures(observedAt = new Date().toISOString()): OffensiveFormFeatures {
  return {
    metadata: {
      availability: "UNAVAILABLE",
      source: "UNKNOWN",
      observedAt,
      warnings: ["Verified offensive rolling-form data is unavailable."],
    },
  };
}
