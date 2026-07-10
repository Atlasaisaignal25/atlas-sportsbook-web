import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildLineupHash,
  buildLineupSnapshot,
  buildStarterVerificationHash,
  compareMlbLineups,
  type NormalizedTeamLineup,
  type StarterVerificationResult,
} from "../app/lib/mlb-engine/sports-intelligence";

function lineup(overrides: Partial<NormalizedTeamLineup> = {}): NormalizedTeamLineup {
  return {
    teamId: "111",
    teamName: "Atlas Home",
    confirmed: true,
    confirmationSource: "MLB_OFFICIAL_BOXSCORE_BATTING_ORDER",
    confirmedAt: "2026-07-10T16:00:00.000Z",
    battingOrderComplete: true,
    expectedPlayerCount: 9,
    actualPlayerCount: 9,
    warnings: [],
    players: [
      { playerId: "1", name: "One", battingOrder: 1, positionCode: "CF" },
      { playerId: "2", name: "Two", battingOrder: 2, positionCode: "SS" },
      { playerId: "3", name: "Three", battingOrder: 3, positionCode: "1B" },
      { playerId: "4", name: "Four", battingOrder: 4, positionCode: "LF" },
      { playerId: "5", name: "Five", battingOrder: 5, positionCode: "RF" },
      { playerId: "6", name: "Six", battingOrder: 6, positionCode: "3B" },
      { playerId: "7", name: "Seven", battingOrder: 7, positionCode: "2B" },
      { playerId: "8", name: "Eight", battingOrder: 8, positionCode: "C" },
      { playerId: "9", name: "Nine", battingOrder: 9, positionCode: "DH" },
    ],
    ...overrides,
  };
}

const base = lineup();
const reordered = lineup({
  players: [...base.players].reverse(),
});
const battingMove = lineup({
  players: base.players.map((player) =>
    player.playerId === "1"
      ? { ...player, battingOrder: 2 }
      : player.playerId === "2"
        ? { ...player, battingOrder: 1 }
        : player,
  ),
});
const removed = lineup({
  actualPlayerCount: 8,
  battingOrderComplete: false,
  players: base.players.filter((player) => player.playerId !== "9"),
});
const added = lineup({
  actualPlayerCount: 10,
  players: [...base.players, { playerId: "10", name: "Ten", battingOrder: 10, positionCode: "PH" }],
});
const positionChanged = lineup({
  players: base.players.map((player) => (player.playerId === "3" ? { ...player, positionCode: "DH" } : player)),
});

const baseHash = buildLineupHash({
  officialGameId: "game-1",
  side: "HOME",
  confirmed: true,
  players: base.players,
});
const reorderedHash = buildLineupHash({
  officialGameId: "game-1",
  side: "HOME",
  confirmed: true,
  players: reordered.players,
});
const battingMoveHash = buildLineupHash({
  officialGameId: "game-1",
  side: "HOME",
  confirmed: true,
  players: battingMove.players,
});

assert.equal(baseHash, reorderedHash, "Lineup hash should normalize irrelevant array order.");
assert.notEqual(baseHash, battingMoveHash, "Batting-order changes must change lineup hash.");
assert.notEqual(
  baseHash,
  buildLineupHash({ officialGameId: "game-2", side: "HOME", confirmed: true, players: base.players }),
  "Doubleheader/official-game snapshots must remain isolated.",
);
assert.notEqual(
  baseHash,
  buildLineupHash({ officialGameId: "game-1", side: "AWAY", confirmed: true, players: base.players }),
  "Home and away snapshots must remain isolated.",
);

const snapshot = buildLineupSnapshot({
  officialGameId: "game-1",
  oddsEventId: "odds-1",
  side: "HOME",
  lineup: base,
  gameDate: "2026-07-10T20:00:00.000Z",
  gameStatus: "Scheduled",
  sourceUpdatedAt: "2026-07-10T16:00:00.000Z",
  capturedAt: "2026-07-10T16:05:00.000Z",
});
assert.equal(snapshot.lineupHash, baseHash);
assert.equal(snapshot.confirmed, true);
assert.equal(snapshot.playerCount, 9);
assert.equal(snapshot.source, "MLB_OFFICIAL");

