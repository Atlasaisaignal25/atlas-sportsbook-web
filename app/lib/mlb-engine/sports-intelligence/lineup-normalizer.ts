import type {
  LineupComparisonResult,
  NormalizedLineupPlayer,
  NormalizedTeamLineup,
  StarterVerificationResult,
} from "./types";
import type { MlbOfficialBoxscoreTeam, MlbOfficialLiveFeed } from "./providers/mlb-official-game-client";

function battingOrderNumber(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return undefined;
  const parsed = Number(raw.slice(0, -1) || raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function playerKey(id: string | number) {
  return `ID${id}`;
}

function battingSide(_player: unknown): "L" | "R" | "S" | undefined {
  return undefined;
}

function lineupStatus(player: any): NormalizedLineupPlayer["status"] {
  if (player?.battingOrder) return "STARTING";
  if (player?.gameStatus?.isOnBench) return "BENCH";
  if (player?.status?.code === "A") return "ACTIVE";
  return "UNKNOWN";
}

export function normalizeTeamLineup(input: {
  side: "HOME" | "AWAY";
  team: MlbOfficialBoxscoreTeam | undefined;
  confirmedAt?: string;
}): NormalizedTeamLineup {
  const teamName = input.team?.team?.name ?? "";
  const warnings: string[] = [];
  const battingOrderIds = input.team?.battingOrder ?? [];
  const playersById = input.team?.players ?? {};
  const seenOrders = new Set<number>();
  const seenPlayers = new Set<string>();
  const players: NormalizedLineupPlayer[] = [];

  battingOrderIds.forEach((id) => {
    const record = playersById[playerKey(id)];
    const playerId = String(record?.person?.id ?? id);
    const order = battingOrderNumber(record?.battingOrder ?? String(id));

    if (seenPlayers.has(playerId)) warnings.push(`${input.side} player ${playerId} appears more than once.`);
    seenPlayers.add(playerId);
    if (order !== undefined && seenOrders.has(order)) warnings.push(`${input.side} duplicate batting-order position ${order}.`);
    if (order !== undefined) seenOrders.add(order);

    if (!record?.person?.fullName) {
      warnings.push(`${input.side} batting-order player ${playerId} missing display name.`);
    }

    players.push({
      playerId,
      name: record?.person?.fullName ?? "",
      battingOrder: order,
      positionCode: record?.position?.code,
      positionName: record?.position?.name,
      battingSide: battingSide(record),
      status: lineupStatus(record),
    });
  });

  const battingOrderComplete = players.length >= 9 && seenOrders.size >= 9 && warnings.length === 0;
  if (players.length === 0) warnings.push(`${input.side} lineup not available yet.`);
  else if (players.length < 9) warnings.push(`${input.side} batting order contains only ${players.length} players.`);

  return {
    teamId: input.team?.team?.id ? String(input.team.team.id) : undefined,
    teamName,
    confirmed: battingOrderComplete,
    confirmationSource: battingOrderComplete ? "MLB_OFFICIAL_BOXSCORE_BATTING_ORDER" : undefined,
    confirmedAt: battingOrderComplete ? input.confirmedAt : undefined,
    players,
    battingOrderComplete,
    expectedPlayerCount: 9,
    actualPlayerCount: players.length,
    warnings,
  };
}

export function compareMlbLineups(
  previous: NormalizedTeamLineup | undefined,
  current: NormalizedTeamLineup,
): LineupComparisonResult {
  const previousPlayers = new Map((previous?.players ?? []).map((player) => [player.playerId, player]));
  const currentPlayers = new Map(current.players.map((player) => [player.playerId, player]));
  const addedPlayerIds = [...currentPlayers.keys()].filter((id) => !previousPlayers.has(id));
  const removedPlayerIds = [...previousPlayers.keys()].filter((id) => !currentPlayers.has(id));
  const battingOrderChanges = [...currentPlayers.values()]
    .map((player) => ({
      playerId: player.playerId,
      previousOrder: previousPlayers.get(player.playerId)?.battingOrder,
      currentOrder: player.battingOrder,
    }))
    .filter((change) => change.previousOrder !== change.currentOrder);

  return {
    addedPlayerIds,
    removedPlayerIds,
    battingOrderChanges,
    changed: addedPlayerIds.length > 0 || removedPlayerIds.length > 0 || battingOrderChanges.length > 0,
    detectedAt: new Date().toISOString(),
  };
}

function firstPitcherId(team: MlbOfficialBoxscoreTeam | undefined) {
  return team?.pitchers?.[0] ? String(team.pitchers[0]) : undefined;
}

function pitcherName(team: MlbOfficialBoxscoreTeam | undefined, pitcherId: string | undefined) {
  if (!pitcherId) return undefined;
  return team?.players?.[playerKey(pitcherId)]?.person?.fullName;
}

export function verifyOfficialStarter(input: {
  team: "HOME" | "AWAY";
  sideBoxscore: MlbOfficialBoxscoreTeam | undefined;
  liveFeed: MlbOfficialLiveFeed | undefined;
}): StarterVerificationResult {
  const probable =
    input.team === "HOME"
      ? input.liveFeed?.gameData?.probablePitchers?.home
      : input.liveFeed?.gameData?.probablePitchers?.away;
  const confirmedPitcherId = firstPitcherId(input.sideBoxscore);
  const confirmedPitcherName = pitcherName(input.sideBoxscore, confirmedPitcherId);
  const probablePitcherId = probable?.id ? String(probable.id) : undefined;
  const probablePitcherName = probable?.fullName;
  const warnings: string[] = [];

  if (!confirmedPitcherId && probablePitcherId) {
    return {
      team: input.team,
      probablePitcherId,
      probablePitcherName,
      status: "PROBABLE_ONLY",
      warnings: [`${input.team} starter has probable pitcher only; no official starting pitcher in boxscore.`],
    };
  }

  if (!confirmedPitcherId && !probablePitcherId) {
    return { team: input.team, status: "UNAVAILABLE", warnings: [`${input.team} starter unavailable.`] };
  }

  if (confirmedPitcherId && probablePitcherId && confirmedPitcherId !== probablePitcherId) {
    warnings.push(`${input.team} probable starter changed before game.`);
    return {
      team: input.team,
      probablePitcherId,
      probablePitcherName,
      confirmedPitcherId,
      confirmedPitcherName,
      status: "CHANGED",
      verifiedAt: input.liveFeed?.gameData?.datetime?.dateTime ?? new Date().toISOString(),
      warnings,
    };
  }

  if (confirmedPitcherId) {
    return {
      team: input.team,
      probablePitcherId,
      probablePitcherName,
      confirmedPitcherId,
      confirmedPitcherName,
      status: "MATCHED",
      verifiedAt: input.liveFeed?.gameData?.datetime?.dateTime ?? new Date().toISOString(),
      warnings,
    };
  }

  return { team: input.team, status: "AMBIGUOUS", warnings: [`${input.team} starter verification ambiguous.`] };
}

