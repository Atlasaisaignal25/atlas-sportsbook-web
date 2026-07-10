import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type {
  MlbLineupChange,
  MlbLineupSnapshot,
  MlbStarterVerificationSnapshot,
  NormalizedLineupPlayer,
  NormalizedTeamLineup,
  StarterVerificationResult,
} from "./types";

const LINEUP_TABLE = "mlb_lineup_snapshots";
const EVENT_TABLE = "mlb_lineup_change_events";
const STARTER_TABLE = "mlb_starter_verification_snapshots";

type LineupSnapshotRow = {
  id?: string;
  official_game_id: string;
  odds_event_id: string | null;
  sport: string;
  team_id: string | null;
  team_name: string;
  side: "HOME" | "AWAY";
  game_date: string | null;
  game_status: string | null;
  confirmed: boolean;
  batting_order_complete: boolean;
  player_count: number;
  batting_order: NormalizedLineupPlayer[];
  lineup_hash: string;
  source: "MLB_OFFICIAL";
  source_updated_at: string | null;
  captured_at: string;
  created_at?: string;
};

type StarterVerificationRow = {
  id?: string;
  official_game_id: string;
  odds_event_id: string | null;
  team_id: string | null;
  team_name: string;
  side: "HOME" | "AWAY";
  probable_pitcher_id: string | null;
  probable_pitcher_name: string | null;
  confirmed_pitcher_id: string | null;
  confirmed_pitcher_name: string | null;
  verification_status: StarterVerificationResult["status"];
  captured_at: string;
  created_at?: string;
  verification_hash: string;
};

export type LineupSnapshotWriteResult = {
  inserted: boolean;
  duplicate: boolean;
  snapshotId?: string;
  warnings: string[];
};

export type StarterVerificationWriteResult = {
  inserted: boolean;
  duplicate: boolean;
  snapshotId?: string;
  warnings: string[];
};

export type LineupPersistenceStatus = {
  ok: boolean;
  storageHealth: "OK" | "ERROR";
  totalSnapshots: number;
  gamesTracked: number;
  teamsTracked: number;
  latestCapture?: string;
  duplicateCountAvailable: boolean;
  warnings: string[];
};

export type LineupChangeStatus = {
  ok: boolean;
  totalVerifiedEvents: number;
  firstConfirmedLineups: number;
  playerRemovals: number;
  playerAdditions: number;
  battingOrderChanges: number;
  lateScratches: number;
  latestEvents: MlbLineupChange[];
  warnings: string[];
};

export type StarterVerificationStatus = {
  ok: boolean;
  probableOnlyCount: number;
  matchedCount: number;
  changedCount: number;
  ambiguousCount: number;
  latestChanges: MlbStarterVerificationSnapshot[];
  warnings: string[];
};

