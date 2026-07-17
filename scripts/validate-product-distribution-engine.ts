import assert from "node:assert/strict";
import { buildUniversalProductDistribution } from "../app/lib/product-distribution";

const rows = [
  ...Array.from({ length: 10 }, (_, index) => ({
    sport: "MLB",
    game_id: `mlb-${index + 1}`,
    rank: index + 1,
    away_team: `MLB Away ${index + 1}`,
    home_team: `MLB Home ${index + 1}`,
    pick: `MLB Signal ${index + 1}`,
    start_time: `2026-07-17T${String(12 + index).padStart(2, "0")}:00:00Z`,
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    sport: "SOCCER",
    game_id: `soccer-${index + 1}`,
    rank: index + 1,
    away_team: `Soccer Away ${index + 1}`,
    home_team: `Soccer Home ${index + 1}`,
    pick: `Soccer Signal ${index + 1}`,
    start_time: `2026-07-17T${String(14 + index).padStart(2, "0")}:00:00Z`,
  })),
  {
    sport: "MLB",
    game_id: "mlb-4-alt-provider-id",
    rank: 4,
    away_team: "MLB Away 4",
    home_team: "MLB Home 4",
    pick: "MLB Signal 4 Alternate Market",
    start_time: "2026-07-17T15:00:00Z",
  },
];

const distribution = buildUniversalProductDistribution(rows);
const mlb = distribution.sports.find((sport) => sport.sport === "MLB");
const soccer = distribution.sports.find((sport) => sport.sport === "SOCCER");

assert.ok(mlb);
assert.ok(soccer);

assert.equal(mlb.masterSignalPool.length, 10);
assert.deepEqual(mlb.initialReservedPool.map((row) => row.game_id), ["mlb-1", "mlb-2", "mlb-3"]);
assert.deepEqual(mlb.signalsDetected.map((row) => row.game_id), ["mlb-4", "mlb-5", "mlb-6", "mlb-7", "mlb-8", "mlb-9", "mlb-10"]);
assert.deepEqual(mlb.exclusiveTop3.map((row) => row.game_id), ["mlb-4", "mlb-5", "mlb-6"]);
assert.deepEqual(mlb.dynamicCandidatePool.map((row) => row.game_id), ["mlb-1", "mlb-2", "mlb-3", "mlb-4", "mlb-5", "mlb-6", "mlb-7", "mlb-8", "mlb-9", "mlb-10"]);
assert.equal(mlb.topSignal?.game_id, "mlb-1");
assert.deepEqual(mlb.premium.map((row) => row.game_id), ["mlb-2", "mlb-3", "mlb-4"]);
assert.deepEqual(mlb.unlimited.map((row) => row.game_id), ["mlb-1", "mlb-2", "mlb-3", "mlb-4", "mlb-5", "mlb-6", "mlb-7", "mlb-8", "mlb-9", "mlb-10"]);

assert.equal(soccer.masterSignalPool.length, 6);
assert.deepEqual(soccer.signalsDetected.map((row) => row.game_id), ["soccer-4", "soccer-5", "soccer-6"]);
assert.deepEqual(soccer.exclusiveTop3.map((row) => row.game_id), ["soccer-4", "soccer-5", "soccer-6"]);
assert.equal(soccer.topSignal?.game_id, "soccer-1");
assert.deepEqual(soccer.premium.map((row) => row.game_id), ["soccer-2", "soccer-3", "soccer-4"]);

const topSignalIds = new Set(distribution.topSignal.map((row) => row.game_id));
assert.equal(distribution.premium.some((row) => topSignalIds.has(row.game_id)), false);

const masterIds = new Set(distribution.masterSignalPool.map((row) => `${row.sport}:${row.game_id}`));
assert.equal(masterIds.size, distribution.masterSignalPool.length);

const mlbSignalIds = new Set(mlb.signalsDetected.map((row) => row.game_id));
const mlbReservedIds = new Set(mlb.initialReservedPool.map((row) => row.game_id));
const mlbDynamicIds = new Set(mlb.dynamicCandidatePool.map((row) => row.game_id));
assert.equal(mlb.exclusiveTop3.every((row) => mlbSignalIds.has(row.game_id)), true);
assert.equal(
  mlb.dynamicCandidatePool.every((row) => mlbReservedIds.has(row.game_id) || mlbSignalIds.has(row.game_id)),
  true,
);
assert.equal(mlbDynamicIds.size, mlb.dynamicCandidatePool.length);

assert.equal(Object.isFrozen(distribution), true);
assert.equal(Object.isFrozen(distribution.signalsDetected), true);
assert.equal(Object.isFrozen(distribution.exclusiveTop3), true);
assert.equal(Object.isFrozen(distribution.dynamicCandidatePool), true);
assert.equal(Object.isFrozen(mlb), true);
assert.equal(Object.isFrozen(mlb.signalsDetected), true);
assert.equal(Object.isFrozen(mlb.exclusiveTop3), true);
assert.equal(Object.isFrozen(mlb.dynamicCandidatePool), true);
assert.equal(Object.isFrozen(mlb.signalsDetected[0]), true);

console.log("Product Distribution Engine validation passed.");
