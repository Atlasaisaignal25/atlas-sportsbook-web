export const STARTING_PITCHER_QUALITY_VERSION = "starting_pitcher_quality_v1";
export const STARTING_PITCHER_READINESS_VERSION = "starting_pitcher_readiness_v1";

export type PitcherWindow = "SEASON" | "LAST_30_DAYS" | "LAST_5_STARTS" | "LAST_3_STARTS";
export type PitcherSampleQuality = "SUFFICIENT" | "LIMITED" | "INSUFFICIENT" | "UNAVAILABLE";
export type PitcherConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";

export type PitcherGameLogEntry = {
  date?: string;
  stat?: Record<string, unknown>;
};

export type PitcherQualityWindow = {
  window: PitcherWindow;
  startsIncluded: number;
  inningsOuts: number;
  inningsPitched?: number;
  battersFaced?: number;
  pitchCount?: number;
  earnedRuns?: number;
  runsAllowed?: number;
  hitsAllowed?: number;
  walksAllowed?: number;
  strikeouts?: number;
  homeRunsAllowed?: number;
  era?: number;
  whip?: number;
  strikeoutRate?: number;
  walkRate?: number;
  kMinusBbRate?: number;
  hitsPerBatterFaced?: number;
  homeRunsPerBatterFaced?: number;
  runsAllowedPerInning?: number;
  sampleQuality: PitcherSampleQuality;
  warnings: string[];
};

export type StartingPitcherQualityConfidence = {
  score?: number;
  tier: PitcherConfidenceTier;
  seasonSampleQuality: string;
  recentSampleQuality: string;
  advancedMetricCoverage: number;
  warnings: string[];
};

export type PitcherQualityComponent = {
  component: string;
  metric?: string;
  window?: PitcherWindow;
  rawValue?: number | string;
  normalizedValue?: number;
  weight: number;
  effectiveWeight: number;
  higherIsBetter: boolean;
  warnings: string[];
};

export type StartingPitcherQualitySnapshot = {
  playerId: string;
  playerName: string;
  teamId?: string;
  teamName?: string;
  officialGameId?: string;
  oddsEventId?: string;
  side?: "HOME" | "AWAY";
  handedness?: "L" | "R";
  qualityScore?: number;
  qualityVersion: typeof STARTING_PITCHER_QUALITY_VERSION;
  qualityComponents: PitcherQualityComponent[];
  qualityConfidence: StartingPitcherQualityConfidence;
  readinessScore?: number;
  readinessVersion: typeof STARTING_PITCHER_READINESS_VERSION;
  readinessComponents: PitcherQualityComponent[];
  seasonWindow?: PitcherQualityWindow;
  last30Window?: PitcherQualityWindow;
  last5Starts?: PitcherQualityWindow;
  last3Starts?: PitcherQualityWindow;
  advancedMetrics: Record<string, number | undefined>;
  sampleQuality: Record<PitcherWindow, PitcherSampleQuality>;
  sourceVersions: Record<string, string | undefined>;
  warnings: string[];
  capturedAt: string;
};

export type StartingPitcherQualityInput = {
  playerId: string;
  playerName: string;
  teamId?: string;
  teamName?: string;
  officialGameId?: string;
  oddsEventId?: string;
  side?: "HOME" | "AWAY";
  handedness?: "L" | "R";
  status?: "CONFIRMED" | "PROBABLE" | "EXPECTED" | "UNKNOWN";
  seasonStats?: Record<string, unknown>;
  gameLog?: PitcherGameLogEntry[];
  commenceTime?: string;
  asOf?: string;
  advancedMetrics?: Record<string, number | undefined>;
};

type Baseline = {
  mean: number;
  sd: number;
  higherIsBetter: boolean;
};

export const PITCHER_WINDOW_WEIGHTS: Record<PitcherWindow, number> = {
  SEASON: 0.5,
  LAST_30_DAYS: 0.25,
  LAST_5_STARTS: 0.15,
  LAST_3_STARTS: 0.1,
};

const METRIC_WEIGHTS: Record<string, number> = {
  era: 0.16,
  whip: 0.14,
  strikeoutRate: 0.16,
  walkRate: 0.12,
  kMinusBbRate: 0.18,
  hitsPerBatterFaced: 0.1,
  homeRunsPerBatterFaced: 0.08,
  runsAllowedPerInning: 0.06,
};