assert.equal(compareMlbLineups(base, battingMove).battingOrderChanges.length, 2);
assert.equal(compareMlbLineups(base, removed).removedPlayerIds.length, 1);
assert.equal(compareMlbLineups(base, added).addedPlayerIds.length, 1);
assert.equal(compareMlbLineups(base, positionChanged).positionChanges.length, 1);
assert.equal(compareMlbLineups(undefined, base).addedPlayerIds.length, 9, "Missing previous snapshot is first confirmed only.");
assert.equal(compareMlbLineups({ ...removed, confirmed: false }, base).removedPlayerIds.length, 0);

const starter: StarterVerificationResult = {
  team: "HOME",
  probablePitcherId: "44",
  probablePitcherName: "Probable Pitcher",
  confirmedPitcherId: "55",
  confirmedPitcherName: "Confirmed Pitcher",
  status: "CHANGED",
  verifiedAt: "2026-07-10T16:00:00.000Z",
  warnings: [],
};
assert.equal(
  buildStarterVerificationHash({ officialGameId: "game-1", side: "HOME", verification: starter }),
  buildStarterVerificationHash({ officialGameId: "game-1", side: "HOME", verification: { ...starter } }),
  "Starter verification hashes should dedupe identical evidence.",
);
assert.notEqual(
  buildStarterVerificationHash({ officialGameId: "game-1", side: "HOME", verification: starter }),
  buildStarterVerificationHash({
    officialGameId: "game-1",
    side: "HOME",
    verification: { ...starter, status: "MATCHED", confirmedPitcherId: "44" },
  }),
  "Starter status changes should create a new verification hash.",
);

async function main() {
  const sql = await readFile("mlb_lineup_snapshots.sql", "utf8");
  assert.match(sql, /create table if not exists public\.mlb_lineup_snapshots/);
  assert.match(sql, /lineup_hash text not null/);
  assert.match(sql, /mlb_lineup_snapshots_dedupe_idx/);
  assert.match(sql, /official_game_id,[\s\S]+side,[\s\S]+lineup_hash/);
  assert.match(sql, /create table if not exists public\.mlb_lineup_change_events/);
  assert.match(sql, /create table if not exists public\.mlb_starter_verification_snapshots/);

  const flags = await readFile("app/lib/mlb-engine/sports-intelligence/flags.ts", "utf8");
  assert.match(flags, /MLB_LINEUP_SNAPSHOTS_ENABLED/);
  assert.match(flags, /MLB_LINEUP_CHANGE_DETECTION_ENABLED/);
  assert.match(flags, /MLB_STARTER_VERIFICATION_SNAPSHOTS_ENABLED/);

  const changeService = await readFile("app/lib/mlb-engine/sports-intelligence/lineup-change-service.ts", "utf8");
  assert.match(changeService, /FIRST_CONFIRMED_LINEUP/);
  assert.match(changeService, /LATE_SCRATCH/);
  assert.match(changeService, /DEFAULT_LATE_SCRATCH_WINDOW_MINUTES = 120/);
  assert.match(changeService, /storageHealth: "ERROR"/);

  const repository = await readFile("app/lib/mlb-engine/sports-intelligence/lineup-snapshot-repository.ts", "utf8");
  assert.match(repository, /insertLineupSnapshotDeduped/);
  assert.match(repository, /insertStarterVerificationSnapshotDeduped/);
  assert.match(repository, /getLineupPersistenceStatus/);
  assert.doesNotMatch(repository, /SUPABASE_SERVICE_ROLE_KEY/);

  const captureRoute = await readFile("app/api/internal/mlb-sports-intelligence/lineups/capture/route.ts", "utf8");
  assert.match(captureRoute, /CRON_SECRET/);
  assert.match(captureRoute, /lineupSnapshotsEnabled/);
  assert.match(captureRoute, /starterVerificationSnapshotsEnabled/);
  assert.doesNotMatch(captureRoute, /battingOrder:\s*input\.lineup\.players/);

  const service = await readFile("app/lib/mlb-engine/sports-intelligence/service.ts", "utf8");
  assert.match(service, /Structured MLB player availability is not connected in Phase 4/);
  assert.match(service, /playerAvailability/);

  const projection = await readFile("app/lib/mlb-engine/sports-intelligence/projection.ts", "utf8");
  assert.match(projection, /projectionAvailability:\s*"UNAVAILABLE"/);

  const automationUtils = await readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.doesNotMatch(automationUtils, /lineup-change-service|lineup-snapshot-repository|MLB_LINEUP_SNAPSHOTS_ENABLED/);

  console.log("MLB lineup snapshot Phase 4 validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
