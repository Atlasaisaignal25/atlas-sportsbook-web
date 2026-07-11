import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { cachedMlbOfficialClient, type MlbOfficialClient } from "../providers/mlb-official-client";
import {
  buildStartingPitcherQuality,
  buildPitcherWindows,
  PITCHER_QUALITY_METRIC_WEIGHTS,
  pitcherScoreDistribution,
  STARTING_PITCHER_BASELINE_VERSION,
  STARTING_PITCHER_QUALITY_VERSION,
  STARTING_PITCHER_READINESS_VERSION,
  type PitcherQualityBaseline,
  type PitcherQualityBaselineSet,
  type PitcherQualityWindow,
  type PitcherWindow,
  type StartingPitcherQualitySnapshot,
} from "./pitcher-quality-engine";

const TABLE = "mlb_starting_pitcher_quality_snapshots";
const BASELINE_TABLE = "mlb_pitcher_quality_baseline_snapshots";
const PITCHER_WINDOWS: PitcherWindow[] = ["SEASON", "LAST_30_DAYS", "LAST_5_STARTS", "LAST_3_STARTS"];
const PITCHER_METRICS = Object.keys(PITCHER_QUALITY_METRIC_WEIGHTS);
const MIN_BASELINE_PITCHERS: Record<PitcherWindow, number> = {
  SEASON: 60,
  LAST_30_DAYS: 30,
  LAST_5_STARTS: 60,
  LAST_3_STARTS: 60,
};

export type PitcherQualityCaptureResult = {
  asOf: string;
  season: number;
  gamesInspected: number;
  starterPopulationCount: number;
  baselineEligiblePitchers: number;
  starterArchiveDiagnostics: StarterArchiveDiagnostics;
  baselines: PitcherQualityBaseline[];
  baselineSet: PitcherQualityBaselineSet;
  priorSnapshots: StartingPitcherQualitySnapshot[];
  priorVsProduction: PriorVsProductionSummary;
  pitchersResolved: number;
  snapshots: StartingPitcherQualitySnapshot[];
  providerErrors: string[];
};

export type StarterArchiveRow = {
  playerId: string;
  playerName: string;
  teamId?: string;
  teamName?: string;
  seasonStarts: number;
  seasonInningsOuts: number;
  windows: Record<PitcherWindow, PitcherQualityWindow>;
  warnings: string[];
};

export type StarterArchiveDiagnostics = {
  pitchersInspected: number;
  pitchersWithAtLeastOneStart: number;
  baselineEligiblePitchers: number;
  totalStartsIncluded: number;
  reliefRowsExcluded: number;
  duplicateRowsRemoved: number;
  openerWarnings: number;
  samplePolicy: Record<PitcherWindow, {
    sufficient: number;
    limited: number;
    insufficient: number;
    unavailable: number;
    passPct: number;
    startsMedian: number;
    startsP25: number;
    startsP75: number;
  }>;
};