const BASELINES: Record<string, Baseline> = {
  era: { mean: 4.2, sd: 1.0, higherIsBetter: false },
  whip: { mean: 1.3, sd: 0.22, higherIsBetter: false },
  strikeoutRate: { mean: 0.22, sd: 0.055, higherIsBetter: true },
  walkRate: { mean: 0.085, sd: 0.03, higherIsBetter: false },
  kMinusBbRate: { mean: 0.135, sd: 0.065, higherIsBetter: true },
  hitsPerBatterFaced: { mean: 0.22, sd: 0.045, higherIsBetter: false },
  homeRunsPerBatterFaced: { mean: 0.032, sd: 0.018, higherIsBetter: false },
  runsAllowedPerInning: { mean: 0.49, sd: 0.15, higherIsBetter: false },
  xEra: { mean: 4.15, sd: 0.9, higherIsBetter: false },
  xWobaAllowed: { mean: 0.315, sd: 0.035, higherIsBetter: false },
  hardHitRateAllowed: { mean: 0.39, sd: 0.06, higherIsBetter: false },
  barrelRateAllowed: { mean: 0.075, sd: 0.03, higherIsBetter: false },
  averageExitVelocityAllowed: { mean: 88.8, sd: 2.2, higherIsBetter: false },
  fastballVelocity: { mean: 93.5, sd: 2.4, higherIsBetter: true },
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function inningsToOuts(value: unknown) {
  if (value === undefined || value === null) return 0;
  const text = String(value);
  const [whole, frac = "0"] = text.split(".");
  const innings = Number(whole);
  const outs = Number(frac);
  if (!Number.isFinite(innings) || !Number.isFinite(outs) || outs > 2) return 0;
  return innings * 3 + outs;
}

function outsToInnings(outs: number) {
  return Math.floor(outs / 3) + (outs % 3) / 10;
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function statValue(stat: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = numeric(stat?.[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function aggregateStats(stats: Array<Record<string, unknown> | undefined>, window: PitcherWindow): PitcherQualityWindow {
  const totals = stats.reduce((acc, stat) => {
    acc.startsIncluded += statValue(stat, ["gamesStarted", "gamesStartedPitching"]) ?? 0;
    acc.inningsOuts += inningsToOuts(stat?.inningsPitched);
    acc.battersFaced += statValue(stat, ["battersFaced"]) ?? 0;
    acc.pitchCount += statValue(stat, ["numberOfPitches", "pitchesThrown"]) ?? 0;
    acc.earnedRuns += statValue(stat, ["earnedRuns"]) ?? 0;
    acc.runsAllowed += statValue(stat, ["runs", "runsAllowed"]) ?? 0;
    acc.hitsAllowed += statValue(stat, ["hits"]) ?? 0;
    acc.walksAllowed += statValue(stat, ["baseOnBalls", "walks"]) ?? 0;
    acc.strikeouts += statValue(stat, ["strikeOuts", "strikeouts"]) ?? 0;
    acc.homeRunsAllowed += statValue(stat, ["homeRuns"]) ?? 0;
    return acc;
  }, {
    startsIncluded: 0,
    inningsOuts: 0,
    battersFaced: 0,
    pitchCount: 0,
    earnedRuns: 0,
    runsAllowed: 0,
    hitsAllowed: 0,
    walksAllowed: 0,
    strikeouts: 0,
    homeRunsAllowed: 0,
  });
  const innings = totals.inningsOuts / 3;
  const bf = totals.battersFaced;
  const warnings: string[] = [];
  if (totals.startsIncluded === 0) warnings.push("No official starts included.");
  if (stats.length > totals.startsIncluded) warnings.push("Relief appearances excluded from starter quality window.");
  const sampleQuality = classifySampleQuality(window, totals.startsIncluded, innings);
  return {
    window,
    startsIncluded: totals.startsIncluded,
    inningsOuts: totals.inningsOuts,
    inningsPitched: round(outsToInnings(totals.inningsOuts), 1),
    battersFaced: bf || undefined,
    pitchCount: totals.pitchCount || undefined,
    earnedRuns: totals.earnedRuns,
    runsAllowed: totals.runsAllowed,
    hitsAllowed: totals.hitsAllowed,
    walksAllowed: totals.walksAllowed,
    strikeouts: totals.strikeouts,
    homeRunsAllowed: totals.homeRunsAllowed,
    era: totals.inningsOuts > 0 ? round((totals.earnedRuns * 27) / totals.inningsOuts, 2) : undefined,
    whip: totals.inningsOuts > 0 ? round((totals.walksAllowed + totals.hitsAllowed) / innings, 3) : undefined,
    strikeoutRate: bf > 0 ? round(totals.strikeouts / bf, 4) : undefined,
    walkRate: bf > 0 ? round(totals.walksAllowed / bf, 4) : undefined,
    kMinusBbRate: bf > 0 ? round((totals.strikeouts - totals.walksAllowed) / bf, 4) : undefined,
    hitsPerBatterFaced: bf > 0 ? round(totals.hitsAllowed / bf, 4) : undefined,
    homeRunsPerBatterFaced: bf > 0 ? round(totals.homeRunsAllowed / bf, 4) : undefined,
    runsAllowedPerInning: innings > 0 ? round(totals.runsAllowed / innings, 4) : undefined,
    sampleQuality,
    warnings,
  };
}

function classifySampleQuality(window: PitcherWindow, starts: number, innings: number): PitcherSampleQuality {
  if (starts <= 0 || innings <= 0) return "UNAVAILABLE";
  if (window === "SEASON") {
    if (starts >= 8 && innings >= 40) return "SUFFICIENT";
    if (starts >= 4 && innings >= 18) return "LIMITED";
    return "INSUFFICIENT";
  }
  if (window === "LAST_30_DAYS") {
    if (starts >= 3 && innings >= 15) return "SUFFICIENT";
    if (starts >= 2 && innings >= 8) return "LIMITED";
    return "INSUFFICIENT";
  }
  if (window === "LAST_5_STARTS") {
    if (starts >= 4) return "SUFFICIENT";
    if (starts >= 2) return "LIMITED";
    return "INSUFFICIENT";
  }
  if (starts >= 3) return "SUFFICIENT";
  if (starts >= 2) return "LIMITED";
  return "INSUFFICIENT";
}

function starterOnly(log: PitcherGameLogEntry[]) {
  return log.filter((entry) => (statValue(entry.stat, ["gamesStarted", "gamesStartedPitching"]) ?? 0) > 0);
}

function dateMs(entry: PitcherGameLogEntry) {
  const time = new Date(entry.date ?? "").getTime();
  return Number.isFinite(time) ? time : 0;
}

export function buildPitcherWindows(input: { seasonStats?: Record<string, unknown>; gameLog?: PitcherGameLogEntry[]; asOf?: string }) {
  const asOf = input.asOf ?? new Date().toISOString();
  const starts = starterOnly(input.gameLog ?? []).sort((a, b) => dateMs(b) - dateMs(a));
  const since30 = new Date(new Date(asOf).getTime() - 30 * 86_400_000).getTime();
  const seasonWindow = input.seasonStats ? aggregateStats([input.seasonStats], "SEASON") : aggregateStats(starts.map((entry) => entry.stat), "SEASON");
  const last30Window = aggregateStats(starts.filter((entry) => dateMs(entry) >= since30).map((entry) => entry.stat), "LAST_30_DAYS");
  const last5Starts = aggregateStats(starts.slice(0, 5).map((entry) => entry.stat), "LAST_5_STARTS");
  const last3Starts = aggregateStats(starts.slice(0, 3).map((entry) => entry.stat), "LAST_3_STARTS");
  const reliefExcluded = Math.max(0, (input.gameLog ?? []).length - starts.length);
  const warnings = [
    ...(reliefExcluded > 0 ? [`Excluded ${reliefExcluded} relief appearance(s) from starter-quality windows.`] : []),
    ...(last3Starts.startsIncluded === 1 && last3Starts.inningsOuts <= 9 ? ["Possible opener or very short start detected."] : []),
  ];
  return { seasonWindow, last30Window, last5Starts, last3Starts, warnings };
}

function normalizeMetric(metric: string, value: number | undefined) {
  const baseline = BASELINES[metric];
  if (!baseline || !isNumber(value) || baseline.sd <= 0.000001) return undefined;
  const z = Math.max(-2.5, Math.min(2.5, (value - baseline.mean) / baseline.sd));
  const directional = baseline.higherIsBetter ? z : -z;
  return round(clamp(50 + directional * 12));
}

function metricComponents(window: PitcherQualityWindow) {
  return Object.entries(METRIC_WEIGHTS).map(([metric, weight]) => {
    const raw = (window as unknown as Record<string, number | undefined>)[metric];
    return {
      component: "pitcherQualityMetric",
      metric,
      window: window.window,
      rawValue: raw,
      normalizedValue: normalizeMetric(metric, raw),
      weight,
      effectiveWeight: 0,
      higherIsBetter: BASELINES[metric]?.higherIsBetter ?? true,
      warnings: raw === undefined ? [`${metric} unavailable for ${window.window}.`] : [],
    };
  });
}

function scoreComponents(components: PitcherQualityComponent[]) {
  const usable = components.filter((component) => component.normalizedValue !== undefined);
  const totalWeight = usable.reduce((sum, component) => sum + component.weight, 0);
  const scored = components.map((component) => ({
    ...component,
    effectiveWeight: component.normalizedValue !== undefined && totalWeight > 0 ? round(component.weight / totalWeight, 4) : 0,
  }));
  const score = totalWeight > 0
    ? round(scored.reduce((sum, component) => sum + (component.normalizedValue ?? 0) * component.effectiveWeight, 0), 1)
    : undefined;
  return { score, components: scored };
}

function windowScore(window: PitcherQualityWindow) {
  const components = metricComponents(window);
  const scored = scoreComponents(components);
  const confidenceMultiplier = window.sampleQuality === "SUFFICIENT" ? 1 : window.sampleQuality === "LIMITED" ? 0.85 : window.sampleQuality === "INSUFFICIENT" ? 0.65 : 0;
  return {
    score: scored.score === undefined ? undefined : round(50 + (scored.score - 50) * confidenceMultiplier, 1),
    components: scored.components,
  };
}

function confidenceScore(windows: PitcherQualityWindow[], advancedMetrics: Record<string, number | undefined>, warnings: string[]) {
  const samplePoints = windows.reduce((sum, window) => {
    if (window.sampleQuality === "SUFFICIENT") return sum + 25;
    if (window.sampleQuality === "LIMITED") return sum + 16;
    if (window.sampleQuality === "INSUFFICIENT") return sum + 8;
    return sum;
  }, 0);
  const advancedKeys = ["xEra", "xWobaAllowed", "hardHitRateAllowed", "barrelRateAllowed", "averageExitVelocityAllowed", "fastballVelocity"];
  const advancedMetricCoverage = round(advancedKeys.filter((key) => advancedMetrics[key] !== undefined).length / advancedKeys.length, 3);
  const score = clamp(samplePoints * 0.75 + advancedMetricCoverage * 20 - Math.min(20, warnings.length * 2));
  const recent = [windows[1], windows[2], windows[3]].some((window) => window.sampleQuality === "SUFFICIENT")
    ? "SUFFICIENT"
    : [windows[1], windows[2], windows[3]].some((window) => window.sampleQuality === "LIMITED")
      ? "LIMITED"
      : "INSUFFICIENT";
  return {
    score: round(score),
    tier: score >= 78 ? "HIGH" as const : score >= 55 ? "MEDIUM" as const : score > 0 ? "LOW" as const : "UNAVAILABLE" as const,
    seasonSampleQuality: windows[0].sampleQuality,
    recentSampleQuality: recent,
    advancedMetricCoverage,
    warnings,
  };
}

function readiness(input: StartingPitcherQualityInput, latestStart?: PitcherGameLogEntry) {
  const latestPitchCount = statValue(latestStart?.stat, ["numberOfPitches", "pitchesThrown"]);
  const restDays = latestStart?.date && input.commenceTime
    ? Math.max(0, Math.floor((new Date(input.commenceTime).getTime() - new Date(latestStart.date).getTime()) / 86_400_000))
    : undefined;
  const restScore = restDays === undefined ? undefined : restDays >= 5 ? 92 : restDays === 4 ? 82 : restDays === 3 ? 62 : 35;
  const pitchCountScore = latestPitchCount === undefined ? undefined : latestPitchCount <= 85 ? 88 : latestPitchCount <= 100 ? 72 : latestPitchCount <= 115 ? 52 : 32;
  const statusScore = input.status === "CONFIRMED" ? 95 : input.status === "PROBABLE" ? 78 : input.status === "EXPECTED" ? 65 : undefined;
  const components: PitcherQualityComponent[] = [
    { component: "restDays", rawValue: restDays, normalizedValue: restScore, weight: 0.45, effectiveWeight: 0, higherIsBetter: true, warnings: restDays === undefined ? ["Rest days unavailable."] : restDays < 4 ? ["Short rest warning."] : [] },
    { component: "recentPitchCount", rawValue: latestPitchCount, normalizedValue: pitchCountScore, weight: 0.35, effectiveWeight: 0, higherIsBetter: false, warnings: latestPitchCount === undefined ? ["Recent pitch count unavailable."] : [] },
    { component: "starterStatus", rawValue: input.status, normalizedValue: statusScore, weight: 0.2, effectiveWeight: 0, higherIsBetter: true, warnings: input.status === "UNKNOWN" ? ["Starter confirmation status unavailable."] : [] },
  ];
  return scoreComponents(components);
}

export function buildStartingPitcherQuality(input: StartingPitcherQualityInput): StartingPitcherQualitySnapshot {
  const capturedAt = input.asOf ?? new Date().toISOString();
  const windows = buildPitcherWindows({ seasonStats: input.seasonStats, gameLog: input.gameLog, asOf: capturedAt });
  const scoredWindows = [
    { window: windows.seasonWindow, weight: PITCHER_WINDOW_WEIGHTS.SEASON },
    { window: windows.last30Window, weight: PITCHER_WINDOW_WEIGHTS.LAST_30_DAYS },
    { window: windows.last5Starts, weight: PITCHER_WINDOW_WEIGHTS.LAST_5_STARTS },
    { window: windows.last3Starts, weight: PITCHER_WINDOW_WEIGHTS.LAST_3_STARTS },
  ].map((item) => ({ ...item, ...windowScore(item.window) }));
  const usableWindows = scoredWindows.filter((item) => item.score !== undefined && item.window.sampleQuality !== "UNAVAILABLE");
  const totalWindowWeight = usableWindows.reduce((sum, item) => sum + item.weight, 0);
  const qualityScore = totalWindowWeight > 0
    ? round(usableWindows.reduce((sum, item) => sum + (item.score ?? 0) * (item.weight / totalWindowWeight), 0), 1)
    : undefined;
  const advancedMetrics = input.advancedMetrics ?? {};
  const allWarnings = Array.from(new Set([
    ...windows.warnings,
    ...[windows.seasonWindow, windows.last30Window, windows.last5Starts, windows.last3Starts].flatMap((window) => window.warnings),
  ]));
  const qualityConfidence = confidenceScore([windows.seasonWindow, windows.last30Window, windows.last5Starts, windows.last3Starts], advancedMetrics, allWarnings);
  const latestStart = starterOnly(input.gameLog ?? []).sort((a, b) => dateMs(b) - dateMs(a))[0];
  const readinessScore = readiness(input, latestStart);
  return {
    playerId: input.playerId,
    playerName: input.playerName,
    teamId: input.teamId,
    teamName: input.teamName,
    officialGameId: input.officialGameId,
    oddsEventId: input.oddsEventId,
    side: input.side,
    handedness: input.handedness,
    qualityScore,
    qualityVersion: STARTING_PITCHER_QUALITY_VERSION,
    qualityComponents: scoredWindows.flatMap((item) => item.components.map((component) => ({
      ...component,
      component: `${item.window.window}:${component.metric}`,
      weight: round(component.weight * item.weight, 4),
    }))),
    qualityConfidence,
    readinessScore: readinessScore.score,
    readinessVersion: STARTING_PITCHER_READINESS_VERSION,
    readinessComponents: readinessScore.components,
    seasonWindow: windows.seasonWindow,
    last30Window: windows.last30Window,
    last5Starts: windows.last5Starts,
    last3Starts: windows.last3Starts,
    advancedMetrics,
    sampleQuality: {
      SEASON: windows.seasonWindow.sampleQuality,
      LAST_30_DAYS: windows.last30Window.sampleQuality,
      LAST_5_STARTS: windows.last5Starts.sampleQuality,
      LAST_3_STARTS: windows.last3Starts.sampleQuality,
    },
    sourceVersions: {
      mlbStatsApi: "statsapi.mlb.com/api/v1 people stats season, gameLog",
      baseballSavant: "not_connected_phase_9",
      quality: STARTING_PITCHER_QUALITY_VERSION,
      readiness: STARTING_PITCHER_READINESS_VERSION,
    },
    warnings: allWarnings,
    capturedAt,
  };
}

export function pitcherScoreDistribution(values: Array<number | undefined>) {
  const scores = values.filter(isNumber).sort((a, b) => a - b);
  if (scores.length === 0) return { count: 0 };
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance = scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length;
  const percentile = (p: number) => scores[Math.min(scores.length - 1, Math.max(0, Math.floor((scores.length - 1) * p)))];
  return {
    count: scores.length,
    min: round(scores[0], 1),
    max: round(scores[scores.length - 1], 1),
    mean: round(mean, 1),
    median: round(percentile(0.5), 1),
    sd: round(Math.sqrt(variance), 1),
    p10: round(percentile(0.1), 1),
    p25: round(percentile(0.25), 1),
    p75: round(percentile(0.75), 1),
    p90: round(percentile(0.9), 1),
  };
}
