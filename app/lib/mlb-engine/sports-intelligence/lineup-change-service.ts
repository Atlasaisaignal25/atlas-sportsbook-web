import {
  compareMlbLineups,
} from "./lineup-normalizer";
import {
  buildLineupSnapshot,
  getLatestLineupSnapshot,
  insertLineupChangeEventDeduped,
  insertLineupSnapshotDeduped,
  type LineupSnapshotWriteResult,
} from "./lineup-snapshot-repository";
import type {
  MlbLineupChange,
  MlbLineupChangeType,
  MlbLineupSnapshot,
  NormalizedLineupPlayer,
  NormalizedTeamLineup,
} from "./types";

const DEFAULT_LATE_SCRATCH_WINDOW_MINUTES = 120;
const EARLY_GAME_CUTOFF_MINUTES = -15;

export type LineupChangeProcessingResult = {
  snapshot: MlbLineupSnapshot;
  writeResult: LineupSnapshotWriteResult;
  changes: MlbLineupChange[];
  eventsInserted: number;
  duplicateEventsSkipped: number;
  storageHealth: "OK" | "ERROR";
  warnings: string[];
};

function playerById(players: NormalizedLineupPlayer[]) {
  return new Map(players.map((player) => [player.playerId, player]));
}

function minutesBeforeStart(gameStartTime?: string, detectedAt?: string) {
  if (!gameStartTime || !detectedAt) return undefined;
  const start = new Date(gameStartTime).getTime();
  const detected = new Date(detectedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(detected)) return undefined;
  return Math.round((start - detected) / 60000);
}

function classifyChange(input: {
  previous: MlbLineupSnapshot | null;
  current: MlbLineupSnapshot;
  addedCount: number;
  removedCount: number;
  battingOrderChangeCount: number;
  positionChangeCount: number;
  minutesBeforeStart?: number;
  lateScratchWindowMinutes: number;
}): MlbLineupChangeType {
  if (!input.previous && input.current.confirmed) return "FIRST_CONFIRMED_LINEUP";

  const changeKinds = [
    input.addedCount > 0,
    input.removedCount > 0,
    input.battingOrderChangeCount > 0,
    input.positionChangeCount > 0,
  ].filter(Boolean).length;
  if (changeKinds === 0) return "NO_MEANINGFUL_CHANGE";

  const canBeLateScratch =
    input.previous?.confirmed === true &&
    input.current.confirmed &&
    input.removedCount > 0 &&
    input.addedCount === 0 &&
    input.battingOrderChangeCount === 0 &&
    input.positionChangeCount === 0 &&
    input.minutesBeforeStart !== undefined &&
    input.minutesBeforeStart <= input.lateScratchWindowMinutes &&
    input.minutesBeforeStart >= EARLY_GAME_CUTOFF_MINUTES;

  if (canBeLateScratch) return "LATE_SCRATCH";
  if (changeKinds > 1) return "MULTIPLE_CHANGES";
  if (input.removedCount > 0) return "PLAYER_REMOVED";
  if (input.addedCount > 0) return "PLAYER_ADDED";
  if (input.battingOrderChangeCount > 0) return "BATTING_ORDER_CHANGE";
  if (input.positionChangeCount > 0) return "POSITION_CHANGE";
  return "NO_MEANINGFUL_CHANGE";
}