export type PriorVsProductionSummary = {
  compared: number;
  priorFallbackScores: number;
  productionScoresCalculated: number;
  largestPositiveDelta?: Record<string, unknown>;
  largestNegativeDelta?: Record<string, unknown>;
  deltas: Array<Record<string, unknown>>;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function featureHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function statValue(stat: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = numeric(stat?.[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function inningsToOuts(value: unknown) {
  if (value === undefined || value === null) return 0;
  const [whole, frac = "0"] = String(value).split(".");
  const innings = Number(whole);
  const outs = Number(frac);
  return Number.isFinite(innings) && Number.isFinite(outs) && outs <= 2 ? innings * 3 + outs : 0;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function seasonKey(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? String(date.getUTCFullYear()) : String(new Date().getUTCFullYear());
}

function gameInWindow(gameDate: string | undefined, now: Date, futureHours = 36) {
  if (!gameDate) return false;
  const time = new Date(gameDate).getTime();
  return Number.isFinite(time) && time >= now.getTime() - 2 * 60 * 60 * 1000 && time <= now.getTime() + futureHours * 60 * 60 * 1000;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

function distribution(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return { count: 0, mean: undefined, standardDeviation: undefined, median: undefined, minimum: undefined, maximum: undefined };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
  return {
    count: sorted.length,
    mean: round(mean, 6),
    standardDeviation: round(Math.sqrt(variance), 6),
    median: round(percentile(0.5), 6),
    minimum: round(sorted[0], 6),
    maximum: round(sorted[sorted.length - 1], 6),
  };
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function baselineMetricValue(window: PitcherQualityWindow, metric: string) {
  return (window as unknown as Record<string, number | undefined>)[metric];
}

function firstWindowScore(snapshot: StartingPitcherQualitySnapshot, window: PitcherWindow) {
  const components = snapshot.qualityComponents.filter((component) => component.window === window && component.normalizedValue !== undefined);
  const weight = components.reduce((sum, component) => sum + component.effectiveWeight, 0);
  return weight > 0
    ? round(components.reduce((sum, component) => sum + (component.normalizedValue ?? 0) * component.effectiveWeight, 0) / weight, 1)
    : undefined;
}

function comparePriorVsProduction(prior: StartingPitcherQualitySnapshot[], production: StartingPitcherQualitySnapshot[]): PriorVsProductionSummary {
  const priorByKey = new Map(prior.map((snapshot) => [`${snapshot.officialGameId}:${snapshot.side}:${snapshot.playerId}`, snapshot]));
  const deltas = production.map((snapshot) => {
    const priorSnapshot = priorByKey.get(`${snapshot.officialGameId}:${snapshot.side}:${snapshot.playerId}`);
    const delta = snapshot.qualityScore !== undefined && priorSnapshot?.qualityScore !== undefined
      ? round(snapshot.qualityScore - priorSnapshot.qualityScore, 1)
      : undefined;
    return {
      playerId: snapshot.playerId,
      playerName: snapshot.playerName,
      teamName: snapshot.teamName,
      priorScore: priorSnapshot?.qualityScore,
      productionScore: snapshot.qualityScore,
      delta,
      seasonContribution: firstWindowScore(snapshot, "SEASON"),
      recentContribution: firstWindowScore(snapshot, "LAST_30_DAYS"),
      confidence: snapshot.qualityConfidence,
      baselineSource: snapshot.baselineSource,
    };
  });
  const comparable = deltas.filter((item) => typeof item.delta === "number") as Array<Record<string, unknown> & { delta: number }>;
  return {
    compared: comparable.length,
    priorFallbackScores: prior.filter((snapshot) => snapshot.baselineSource === "INITIAL_PRIOR_FALLBACK" && snapshot.qualityScore !== undefined).length,
    productionScoresCalculated: production.filter((snapshot) => snapshot.baselineSource === "PRODUCTION_BASELINE" && snapshot.qualityScore !== undefined).length,
    largestPositiveDelta: comparable.toSorted((a, b) => b.delta - a.delta)[0],
    largestNegativeDelta: comparable.toSorted((a, b) => a.delta - b.delta)[0],
    deltas: deltas.slice(0, 40),
  };
}

function samplePolicy(rows: StarterArchiveRow[]) {
  return Object.fromEntries(PITCHER_WINDOWS.map((window) => {
    const starts = rows.map((row) => row.windows[window]?.startsIncluded ?? 0).sort((a, b) => a - b);
    const percentile = (p: number) => starts[Math.min(starts.length - 1, Math.max(0, Math.floor((starts.length - 1) * p)))] ?? 0;
    const counts = rows.reduce((acc, row) => {
      const quality = row.windows[window]?.sampleQuality ?? "UNAVAILABLE";
      acc[quality] += 1;
      return acc;
    }, { SUFFICIENT: 0, LIMITED: 0, INSUFFICIENT: 0, UNAVAILABLE: 0 });
    return [window, {
      sufficient: counts.SUFFICIENT,
      limited: counts.LIMITED,
      insufficient: counts.INSUFFICIENT,
      unavailable: counts.UNAVAILABLE,
      passPct: rows.length > 0 ? round(((counts.SUFFICIENT + counts.LIMITED) / rows.length) * 100, 1) : 0,
      startsMedian: percentile(0.5),
      startsP25: percentile(0.25),
      startsP75: percentile(0.75),
    }];
  })) as StarterArchiveDiagnostics["samplePolicy"];
}

export async function buildStartingPitcherArchive(input: {
  season: number;
  asOf: string;
  client?: MlbOfficialClient;
}) {
  const client = input.client ?? cachedMlbOfficialClient;
  if (!client.getPitcherSeasonSplits) throw new Error("MLB official client does not support full pitcher season splits.");
  const seasonSplits = await client.getPitcherSeasonSplits(String(input.season));
  const uniqueByPlayer = new Map<string, NonNullable<typeof seasonSplits>[number]>();
  let duplicateRowsRemoved = 0;
  for (const split of seasonSplits ?? []) {
    const playerId = split?.player?.id === undefined ? undefined : String(split.player.id);
    if (!playerId) continue;
    const starts = statValue(split.stat, ["gamesStarted", "gamesStartedPitching"]) ?? 0;
    const previous = uniqueByPlayer.get(playerId);
    if (previous) {
      duplicateRowsRemoved += 1;
      const previousStarts = statValue(previous.stat, ["gamesStarted", "gamesStartedPitching"]) ?? 0;
      if (starts > previousStarts) uniqueByPlayer.set(playerId, split);
    } else {
      uniqueByPlayer.set(playerId, split);
    }
  }
  const starters = Array.from(uniqueByPlayer.values()).filter((split) => (statValue(split.stat, ["gamesStarted", "gamesStartedPitching"]) ?? 0) > 0);
  const rows = (await mapWithConcurrency(starters, 8, async (split) => {
    const playerId = String(split.player?.id);
    const gameLog = await client.getPitcherGameLog(playerId, String(input.season));
    const log = (gameLog ?? []).map((entry) => ({ date: entry?.date, stat: entry?.stat }));
    const windows = buildPitcherWindows({ gameLog: log, asOf: input.asOf });
    const allWindows = {
      SEASON: windows.seasonWindow,
      LAST_30_DAYS: windows.last30Window,
      LAST_5_STARTS: windows.last5Starts,
      LAST_3_STARTS: windows.last3Starts,
    };
    const reliefRowsExcluded = Math.max(0, (gameLog ?? []).length - windows.seasonWindow.startsIncluded);
    return {
      playerId,
      playerName: split.player?.fullName ?? playerId,
      teamId: split.team?.id === undefined ? undefined : String(split.team.id),
      teamName: split.team?.name,
      seasonStarts: windows.seasonWindow.startsIncluded,
      seasonInningsOuts: windows.seasonWindow.inningsOuts,
      windows: allWindows,
      warnings: [
        ...windows.warnings,
        ...(reliefRowsExcluded > 0 ? [`${reliefRowsExcluded} relief row(s) excluded.`] : []),
      ],
    } satisfies StarterArchiveRow;
  }));
  const baselineEligiblePitchers = rows.filter((row) => row.seasonStarts >= 5 && row.seasonInningsOuts >= 60).length;
  const diagnostics: StarterArchiveDiagnostics = {
    pitchersInspected: uniqueByPlayer.size,
    pitchersWithAtLeastOneStart: rows.length,
    baselineEligiblePitchers,
    totalStartsIncluded: rows.reduce((sum, row) => sum + row.seasonStarts, 0),
    reliefRowsExcluded: rows.reduce((sum, row) => sum + Math.max(0, row.warnings.find((warning) => warning.includes("relief row")) ? Number(row.warnings.find((warning) => warning.includes("relief row"))?.match(/\\d+/)?.[0] ?? 0) : 0), 0),
    duplicateRowsRemoved,
    openerWarnings: rows.filter((row) => row.warnings.some((warning) => warning.toLowerCase().includes("opener"))).length,
    samplePolicy: samplePolicy(rows),
  };
  return { rows, diagnostics };
}

export function buildPitcherQualityBaselines(input: {
  season: number;
  asOf: string;
  archiveRows: StarterArchiveRow[];
}): PitcherQualityBaselineSet {
  const metrics: Record<string, PitcherQualityBaseline> = {};
  const warnings: string[] = [];
  for (const window of PITCHER_WINDOWS) {
    for (const metric of PITCHER_METRICS) {
      const valuesByPlayer = new Map<string, number>();
      for (const row of input.archiveRows) {
        if (window === "SEASON" && (row.seasonStarts < 5 || row.seasonInningsOuts < 60)) continue;
        if (row.windows[window].sampleQuality === "UNAVAILABLE") continue;
        const value = baselineMetricValue(row.windows[window], metric);
        if (value !== undefined && Number.isFinite(value)) valuesByPlayer.set(row.playerId, value);
      }
      const stats = distribution(Array.from(valuesByPlayer.values()));
      const ready = Boolean(
        stats.count >= MIN_BASELINE_PITCHERS[window] &&
        (stats.standardDeviation ?? 0) > 0.000001 &&
        stats.minimum !== undefined &&
        stats.maximum !== undefined,
      );
      if (!ready) warnings.push(`${window}:${metric} production baseline not ready; count=${stats.count}, sd=${stats.standardDeviation ?? "none"}.`);
      const payload = {
        season: input.season,
        window,
        metric,
        count: stats.count,
        mean: stats.mean,
        standardDeviation: stats.standardDeviation,
        median: stats.median,
        minimum: stats.minimum,
        maximum: stats.maximum,
        version: STARTING_PITCHER_BASELINE_VERSION,
      };
      metrics[`${window}:${metric}`] = {
        season: input.season,
        window,
        metric,
        pitcherCount: stats.count,
        sampleQualityPolicy: window === "SEASON" ? "one pitcher ID, starter-only, >=5 starts and >=20 IP" : "one pitcher ID, starter-only, non-unavailable window",
        mean: stats.mean ?? 0,
        standardDeviation: stats.standardDeviation ?? 0,
        median: stats.median ?? 0,
        minimum: stats.minimum ?? 0,
        maximum: stats.maximum ?? 0,
        asOf: input.asOf,
        source: "MLB_OFFICIAL",
        sourceUpdatedAt: input.asOf,
        baselineVersion: STARTING_PITCHER_BASELINE_VERSION,
        baselineHash: featureHash(payload),
        ready,
        warnings: ready ? [] : [`Baseline readiness failed for ${window}:${metric}.`],
      };
    }
  }
  return {
    season: input.season,
    asOf: input.asOf,
    baselineVersion: STARTING_PITCHER_BASELINE_VERSION,
    source: "MLB_OFFICIAL",
    ready: PITCHER_WINDOWS.every((window) => PITCHER_METRICS.every((metric) => metrics[`${window}:${metric}`]?.ready)),
    metrics,
    warnings,
  };
}

export async function captureStartingPitcherQuality(input: {
  asOf?: string;
  client?: MlbOfficialClient;
} = {}): Promise<PitcherQualityCaptureResult> {
  const asOf = input.asOf ?? new Date().toISOString();
  const now = new Date(asOf);
  const client = input.client ?? cachedMlbOfficialClient;
  const season = Number(seasonKey(asOf));
  const archive = await buildStartingPitcherArchive({ season, asOf, client });
  const baselineSet = buildPitcherQualityBaselines({ season, asOf, archiveRows: archive.rows });
  const dates = [dateKey(now), dateKey(addDays(now, 1))];
  const games = (await Promise.all(dates.map((date) => client.getSchedule(date)))).flat();
  const uniqueGames = Array.from(new Map(games.filter((game) => gameInWindow(game.gameDate, now)).map((game) => [String(game.gamePk), game])).values());
  const providerErrors: string[] = [];
  const snapshotPairs = (await mapWithConcurrency(uniqueGames, 4, async (game) => {
    const starters = [
      { side: "HOME" as const, team: game.teams?.home?.team, pitcher: game.teams?.home?.probablePitcher },
      { side: "AWAY" as const, team: game.teams?.away?.team, pitcher: game.teams?.away?.probablePitcher },
    ];
    return (await Promise.all(starters.map(async (starter) => {
      if (!starter.pitcher?.id) return undefined;
      try {
        const playerId = String(starter.pitcher.id);
        const season = seasonKey(game.gameDate ?? asOf);
        const [person, gameLog] = await Promise.all([
          client.getPerson(playerId),
          client.getPitcherGameLog(playerId, String(season)),
        ]);
        const handedness: "L" | "R" | undefined = person?.pitchHand?.code === "L" ? "L" : person?.pitchHand?.code === "R" ? "R" : undefined;
        const commonInput = {
          playerId,
          playerName: starter.pitcher.fullName ?? person?.fullName ?? playerId,
          teamId: starter.team?.id === undefined ? undefined : String(starter.team.id),
          teamName: starter.team?.name,
          officialGameId: game.gamePk === undefined ? undefined : String(game.gamePk),
          side: starter.side,
          handedness,
          status: "PROBABLE" as const,
          gameLog: (gameLog ?? []).map((entry) => ({ date: entry?.date, stat: entry?.stat })),
          commenceTime: game.gameDate,
          asOf,
        };
        return {
          production: buildStartingPitcherQuality({ ...commonInput, baselineSet }),
          prior: buildStartingPitcherQuality(commonInput),
        };
      } catch (error) {
        providerErrors.push(error instanceof Error ? error.message : "Unknown pitcher quality provider error");
        return undefined;
      }
    }))).filter(Boolean) as Array<{ production: StartingPitcherQualitySnapshot; prior: StartingPitcherQualitySnapshot }>;
  })).flat();
  const snapshots = snapshotPairs.map((pair) => pair.production);
  const priorSnapshots = snapshotPairs.map((pair) => pair.prior);
  const priorVsProduction = comparePriorVsProduction(priorSnapshots, snapshots);
  return {
    asOf,
    season,
    gamesInspected: uniqueGames.length,
    starterPopulationCount: archive.rows.length,
    baselineEligiblePitchers: archive.diagnostics.baselineEligiblePitchers,
    starterArchiveDiagnostics: archive.diagnostics,
    baselines: Object.values(baselineSet.metrics),
    baselineSet,
    priorSnapshots,
    priorVsProduction,
    pitchersResolved: snapshots.length,
    snapshots,
    providerErrors,
  };
}

export function buildStartingPitcherQualityRows(snapshots: StartingPitcherQualitySnapshot[]) {
  return snapshots.map((snapshot) => {
    const payload = {
      playerId: snapshot.playerId,
      officialGameId: snapshot.officialGameId,
      side: snapshot.side,
      qualityScore: snapshot.qualityScore,
      qualityVersion: snapshot.qualityVersion,
      baselineVersion: snapshot.baselineVersion,
      baselineSource: snapshot.baselineSource,
      qualityComponents: snapshot.qualityComponents,
      qualityConfidence: snapshot.qualityConfidence,
      readinessScore: snapshot.readinessScore,
      readinessVersion: snapshot.readinessVersion,
      readinessComponents: snapshot.readinessComponents,
      sampleQuality: snapshot.sampleQuality,
      sourceVersions: snapshot.sourceVersions,
    };
    return {
      player_id: snapshot.playerId,
      player_name: snapshot.playerName,
      team_id: snapshot.teamId,
      team_name: snapshot.teamName,
      official_game_id: snapshot.officialGameId,
      odds_event_id: snapshot.oddsEventId,
      side: snapshot.side,
      quality_score: snapshot.qualityScore,
      quality_version: snapshot.qualityVersion,
      baseline_version: snapshot.baselineVersion,
      baseline_source: snapshot.baselineSource,
      baseline_as_of: snapshot.baselineAsOf,
      quality_components: snapshot.qualityComponents,
      quality_confidence: snapshot.qualityConfidence,
      readiness_score: snapshot.readinessScore,
      readiness_version: snapshot.readinessVersion,
      readiness_components: snapshot.readinessComponents,
      season_window: snapshot.seasonWindow,
      last30_window: snapshot.last30Window,
      last5_starts: snapshot.last5Starts,
      last3_starts: snapshot.last3Starts,
      advanced_metrics: snapshot.advancedMetrics,
      sample_quality: snapshot.sampleQuality,
      source_versions: snapshot.sourceVersions,
      warnings: snapshot.warnings,
      data_version: snapshot.qualityVersion,
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: snapshot.capturedAt,
    };
  });
}

export function buildPitcherQualityBaselineRows(baselines: PitcherQualityBaseline[]) {
  return baselines.map((baseline) => ({
    season: baseline.season,
    baseline_window: baseline.window,
    metric: baseline.metric,
    pitcher_count: baseline.pitcherCount,
    sample_quality_policy: baseline.sampleQualityPolicy,
    mean: baseline.mean,
    standard_deviation: baseline.standardDeviation,
    median: baseline.median,
    minimum: baseline.minimum,
    maximum: baseline.maximum,
    as_of: baseline.asOf,
    source: baseline.source,
    source_updated_at: baseline.sourceUpdatedAt,
    baseline_version: baseline.baselineVersion,
    baseline_hash: baseline.baselineHash,
    canonical: baseline.ready,
  }));
}

export async function insertPitcherQualityBaselinesDeduped(baselines: PitcherQualityBaseline[]) {
  const rows = buildPitcherQualityBaselineRows(baselines);
  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from(BASELINE_TABLE).upsert(rows, { onConflict: "baseline_hash", ignoreDuplicates: true }).select("id");
  if (error) return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };
  const readyHashes = rows.filter((row) => row.canonical).map((row) => row.baseline_hash);
  if (readyHashes.length > 0) {
    const markOld = await supabase
      .from(BASELINE_TABLE)
      .update({ canonical: false })
      .eq("baseline_version", STARTING_PITCHER_BASELINE_VERSION)
      .not("baseline_hash", "in", `(${readyHashes.join(",")})`)
      .eq("canonical", true);
    if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };
    const markCurrent = await supabase.from(BASELINE_TABLE).update({ canonical: true }).in("baseline_hash", readyHashes);
    if (markCurrent.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };
  }
  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] as string[] };
}

export async function insertStartingPitcherQualitySnapshotsDeduped(snapshots: StartingPitcherQualitySnapshot[]) {
  const rows = buildStartingPitcherQualityRows(snapshots);
  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from(TABLE).upsert(rows, { onConflict: "feature_hash", ignoreDuplicates: true }).select("id");
  if (error) return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };
  const hashes = rows.map((row) => row.feature_hash);
  const markOld = await supabase.from(TABLE).update({
    canonical: false,
    superseded_at: new Date().toISOString(),
    invalid_reason: "SUPERSEDED_BY_PITCHER_QUALITY_CANONICAL_CAPTURE",
  }).not("feature_hash", "in", `(${hashes.join(",")})`).eq("canonical", true);
  if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };
  const markCurrent = await supabase.from(TABLE).update({ canonical: true, superseded_at: null, invalid_reason: null }).in("feature_hash", hashes);
  if (markCurrent.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };
  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] as string[] };
}

