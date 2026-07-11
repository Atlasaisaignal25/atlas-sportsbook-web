import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { cachedMlbOfficialClient, type MlbOfficialClient } from "../providers/mlb-official-client";
import {
  buildStartingPitcherQuality,
  pitcherScoreDistribution,
  STARTING_PITCHER_QUALITY_VERSION,
  STARTING_PITCHER_READINESS_VERSION,
  type StartingPitcherQualitySnapshot,
} from "./pitcher-quality-engine";

const TABLE = "mlb_starting_pitcher_quality_snapshots";

export type PitcherQualityCaptureResult = {
  asOf: string;
  gamesInspected: number;
  pitchersResolved: number;
  snapshots: StartingPitcherQualitySnapshot[];
  providerErrors: string[];
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

export async function captureStartingPitcherQuality(input: {
  asOf?: string;
  client?: MlbOfficialClient;
} = {}): Promise<PitcherQualityCaptureResult> {
  const asOf = input.asOf ?? new Date().toISOString();
  const now = new Date(asOf);
  const client = input.client ?? cachedMlbOfficialClient;
  const dates = [dateKey(now), dateKey(addDays(now, 1))];
  const games = (await Promise.all(dates.map((date) => client.getSchedule(date)))).flat();
  const uniqueGames = Array.from(new Map(games.filter((game) => gameInWindow(game.gameDate, now)).map((game) => [String(game.gamePk), game])).values());
  const providerErrors: string[] = [];
  const snapshots = (await mapWithConcurrency(uniqueGames, 4, async (game) => {
    const starters = [
      { side: "HOME" as const, team: game.teams?.home?.team, pitcher: game.teams?.home?.probablePitcher },
      { side: "AWAY" as const, team: game.teams?.away?.team, pitcher: game.teams?.away?.probablePitcher },
    ];
    return (await Promise.all(starters.map(async (starter) => {
      if (!starter.pitcher?.id) return undefined;
      try {
        const playerId = String(starter.pitcher.id);
        const season = seasonKey(game.gameDate ?? asOf);
        const [person, seasonStats, gameLog] = await Promise.all([
          client.getPerson(playerId),
          client.getPitcherSeasonStats(playerId, season),
          client.getPitcherGameLog(playerId, season),
        ]);
        return buildStartingPitcherQuality({
          playerId,
          playerName: starter.pitcher.fullName ?? person?.fullName ?? playerId,
          teamId: starter.team?.id === undefined ? undefined : String(starter.team.id),
          teamName: starter.team?.name,
          officialGameId: game.gamePk === undefined ? undefined : String(game.gamePk),
          side: starter.side,
          handedness: person?.pitchHand?.code === "L" ? "L" : person?.pitchHand?.code === "R" ? "R" : undefined,
          status: "PROBABLE",
          seasonStats,
          gameLog: (gameLog ?? []).map((entry) => ({ date: entry?.date, stat: entry?.stat })),
          commenceTime: game.gameDate,
          asOf,
        });
      } catch (error) {
        providerErrors.push(error instanceof Error ? error.message : "Unknown pitcher quality provider error");
        return undefined;
      }
    }))).filter(Boolean) as StartingPitcherQualitySnapshot[];
  })).flat();
  return {
    asOf,
    gamesInspected: uniqueGames.length,
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
      qualityComponents: snapshot.qualityComponents,
      qualityConfidence: snapshot.qualityConfidence,
      readinessScore: snapshot.readinessScore,
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
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: snapshot.capturedAt,
    };
  });
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
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("player_id,player_name,team_name,quality_score,quality_confidence,readiness_score,captured_at")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    pitchersScored: rows.filter((row: any) => row.quality_score !== null).length,
    pitchersUnavailable: rows.filter((row: any) => row.quality_score === null).length,
    latestRefresh: rows[0]?.captured_at as string | undefined,
    qualityDistribution: pitcherScoreDistribution(rows.map((row: any) => row.quality_score ?? undefined)),
    readinessDistribution: pitcherScoreDistribution(rows.map((row: any) => row.readiness_score ?? undefined)),
    confidenceDistribution: countBy(rows, (row) => row.quality_confidence?.tier),
    examples: rows.slice(0, 6),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}