function hashObject(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sortedPlayers(players: NormalizedLineupPlayer[]) {
  return [...players].sort((a, b) => {
    const orderA = a.battingOrder ?? 999;
    const orderB = b.battingOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.playerId.localeCompare(b.playerId);
  });
}

export function buildLineupHash(input: {
  officialGameId: string;
  side: "HOME" | "AWAY";
  confirmed: boolean;
  players: NormalizedLineupPlayer[];
}) {
  return hashObject({
    officialGameId: input.officialGameId,
    side: input.side,
    confirmed: input.confirmed,
    players: sortedPlayers(input.players).map((player) => ({
      playerId: player.playerId,
      battingOrder: player.battingOrder ?? null,
      positionCode: player.positionCode ?? null,
    })),
  });
}

export function buildStarterVerificationHash(input: {
  officialGameId: string;
  side: "HOME" | "AWAY";
  verification: StarterVerificationResult;
}) {
  return hashObject({
    officialGameId: input.officialGameId,
    side: input.side,
    probablePitcherId: input.verification.probablePitcherId ?? null,
    confirmedPitcherId: input.verification.confirmedPitcherId ?? null,
    status: input.verification.status,
  });
}

export function buildLineupSnapshot(input: {
  officialGameId: string;
  oddsEventId?: string;
  side: "HOME" | "AWAY";
  lineup: NormalizedTeamLineup;
  gameDate?: string;
  gameStatus?: string;
  sourceUpdatedAt?: string;
  capturedAt?: string;
}): MlbLineupSnapshot {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  return {
    officialGameId: input.officialGameId,
    oddsEventId: input.oddsEventId,
    sport: "MLB",
    teamId: input.lineup.teamId,
    teamName: input.lineup.teamName,
    side: input.side,
    gameDate: input.gameDate,
    gameStatus: input.gameStatus,
    confirmed: input.lineup.confirmed,
    battingOrderComplete: input.lineup.battingOrderComplete,
    playerCount: input.lineup.actualPlayerCount,
    battingOrder: sortedPlayers(input.lineup.players),
    lineupHash: buildLineupHash({
      officialGameId: input.officialGameId,
      side: input.side,
      confirmed: input.lineup.confirmed,
      players: input.lineup.players,
    }),
    source: "MLB_OFFICIAL",
    sourceUpdatedAt: input.sourceUpdatedAt,
    capturedAt,
  };
}

function toSnapshotRow(snapshot: MlbLineupSnapshot): LineupSnapshotRow {
  return {
    official_game_id: snapshot.officialGameId,
    odds_event_id: snapshot.oddsEventId ?? null,
    sport: snapshot.sport,
    team_id: snapshot.teamId ?? null,
    team_name: snapshot.teamName,
    side: snapshot.side,
    game_date: snapshot.gameDate ?? null,
    game_status: snapshot.gameStatus ?? null,
    confirmed: snapshot.confirmed,
    batting_order_complete: snapshot.battingOrderComplete,
    player_count: snapshot.playerCount,
    batting_order: snapshot.battingOrder,
    lineup_hash: snapshot.lineupHash,
    source: snapshot.source,
    source_updated_at: snapshot.sourceUpdatedAt ?? null,
    captured_at: snapshot.capturedAt,
  };
}

function fromSnapshotRow(row: LineupSnapshotRow): MlbLineupSnapshot {
  return {
    id: row.id,
    officialGameId: row.official_game_id,
    oddsEventId: row.odds_event_id ?? undefined,
    sport: "MLB",
    teamId: row.team_id ?? undefined,
    teamName: row.team_name,
    side: row.side,
    gameDate: row.game_date ?? undefined,
    gameStatus: row.game_status ?? undefined,
    confirmed: row.confirmed,
    battingOrderComplete: row.batting_order_complete,
    playerCount: row.player_count,
    battingOrder: row.batting_order ?? [],
    lineupHash: row.lineup_hash,
    source: "MLB_OFFICIAL",
    sourceUpdatedAt: row.source_updated_at ?? undefined,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
  };
}

function toStarterRow(snapshot: MlbStarterVerificationSnapshot): StarterVerificationRow {
  return {
    official_game_id: snapshot.officialGameId,
    odds_event_id: snapshot.oddsEventId ?? null,
    team_id: snapshot.teamId ?? null,
    team_name: snapshot.teamName,
    side: snapshot.side,
    probable_pitcher_id: snapshot.probablePitcherId ?? null,
    probable_pitcher_name: snapshot.probablePitcherName ?? null,
    confirmed_pitcher_id: snapshot.confirmedPitcherId ?? null,
    confirmed_pitcher_name: snapshot.confirmedPitcherName ?? null,
    verification_status: snapshot.verificationStatus,
    captured_at: snapshot.capturedAt,
    verification_hash: snapshot.verificationHash,
  };
}

function fromStarterRow(row: StarterVerificationRow): MlbStarterVerificationSnapshot {
  return {
    id: row.id,
    officialGameId: row.official_game_id,
    oddsEventId: row.odds_event_id ?? undefined,
    teamId: row.team_id ?? undefined,
    teamName: row.team_name,
    side: row.side,
    probablePitcherId: row.probable_pitcher_id ?? undefined,
    probablePitcherName: row.probable_pitcher_name ?? undefined,
    confirmedPitcherId: row.confirmed_pitcher_id ?? undefined,
    confirmedPitcherName: row.confirmed_pitcher_name ?? undefined,
    verificationStatus: row.verification_status,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    verificationHash: row.verification_hash,
  };
}

export function buildStarterVerificationSnapshot(input: {
  officialGameId: string;
  oddsEventId?: string;
  teamId?: string;
  teamName: string;
  side: "HOME" | "AWAY";
  verification: StarterVerificationResult;
  capturedAt?: string;
}): MlbStarterVerificationSnapshot {
  return {
    officialGameId: input.officialGameId,
    oddsEventId: input.oddsEventId,
    teamId: input.teamId,
    teamName: input.teamName,
    side: input.side,
    probablePitcherId: input.verification.probablePitcherId,
    probablePitcherName: input.verification.probablePitcherName,
    confirmedPitcherId: input.verification.confirmedPitcherId,
    confirmedPitcherName: input.verification.confirmedPitcherName,
    verificationStatus: input.verification.status,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    verificationHash: buildStarterVerificationHash({
      officialGameId: input.officialGameId,
      side: input.side,
      verification: input.verification,
    }),
  };
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  return error?.code === "23505" || (error?.message ?? "").toLowerCase().includes("duplicate");
}

function repositoryErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
}

