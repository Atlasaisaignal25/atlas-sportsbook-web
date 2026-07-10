import crypto from "node:crypto";
import type {
  BullpenQualityComponent,
  BullpenQualityConfidence,
  BullpenQualityWindow,
  MlbRelieverAppearance,
  MlbTeamBullpenFeatures,
  MlbTeamReliefWindow,
} from "../types";
import { distribution } from "./bullpen-calibration";

export const BULLPEN_QUALITY_SCORE_VERSION_V2 = "bullpen_quality_v2";
export const BULLPEN_QUALITY_BASELINE_VERSION = "bullpen_quality_baseline_v1";

export type BullpenQualityMetric =
  | "era"
  | "whip"
  | "strikeoutRate"
  | "walkRate"
  | "kMinusBbRate"
  | "hitsPerBatterFaced"
  | "homeRunsPerBatterFaced"
  | "runsAllowedPerInning"
  | "leverageExecution";

export type BullpenQualityBaseline = {
  season: number;
  window: BullpenQualityWindow;
  metric: BullpenQualityMetric;
  teamCount: number;
  mean: number;
  standardDeviation: number;
  median: number;
  minimum: number;
  maximum: number;
  sampleQualityPolicy: string;
  source: "MLB_OFFICIAL";
  asOf: string;
  baselineHash: string;
  canonical: boolean;
  dataVersion: string;
};

export type BullpenSeasonQualityResult = {
  teams: MlbTeamBullpenFeatures[];
  reliefWindowsByTeam: Map<string, Partial<Record<BullpenQualityWindow, MlbTeamReliefWindow>>>;
  baselines: BullpenQualityBaseline[];
  sampleDistributions: Record<BullpenQualityWindow, {
    reliefInnings: ReturnType<typeof distribution>;
    battersFaced: ReturnType<typeof distribution>;
    sufficient: number;
    limited: number;
    insufficient: number;
    unavailable: number;
  }>;
  v1V2Summary: Array<{
    teamId: string;
    teamName: string;
    qualityV1?: number;
    qualityV2?: number;
    delta?: number;
    seasonComponent?: number;
    last30Component?: number;
    last14Component?: number;
    last7Component?: number;
    confidence?: BullpenQualityConfidence;
    warnings: string[];
  }>;
};

const WINDOWS: Array<{ window: BullpenQualityWindow; days?: number; innings: number; battersFaced: number }> = [
  { window: "SEASON", innings: 120, battersFaced: 500 },
  { window: "LAST_30_DAYS", days: 30, innings: 60, battersFaced: 240 },
  { window: "LAST_14_DAYS", days: 14, innings: 25, battersFaced: 100 },
  { window: "LAST_7_DAYS", days: 7, innings: 12, battersFaced: 45 },
];

const METRICS: Array<{ metric: BullpenQualityMetric; higherIsBetter: boolean; weight: number }> = [
  { metric: "era", higherIsBetter: false, weight: 0.16 },
  { metric: "runsAllowedPerInning", higherIsBetter: false, weight: 0.14 },
  { metric: "whip", higherIsBetter: false, weight: 0.16 },
  { metric: "hitsPerBatterFaced", higherIsBetter: false, weight: 0.1 },
  { metric: "strikeoutRate", higherIsBetter: true, weight: 0.12 },
  { metric: "walkRate", higherIsBetter: false, weight: 0.1 },
  { metric: "kMinusBbRate", higherIsBetter: true, weight: 0.14 },
  { metric: "homeRunsPerBatterFaced", higherIsBetter: false, weight: 0.06 },
  { metric: "leverageExecution", higherIsBetter: true, weight: 0.02 },
];

const WINDOW_WEIGHTS: Record<BullpenQualityWindow, number> = {
  SEASON: 0.5,
  LAST_30_DAYS: 0.25,
  LAST_14_DAYS: 0.15,
  LAST_7_DAYS: 0.1,
};

