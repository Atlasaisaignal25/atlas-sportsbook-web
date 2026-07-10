import type {
  DataAvailability,
  FeatureSource,
  OffensiveFormFeatures,
  OffensiveMetricBreakdown,
  OffensiveRollingWindow,
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
    hardHitRate?: number;
    barrelRate?: number;
    exitVelocity?: number;
    walkRate?: number;
    strikeoutRate?: number;
    expectedBattingAverage?: number;
    expectedSlugging?: number;
    expectedWeightedOnBaseAverage?: number;
  }>>;
};

type MetricProfile = {
  min: number;
  max: number;
  weight: number;
  higherIsBetter: boolean;
};

const WINDOW_WEIGHTS: Record<OffensiveRollingWindow, number> = {
  last7: 0.5,
  last14: 0.3,
  last30: 0.2,
};

const METRIC_PROFILES: Record<OffensiveMetricKey, MetricProfile> = {
  hardHitRate: { min: 30, max: 55, weight: 0.16, higherIsBetter: true },
  barrelRate: { min: 4, max: 14, weight: 0.16, higherIsBetter: true },
  exitVelocity: { min: 86, max: 92, weight: 0.12, higherIsBetter: true },
  walkRate: { min: 5, max: 12, weight: 0.12, higherIsBetter: true },
  strikeoutRate: { min: 28, max: 16, weight: 0.12, higherIsBetter: false },
  expectedBattingAverage: { min: 0.22, max: 0.285, weight: 0.1, higherIsBetter: true },
  expectedSlugging: { min: 0.36, max: 0.5, weight: 0.14, higherIsBetter: true },
  expectedWeightedOnBaseAverage: { min: 0.29, max: 0.38, weight: 0.18, higherIsBetter: true },
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

function normalizeMetric(value: number, profile: MetricProfile) {
  const low = Math.min(profile.min, profile.max);
  const high = Math.max(profile.min, profile.max);
  const normalized = ((value - low) / (high - low)) * 100;
  const score = profile.higherIsBetter ? normalized : 100 - normalized;
  return round(clamp(score));
}

function buildMetricBreakdown(stats: NonNullable<VerifiedOffensiveRollingStats["windows"][OffensiveRollingWindow]>) {
  const breakdown: OffensiveMetricBreakdown[] = [];

  METRIC_KEYS.forEach((key) => {
    const rawValue = stats[key];
    if (!isFiniteNumber(rawValue)) return;
    const profile = METRIC_PROFILES[key];
    const normalizedScore = normalizeMetric(rawValue, profile);
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
) {
  if (!stats) return undefined;

  const breakdown = buildMetricBreakdown(stats);
  const score = calculateWindowScore(breakdown);
  return {
    window,
    games: stats.games,
    score,
    hardHitRate: stats.hardHitRate,
    barrelRate: stats.barrelRate,
    exitVelocity: stats.exitVelocity,
    walkRate: stats.walkRate,
    strikeoutRate: stats.strikeoutRate,
    expectedBattingAverage: stats.expectedBattingAverage,
    expectedSlugging: stats.expectedSlugging,
    expectedWeightedOnBaseAverage: stats.expectedWeightedOnBaseAverage,
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

function buildTeamForm(input: VerifiedOffensiveRollingStats): OffensiveTeamForm {
  const rollingWindows = {
    last7: buildWindow("last7", input.windows.last7),
    last14: buildWindow("last14", input.windows.last14),
    last30: buildWindow("last30", input.windows.last30),
  };

  const atlasOffensiveScore = calculateAtlasOffensiveScore(rollingWindows);
  const currentWindow = rollingWindows.last7 ?? rollingWindows.last14 ?? rollingWindows.last30;

  return {
    teamId: input.teamId,
    teamName: input.teamName,
    atlasOffensiveScore,
    currentScore: atlasOffensiveScore,
    scoreTimestamp: input.asOf,
    source: input.source,
    availability: atlasOffensiveScore === undefined ? "UNAVAILABLE" : "AVAILABLE",
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
}): OffensiveFormFeatures {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const home = input.home ? buildTeamForm(input.home) : undefined;
  const away = input.away ? buildTeamForm(input.away) : undefined;
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