export async function insertLineupSnapshotDeduped(snapshot: MlbLineupSnapshot): Promise<LineupSnapshotWriteResult> {
  const warnings: string[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(LINEUP_TABLE)
      .insert(toSnapshotRow(snapshot))
      .select("id")
      .single();

    if (error) {
      if (isUniqueViolation(error)) return { inserted: false, duplicate: true, warnings };
      throw error;
    }

    return { inserted: true, duplicate: false, snapshotId: data?.id, warnings };
  } catch (error) {
    warnings.push(repositoryErrorMessage(error, "Unable to insert lineup snapshot."));
    return { inserted: false, duplicate: false, warnings };
  }
}

export async function getLatestLineupSnapshot(officialGameId: string, side: "HOME" | "AWAY") {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(LINEUP_TABLE)
    .select("*")
    .eq("official_game_id", officialGameId)
    .eq("side", side)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? fromSnapshotRow(data as LineupSnapshotRow) : null;
}

export async function getFirstConfirmedLineupSnapshot(officialGameId: string, side: "HOME" | "AWAY") {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(LINEUP_TABLE)
    .select("*")
    .eq("official_game_id", officialGameId)
    .eq("side", side)
    .eq("confirmed", true)
    .order("captured_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? fromSnapshotRow(data as LineupSnapshotRow) : null;
}

export async function getLineupSnapshotHistory(officialGameId: string, side: "HOME" | "AWAY", limit = 25) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(LINEUP_TABLE)
    .select("*")
    .eq("official_game_id", officialGameId)
    .eq("side", side)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row: LineupSnapshotRow) => fromSnapshotRow(row));
}

export async function insertLineupChangeEventDeduped(change: MlbLineupChange) {
  const eventHash = hashObject({
    officialGameId: change.officialGameId,
    side: change.side,
    previousSnapshotId: change.previousSnapshotId ?? null,
    currentSnapshotId: change.currentSnapshotId ?? null,
    changeType: change.changeType,
    addedPlayers: change.addedPlayers.map((player) => player.playerId).sort(),
    removedPlayers: change.removedPlayers.map((player) => player.playerId).sort(),
    battingOrderChanges: change.battingOrderChanges,
    positionChanges: change.positionChanges,
  });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(EVENT_TABLE)
    .insert({
      official_game_id: change.officialGameId,
      odds_event_id: change.oddsEventId ?? null,
      team_id: change.teamId ?? null,
      team_name: change.teamName,
      side: change.side,
      change_type: change.changeType,
      added_players: change.addedPlayers,
      removed_players: change.removedPlayers,
      batting_order_changes: change.battingOrderChanges,
      position_changes: change.positionChanges,
      previous_snapshot_id: change.previousSnapshotId ?? null,
      current_snapshot_id: change.currentSnapshotId ?? null,
      minutes_before_start: change.minutesBeforeStart ?? null,
      verified: change.verified,
      source: change.source,
      detected_at: change.detectedAt,
      event_hash: eventHash,
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) return { inserted: false, duplicate: true, eventId: undefined };
    throw error;
  }

  return { inserted: true, duplicate: false, eventId: data?.id as string | undefined };
}

export async function insertStarterVerificationSnapshotDeduped(
  snapshot: MlbStarterVerificationSnapshot,
): Promise<StarterVerificationWriteResult> {
  const warnings: string[] = [];
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(STARTER_TABLE)
      .insert(toStarterRow(snapshot))
      .select("id")
      .single();

    if (error) {
      if (isUniqueViolation(error)) return { inserted: false, duplicate: true, warnings };
      throw error;
    }

    return { inserted: true, duplicate: false, snapshotId: data?.id, warnings };
  } catch (error) {
    warnings.push(repositoryErrorMessage(error, "Unable to insert starter verification snapshot."));
    return { inserted: false, duplicate: false, warnings };
  }
}