function round(value: number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function stableHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function parseBaseballInningsToOuts(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    const whole = Math.trunc(value);
    const fraction = value - whole;
    if (Math.abs(fraction - 0.1) < 0.001) return whole * 3 + 1;
    if (Math.abs(fraction - 0.2) < 0.001) return whole * 3 + 2;
    if (Math.abs(fraction - 1 / 3) < 0.02) return whole * 3 + 1;
    if (Math.abs(fraction - 2 / 3) < 0.02) return whole * 3 + 2;
    if (Math.abs(fraction) < 0.001) return whole * 3;
    return undefined;
  }
  const raw = typeof value === "number" ? value.toFixed(1) : String(value);
  const [wholeRaw, outsRaw = "0"] = raw.split(".");
  const whole = Number(wholeRaw);
  const outs = Number(outsRaw);
  if (!Number.isInteger(whole) || !Number.isInteger(outs) || outs < 0 || outs > 2) return undefined;
  return whole * 3 + outs;
}

export function outsToBaseballInnings(outs: number | undefined) {
  if (outs === undefined || !Number.isFinite(outs)) return undefined;
  return round(Math.floor(outs / 3) + (outs % 3) / 3, 2);
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function addDays(date: string, offset: number) {
  const copy = new Date(`${dateOnly(date)}T00:00:00Z`);
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy.toISOString().slice(0, 10);
}

function inWindow(appearance: MlbRelieverAppearance, asOf: string, days?: number) {
  if (days === undefined) return appearance.gameDate.slice(0, 10) <= dateOnly(asOf);
  const start = addDays(asOf, -days);
  const gameDate = dateOnly(appearance.gameDate);
  return gameDate >= start && gameDate <= dateOnly(asOf);
}

function sum(values: Array<number | undefined>) {
  const numeric = values.filter((value): value is number => Number.isFinite(value));
  return numeric.length ? numeric.reduce((total, value) => total + value, 0) : undefined;
}

function windowSampleQuality(window: BullpenQualityWindow, reliefInnings?: number, battersFaced?: number): MlbTeamReliefWindow["sampleQuality"] {
  const threshold = WINDOWS.find((item) => item.window === window);
  if (!threshold) return "UNAVAILABLE";
  if (!reliefInnings || !battersFaced) return "UNAVAILABLE";
  if (reliefInnings >= threshold.innings && battersFaced >= threshold.battersFaced) return "SUFFICIENT";
  if (reliefInnings >= threshold.innings * 0.5 && battersFaced >= threshold.battersFaced * 0.5) return "LIMITED";
  return "INSUFFICIENT";
}

function metricValue(window: MlbTeamReliefWindow, metric: BullpenQualityMetric) {
  if (metric === "leverageExecution") {
    const chances = (window.saves ?? 0) + (window.holds ?? 0) + (window.blownSaves ?? 0);
    return chances > 0 ? ((window.saves ?? 0) + (window.holds ?? 0)) / chances : undefined;
  }
  return window[metric];
}

export function buildReliefWindows(input: {
  teamId: string;
  teamName: string;
  appearances: MlbRelieverAppearance[];
  seasonStart: string;
  asOf: string;
}): Partial<Record<BullpenQualityWindow, MlbTeamReliefWindow>> {
  const reliefAppearances = input.appearances.filter((appearance) =>
    appearance.reliefAppearance &&
    !appearance.startedGame &&
    !appearance.warnings.some((warning) => warning.toLowerCase().includes("position-player")),
  );
  return Object.fromEntries(WINDOWS.map(({ window, days }) => {
    const startDate = days === undefined ? input.seasonStart : addDays(input.asOf, -days);
    const appearances = reliefAppearances.filter((appearance) => inWindow(appearance, input.asOf, days));
    const outs = sum(appearances.map((appearance) => parseBaseballInningsToOuts(appearance.inningsPitched)));
    const reliefInnings = outsToBaseballInnings(outs);
    const battersFaced = sum(appearances.map((appearance) => appearance.battersFaced));
    const earnedRuns = sum(appearances.map((appearance) => appearance.earnedRunsAllowed));
    const runsAllowed = sum(appearances.map((appearance) => appearance.runsAllowed));
    const hitsAllowed = sum(appearances.map((appearance) => appearance.hitsAllowed));
    const walksAllowed = sum(appearances.map((appearance) => appearance.walksAllowed));
    const strikeouts = sum(appearances.map((appearance) => appearance.strikeouts));
    const homeRunsAllowed = sum(appearances.map((appearance) => (appearance as MlbRelieverAppearance & { homeRunsAllowed?: number }).homeRunsAllowed));
    const gamesIncluded = new Set(appearances.map((appearance) => appearance.officialGameId)).size;
    const inningsForRates = outs === undefined ? undefined : outs / 3;
    const warnings = Array.from(new Set(appearances.flatMap((appearance) => appearance.warnings)));
    const row: MlbTeamReliefWindow = {
      teamId: input.teamId,
      teamName: input.teamName,
      window,
      startDate,
      endDate: dateOnly(input.asOf),
      gamesIncluded,
      reliefAppearances: appearances.length,
      reliefInnings,
      battersFaced,
      earnedRuns,
      runsAllowed,
      hitsAllowed,
      walksAllowed,
      strikeouts,
      homeRunsAllowed,
      saves: appearances.filter((appearance) => appearance.save).length,
      holds: appearances.filter((appearance) => appearance.hold).length,
      blownSaves: appearances.filter((appearance) => appearance.blownSave).length,
      gamesFinished: appearances.filter((appearance) => appearance.gameFinished).length,
      era: inningsForRates ? round(((earnedRuns ?? 0) * 9) / inningsForRates, 3) : undefined,
      whip: inningsForRates ? round(((hitsAllowed ?? 0) + (walksAllowed ?? 0)) / inningsForRates, 3) : undefined,
      strikeoutRate: battersFaced ? round((strikeouts ?? 0) / battersFaced, 4) : undefined,
      walkRate: battersFaced ? round((walksAllowed ?? 0) / battersFaced, 4) : undefined,
      kMinusBbRate: battersFaced ? round(((strikeouts ?? 0) - (walksAllowed ?? 0)) / battersFaced, 4) : undefined,
      hitsPerBatterFaced: battersFaced ? round((hitsAllowed ?? 0) / battersFaced, 4) : undefined,
      homeRunsPerBatterFaced: battersFaced ? round((homeRunsAllowed ?? 0) / battersFaced, 4) : undefined,
      runsAllowedPerInning: inningsForRates ? round((runsAllowed ?? 0) / inningsForRates, 4) : undefined,
      sampleQuality: windowSampleQuality(window, reliefInnings, battersFaced),
      metadata: {
        availability: appearances.length > 0 ? "AVAILABLE" : "UNAVAILABLE",
        source: "MLB_OFFICIAL",
        observedAt: input.asOf,
        warnings,
      },
      warnings,
    };
    return [window, row];
  })) as Partial<Record<BullpenQualityWindow, MlbTeamReliefWindow>>;
}

export function buildBullpenQualityBaselines(input: {
  season: number;
  asOf: string;
  windowsByTeam: Map<string, Partial<Record<BullpenQualityWindow, MlbTeamReliefWindow>>>;
}) {
  const baselines: BullpenQualityBaseline[] = [];
  WINDOWS.forEach(({ window }) => {
    METRICS.forEach(({ metric }) => {
      const values = Array.from(input.windowsByTeam.values())
        .map((windows) => windows[window])
        .filter((row): row is MlbTeamReliefWindow => row !== undefined && row.sampleQuality !== "UNAVAILABLE")
        .map((row) => metricValue(row, metric))
        .filter((value): value is number => Number.isFinite(value));
      const dist = distribution(values);
      if ((dist.count ?? 0) < 26 || !dist.standardDeviation || dist.standardDeviation <= 0.000001) return;
      const payload = {
        season: input.season,
        window,
        metric,
        teamCount: dist.count ?? 0,
        mean: dist.mean,
        standardDeviation: dist.standardDeviation,
        median: dist.median,
        minimum: dist.minimum,
        maximum: dist.maximum,
        sampleQualityPolicy: "SUFFICIENT_OR_LIMITED; UNAVAILABLE excluded; one row per team.",
        source: "MLB_OFFICIAL",
        asOf: dateOnly(input.asOf),
        dataVersion: BULLPEN_QUALITY_BASELINE_VERSION,
      };
      baselines.push({
        season: input.season,
        window,
        metric,
        teamCount: dist.count ?? 0,
        mean: dist.mean ?? 0,
        standardDeviation: dist.standardDeviation,
        median: dist.median ?? 0,
        minimum: dist.minimum ?? 0,
        maximum: dist.maximum ?? 0,
        sampleQualityPolicy: payload.sampleQualityPolicy,
        source: "MLB_OFFICIAL",
        asOf: input.asOf,
        baselineHash: stableHash(payload),
        canonical: true,
        dataVersion: BULLPEN_QUALITY_BASELINE_VERSION,
      });
    });
  });
  return baselines;
}

function normalize(value: number | undefined, baseline: BullpenQualityBaseline | undefined, higherIsBetter: boolean) {
  if (value === undefined || !baseline) return undefined;
  const z = clamp((value - baseline.mean) / baseline.standardDeviation, -3, 3);
  return higherIsBetter ? 50 + z * 12.5 : 50 - z * 12.5;
}

function scoreWindow(window: MlbTeamReliefWindow | undefined, baselines: BullpenQualityBaseline[]) {
  if (!window || window.sampleQuality === "UNAVAILABLE") return { score: undefined, components: [] as BullpenQualityComponent[] };
  const components: BullpenQualityComponent[] = [];
  METRICS.forEach(({ metric, higherIsBetter, weight }) => {
    const baseline = baselines.find((item) => item.window === window.window && item.metric === metric);
    const normalized = normalize(metricValue(window, metric), baseline, higherIsBetter);
    if (normalized === undefined) return;
    components.push({
      component: `${window.window}:${metric}`,
      rawValue: round(metricValue(window, metric), 4),
      normalizedScore: round(clamp(normalized), 1) ?? 0,
      weight,
      higherIsBetter,
    });
  });
  const totalWeight = components.reduce((total, item) => total + item.weight, 0);
  return {
    score: totalWeight > 0
      ? round(components.reduce((total, item) => total + item.normalizedScore * item.weight, 0) / totalWeight, 1)
      : undefined,
    components,
  };
}

function qualityConfidence(windows: Partial<Record<BullpenQualityWindow, MlbTeamReliefWindow>>, scoredWindows: number): BullpenQualityConfidence {
  const season = windows.SEASON?.sampleQuality ?? "UNAVAILABLE";
  const recentQualities = ["LAST_30_DAYS", "LAST_14_DAYS", "LAST_7_DAYS"]
    .map((window) => windows[window as BullpenQualityWindow]?.sampleQuality ?? "UNAVAILABLE");
  const sufficientRecent = recentQualities.filter((quality) => quality === "SUFFICIENT").length;
  const limitedRecent = recentQualities.filter((quality) => quality === "LIMITED").length;
  const windowCoverage = round(scoredWindows / 4, 2) ?? 0;
  const rawScore = season === "SUFFICIENT" ? 55 : season === "LIMITED" ? 40 : season === "INSUFFICIENT" ? 25 : 0;
  const score = clamp(rawScore + sufficientRecent * 12 + limitedRecent * 6 + windowCoverage * 15);
  const tier = score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : score > 0 ? "LOW" : "UNAVAILABLE";
  return {
    score: round(score, 1),
    tier,
    seasonSampleQuality: season,
    recentSampleQuality: recentQualities.join("|"),
    windowCoverage,
    warnings: tier === "LOW" ? ["Bullpen quality confidence is limited by sample coverage."] : [],
  };
}

export function applyBullpenQualityV2(input: {
  teams: MlbTeamBullpenFeatures[];
  appearancesByTeam: Map<string, MlbRelieverAppearance[]>;
  asOf: string;
  seasonStart: string;
  season: number;
}) : BullpenSeasonQualityResult {
  const reliefWindowsByTeam = new Map<string, Partial<Record<BullpenQualityWindow, MlbTeamReliefWindow>>>();
  input.teams.forEach((team) => {
    reliefWindowsByTeam.set(team.teamId, buildReliefWindows({
      teamId: team.teamId,
      teamName: team.teamName,
      appearances: input.appearancesByTeam.get(team.teamId) ?? [],
      seasonStart: input.seasonStart,
      asOf: input.asOf,
    }));
  });
  const baselines = buildBullpenQualityBaselines({
    season: input.season,
    asOf: input.asOf,
    windowsByTeam: reliefWindowsByTeam,
  });
  const sampleDistributions = Object.fromEntries(WINDOWS.map(({ window }) => {
    const rows = Array.from(reliefWindowsByTeam.values()).map((teamWindows) => teamWindows[window]).filter(Boolean) as MlbTeamReliefWindow[];
    return [window, {
      reliefInnings: distribution(rows.map((row) => row.reliefInnings)),
      battersFaced: distribution(rows.map((row) => row.battersFaced)),
      sufficient: rows.filter((row) => row.sampleQuality === "SUFFICIENT").length,
      limited: rows.filter((row) => row.sampleQuality === "LIMITED").length,
      insufficient: rows.filter((row) => row.sampleQuality === "INSUFFICIENT").length,
      unavailable: rows.filter((row) => row.sampleQuality === "UNAVAILABLE").length,
    }];
  })) as BullpenSeasonQualityResult["sampleDistributions"];

  const teams = input.teams.map((team) => {
    const windows = reliefWindowsByTeam.get(team.teamId) ?? {};
    const windowScores = Object.fromEntries(WINDOWS.map(({ window }) => [window, scoreWindow(windows[window], baselines)])) as Record<BullpenQualityWindow, ReturnType<typeof scoreWindow>>;
    const weighted = WINDOWS.map(({ window }) => ({
      window,
      score: windowScores[window].score,
      weight: WINDOW_WEIGHTS[window],
    })).filter((item) => item.score !== undefined);
    const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);
    const qualityScoreV2 = totalWeight > 0
      ? round(weighted.reduce((total, item) => total + (item.score ?? 0) * item.weight, 0) / totalWeight, 1)
      : undefined;
    const confidence = qualityConfidence(windows, weighted.length);
    const qualityComponents = WINDOWS.flatMap(({ window }) => windowScores[window].components.map((component) => ({
      ...component,
      weight: round(component.weight * WINDOW_WEIGHTS[window], 4) ?? component.weight,
    })));
    const qualityScoreV1 = team.qualityScoreV1 ?? (team.qualityScoreVersion === "bullpen_quality_v1" ? team.qualityScore : undefined);
    const warnings = [...team.warnings, ...confidence.warnings];
    return {
      ...team,
      qualityScoreV1,
      qualityScoreV2,
      qualityScore: qualityScoreV2,
      qualityScoreVersion: BULLPEN_QUALITY_SCORE_VERSION_V2,
      qualityComponents,
      qualityConfidence: confidence,
      seasonQualityComponent: windowScores.SEASON.score,
      last30QualityComponent: windowScores.LAST_30_DAYS.score,
      last14QualityComponent: windowScores.LAST_14_DAYS.score,
      last7QualityComponent: windowScores.LAST_7_DAYS.score,
      reliefWindows: windows,
      baselineVersion: BULLPEN_QUALITY_BASELINE_VERSION,
      qualitySample: {
        availability: qualityScoreV2 !== undefined ? "AVAILABLE" as const : "UNAVAILABLE" as const,
        seasonReliefInnings: windows.SEASON?.reliefInnings,
        recentReliefInnings: windows.LAST_14_DAYS?.reliefInnings,
        battersFaced: windows.SEASON?.battersFaced,
        warnings,
      },
      warnings,
    };
  });

  return {
    teams,
    reliefWindowsByTeam,
    baselines,
    sampleDistributions,
    v1V2Summary: teams.map((team) => ({
      teamId: team.teamId,
      teamName: team.teamName,
      qualityV1: team.qualityScoreV1,
      qualityV2: team.qualityScoreV2,
      delta: team.qualityScoreV1 !== undefined && team.qualityScoreV2 !== undefined ? round(team.qualityScoreV2 - team.qualityScoreV1, 1) : undefined,
      seasonComponent: team.seasonQualityComponent,
      last30Component: team.last30QualityComponent,
      last14Component: team.last14QualityComponent,
      last7Component: team.last7QualityComponent,
      confidence: team.qualityConfidence,
      warnings: team.warnings,
    })),
  };
}