function countBy(rows: any[], selector: (row: any) => string | undefined) {
  return rows.reduce((acc: Record<string, number>, row) => {
    const key = selector(row) ?? "UNAVAILABLE";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getStartingPitcherQualitySnapshotStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from(TABLE).select("id", { count: "exact", head: true });
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, pitchersScored: 0, latestRefresh: undefined as string | undefined, errors: [error.message] };
  const { count: canonicalSnapshots } = await supabase.from(TABLE).select("id", { count: "exact", head: true }).eq("canonical", true);
  const { count: noncanonicalSnapshots } = await supabase.from(TABLE).select("id", { count: "exact", head: true }).eq("canonical", false);
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("player_id,player_name,team_name,quality_score,quality_confidence,readiness_score,baseline_version,baseline_source,baseline_as_of,season_window,last30_window,last5_starts,last3_starts,quality_components,captured_at")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const baselineHealth = await getPitcherQualityBaselineStatus();
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    noncanonicalSnapshots: noncanonicalSnapshots ?? 0,
    pitchersScored: rows.filter((row: any) => row.quality_score !== null).length,
    pitchersUnavailable: rows.filter((row: any) => row.quality_score === null).length,
    priorFallbackCount: rows.filter((row: any) => row.baseline_source !== "PRODUCTION_BASELINE").length,
    baselineHealth,
    baselineSourceDistribution: countBy(rows, (row) => row.baseline_source),
    latestRefresh: rows[0]?.captured_at as string | undefined,
    qualityDistribution: pitcherScoreDistribution(rows.map((row: any) => row.quality_score ?? undefined)),
    readinessDistribution: pitcherScoreDistribution(rows.map((row: any) => row.readiness_score ?? undefined)),
    confidenceDistribution: countBy(rows, (row) => row.quality_confidence?.tier),
    examples: rows.slice(0, 6),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}

export async function getPitcherQualityBaselineStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from(BASELINE_TABLE).select("id", { count: "exact", head: true });
  if (error) return { healthy: false, totalBaselines: 0, canonicalBaselines: 0, errors: [error.message] };
  const { count: canonicalBaselines } = await supabase.from(BASELINE_TABLE).select("id", { count: "exact", head: true }).eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from(BASELINE_TABLE)
    .select("season,baseline_window,metric,pitcher_count,mean,standard_deviation,median,minimum,maximum,as_of,baseline_version,canonical")
    .eq("canonical", true)
    .order("as_of", { ascending: false })
    .limit(64);
  const rows = data ?? [];
  return {
    healthy: !latestError,
    totalBaselines: count ?? 0,
    canonicalBaselines: canonicalBaselines ?? 0,
    baselineVersion: rows[0]?.baseline_version as string | undefined,
    latestAsOf: rows[0]?.as_of as string | undefined,
    windows: Array.from(new Set(rows.map((row: any) => row.baseline_window))),
    metrics: Array.from(new Set(rows.map((row: any) => row.metric))),
    minPitcherCount: rows.length ? Math.min(...rows.map((row: any) => Number(row.pitcher_count) || 0)) : 0,
    maxPitcherCount: rows.length ? Math.max(...rows.map((row: any) => Number(row.pitcher_count) || 0)) : 0,
    examples: rows.slice(0, 8),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}