export async function getLineupPersistenceStatus(): Promise<LineupPersistenceStatus> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(LINEUP_TABLE)
      .select("official_game_id,team_id,captured_at")
      .order("captured_at", { ascending: false })
      .limit(5000);

    if (error) throw error;
    return {
      ok: true,
      storageHealth: "OK",
      totalSnapshots: data?.length ?? 0,
      gamesTracked: new Set((data ?? []).map((row: { official_game_id: string }) => row.official_game_id)).size,
      teamsTracked: new Set((data ?? []).map((row: { team_id: string | null }) => row.team_id).filter(Boolean)).size,
      latestCapture: data?.[0]?.captured_at,
      duplicateCountAvailable: false,
      warnings: [],
    };
  } catch (error) {
    const warning = repositoryErrorMessage(error, "Lineup snapshot status unavailable.");
    return {
      ok: false,
      storageHealth: "ERROR",
      totalSnapshots: 0,
      gamesTracked: 0,
      teamsTracked: 0,
      duplicateCountAvailable: false,
      warnings: [warning],
    };
  }
}

export async function getLineupChangeStatus(details = false): Promise<LineupChangeStatus> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(EVENT_TABLE)
      .select("*")
      .eq("verified", true)
      .order("detected_at", { ascending: false })
      .limit(details ? 50 : 10);

    if (error) throw error;
    const rows = data ?? [];
    return {
      ok: true,
      totalVerifiedEvents: rows.length,
      firstConfirmedLineups: rows.filter((row: any) => row.change_type === "FIRST_CONFIRMED_LINEUP").length,
      playerRemovals: rows.filter((row: any) => row.change_type === "PLAYER_REMOVED").length,
      playerAdditions: rows.filter((row: any) => row.change_type === "PLAYER_ADDED").length,
      battingOrderChanges: rows.filter((row: any) => row.change_type === "BATTING_ORDER_CHANGE").length,
      lateScratches: rows.filter((row: any) => row.change_type === "LATE_SCRATCH").length,
      latestEvents: rows.slice(0, details ? 25 : 5).map((row: any) => ({
        id: row.id,
        officialGameId: row.official_game_id,
        oddsEventId: row.odds_event_id ?? undefined,
        teamId: row.team_id ?? undefined,
        teamName: row.team_name,
        side: row.side,
        previousSnapshotId: row.previous_snapshot_id ?? undefined,
        currentSnapshotId: row.current_snapshot_id ?? undefined,
        detectedAt: row.detected_at,
        minutesBeforeStart: row.minutes_before_start ?? undefined,
        changeType: row.change_type,
        addedPlayers: row.added_players ?? [],
        removedPlayers: row.removed_players ?? [],
        battingOrderChanges: row.batting_order_changes ?? [],
        positionChanges: row.position_changes ?? [],
        verified: row.verified,
        source: "MLB_OFFICIAL",
        warnings: [],
      })),
      warnings: [],
    };
  } catch (error) {
    const warning = repositoryErrorMessage(error, "Lineup change status unavailable.");
    return {
      ok: false,
      totalVerifiedEvents: 0,
      firstConfirmedLineups: 0,
      playerRemovals: 0,
      playerAdditions: 0,
      battingOrderChanges: 0,
      lateScratches: 0,
      latestEvents: [],
      warnings: [warning],
    };
  }
}

export async function getStarterVerificationStatus(details = false): Promise<StarterVerificationStatus> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(STARTER_TABLE)
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(details ? 100 : 25);

    if (error) throw error;
    const rows = data ?? [];
    return {
      ok: true,
      probableOnlyCount: rows.filter((row: StarterVerificationRow) => row.verification_status === "PROBABLE_ONLY").length,
      matchedCount: rows.filter((row: StarterVerificationRow) => row.verification_status === "MATCHED").length,
      changedCount: rows.filter((row: StarterVerificationRow) => row.verification_status === "CHANGED").length,
      ambiguousCount: rows.filter((row: StarterVerificationRow) => row.verification_status === "AMBIGUOUS").length,
      latestChanges: rows
        .filter((row: StarterVerificationRow) => row.verification_status === "CHANGED")
        .slice(0, details ? 25 : 5)
        .map((row: StarterVerificationRow) => fromStarterRow(row)),
      warnings: [],
    };
  } catch (error) {
    const warning = repositoryErrorMessage(error, "Starter verification status unavailable.");
    return {
      ok: false,
      probableOnlyCount: 0,
      matchedCount: 0,
      changedCount: 0,
      ambiguousCount: 0,
      latestChanges: [],
      warnings: [warning],
    };
  }
}