function buildChange(input: {
  previous: MlbLineupSnapshot | null;
  current: MlbLineupSnapshot;
  detectedAt: string;
  gameStartTime?: string;
  lateScratchWindowMinutes: number;
}): MlbLineupChange | null {
  const previousLineup: NormalizedTeamLineup | undefined = input.previous
    ? {
        teamId: input.previous.teamId,
        teamName: input.previous.teamName,
        confirmed: input.previous.confirmed,
        confirmedAt: input.previous.sourceUpdatedAt,
        players: input.previous.battingOrder,
        battingOrderComplete: input.previous.battingOrderComplete,
        expectedPlayerCount: 9,
        actualPlayerCount: input.previous.playerCount,
        warnings: [],
      }
    : undefined;
  const currentLineup: NormalizedTeamLineup = {
    teamId: input.current.teamId,
    teamName: input.current.teamName,
    confirmed: input.current.confirmed,
    confirmedAt: input.current.sourceUpdatedAt,
    players: input.current.battingOrder,
    battingOrderComplete: input.current.battingOrderComplete,
    expectedPlayerCount: 9,
    actualPlayerCount: input.current.playerCount,
    warnings: [],
  };
  const comparison = compareMlbLineups(previousLineup, currentLineup);
  const previousPlayers = playerById(input.previous?.battingOrder ?? []);
  const currentPlayers = playerById(input.current.battingOrder);
  const minutes = minutesBeforeStart(input.gameStartTime, input.detectedAt);
  const changeType = classifyChange({
    previous: input.previous,
    current: input.current,
    addedCount: comparison.addedPlayerIds.length,
    removedCount: comparison.removedPlayerIds.length,
    battingOrderChangeCount: comparison.battingOrderChanges.length,
    positionChangeCount: comparison.positionChanges.length,
    minutesBeforeStart: minutes,
    lateScratchWindowMinutes: input.lateScratchWindowMinutes,
  });

  if (changeType === "NO_MEANINGFUL_CHANGE") return null;

  return {
    id: [
      "mlb-lineup-change",
      input.current.officialGameId,
      input.current.side,
      input.previous?.id ?? "none",
      input.current.id ?? input.current.lineupHash.slice(0, 12),
      changeType,
    ].join(":"),
    officialGameId: input.current.officialGameId,
    oddsEventId: input.current.oddsEventId,
    teamId: input.current.teamId,
    teamName: input.current.teamName,
    side: input.current.side,
    previousSnapshotId: input.previous?.id,
    currentSnapshotId: input.current.id,
    detectedAt: input.detectedAt,
    gameStartTime: input.gameStartTime,
    minutesBeforeStart: minutes,
    changeType,
    addedPlayers: comparison.addedPlayerIds.map((playerId) => {
      const player = currentPlayers.get(playerId);
      return {
        playerId,
        name: player?.name ?? "",
        battingOrder: player?.battingOrder,
        positionCode: player?.positionCode,
      };
    }),
    removedPlayers: comparison.removedPlayerIds.map((playerId) => {
      const player = previousPlayers.get(playerId);
      return {
        playerId,
        name: player?.name ?? "",
        previousBattingOrder: player?.battingOrder,
        previousPositionCode: player?.positionCode,
      };
    }),
    battingOrderChanges: comparison.battingOrderChanges.map((change) => ({
      playerId: change.playerId,
      name: currentPlayers.get(change.playerId)?.name ?? previousPlayers.get(change.playerId)?.name ?? "",
      previousOrder: change.previousOrder,
      currentOrder: change.currentOrder,
    })),
    positionChanges: comparison.positionChanges.map((change) => ({
      playerId: change.playerId,
      name: currentPlayers.get(change.playerId)?.name ?? previousPlayers.get(change.playerId)?.name ?? "",
      previousPosition: change.previousPosition,
      currentPosition: change.currentPosition,
    })),
    verified: true,
    source: "MLB_OFFICIAL",
    warnings: [],
  };
}

export async function processLineupSnapshot(input: {
  officialGameId: string;
  oddsEventId?: string;
  side: "HOME" | "AWAY";
  lineup: NormalizedTeamLineup;
  gameStartTime?: string;
  gameStatus?: string;
  sourceUpdatedAt?: string;
  capturedAt?: string;
  persistChanges: boolean;
  lateScratchWindowMinutes?: number;
}): Promise<LineupChangeProcessingResult> {
  const warnings: string[] = [];
  const current = buildLineupSnapshot({
    officialGameId: input.officialGameId,
    oddsEventId: input.oddsEventId,
    side: input.side,
    lineup: input.lineup,
    gameDate: input.gameStartTime,
    gameStatus: input.gameStatus,
    sourceUpdatedAt: input.sourceUpdatedAt,
    capturedAt: input.capturedAt,
  });

  try {
    const previous = await getLatestLineupSnapshot(input.officialGameId, input.side);
    const writeResult = await insertLineupSnapshotDeduped(current);
    warnings.push(...writeResult.warnings);
    const savedCurrent = {
      ...current,
      id: writeResult.snapshotId,
    };

    if (!writeResult.inserted) {
      return {
        snapshot: savedCurrent,
        writeResult,
        changes: [],
        eventsInserted: 0,
        duplicateEventsSkipped: 0,
        storageHealth: writeResult.warnings.length ? "ERROR" : "OK",
        warnings,
      };
    }

    const change = buildChange({
      previous,
      current: savedCurrent,
      detectedAt: savedCurrent.capturedAt,
      gameStartTime: input.gameStartTime,
      lateScratchWindowMinutes: input.lateScratchWindowMinutes ?? DEFAULT_LATE_SCRATCH_WINDOW_MINUTES,
    });

    if (!change || !input.persistChanges) {
      return {
        snapshot: savedCurrent,
        writeResult,
        changes: change ? [change] : [],
        eventsInserted: 0,
        duplicateEventsSkipped: 0,
        storageHealth: "OK",
        warnings,
      };
    }

    const eventWrite = await insertLineupChangeEventDeduped(change);
    return {
      snapshot: savedCurrent,
      writeResult,
      changes: [change],
      eventsInserted: eventWrite.inserted ? 1 : 0,
      duplicateEventsSkipped: eventWrite.duplicate ? 1 : 0,
      storageHealth: "OK",
      warnings,
    };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Lineup change processing failed.");
    return {
      snapshot: current,
      writeResult: { inserted: false, duplicate: false, warnings },
      changes: [],
      eventsInserted: 0,
      duplicateEventsSkipped: 0,
      storageHealth: "ERROR",
      warnings,
    };
  }
}
