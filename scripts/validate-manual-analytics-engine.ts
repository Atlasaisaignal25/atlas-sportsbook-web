import assert from "node:assert/strict";
import {
  buildManualAnalytics,
  createManualTracking,
  createTrackedPick,
  filterPicksByMembership,
  processManualResult,
  type BankrollConfig,
  type ManualTrackingCollection,
} from "../app/lib/bankroll";

const now = new Date("2026-07-14T12:00:00.000Z");
const membership = {
  package: "unlimited" as const,
  selectedSport: null,
  availableSports: ["MLB" as const, "NBA" as const],
};
const atlasPicks = filterPicksByMembership(membership, now.toISOString());

const baseConfig: BankrollConfig = {
  initialBankroll: 500,
  currentBankroll: 500,
  recommendedUnit: 25,
  profile: "atlas_recommended",
  membership,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

function addPick(collection: ManualTrackingCollection, pickIndex: number, riskAmount: string, createdAt: string) {
  const pick = atlasPicks[pickIndex];
  return createTrackedPick(collection, pick, { atlasPickId: pick.id, riskAmount, notes: "" }, 500, createdAt);
}

let tracking = createManualTracking("2026-07-14T00:00:00.000Z", 500);
tracking = addPick(tracking, 0, "$25", "2026-07-14T10:00:00.000Z");
tracking = addPick(tracking, 1, "$35", "2026-07-14T11:00:00.000Z");
tracking = addPick(tracking, 5, "$50", "2026-07-13T10:00:00.000Z");
tracking = addPick(tracking, 6, "$20", "2026-07-07T10:00:00.000Z");
tracking = addPick(tracking, 2, "$25", "2026-07-14T12:00:00.000Z");

let config: BankrollConfig = { ...baseConfig, manualTracking: tracking };
config = processManualResult(config, "won", {
  pickId: "manual-pick-20260714100000000",
  settledAt: "2026-07-14T20:00:00.000Z",
  availableAtlasPicks: atlasPicks,
});
config = processManualResult(config, "lost", {
  pickId: "manual-pick-20260714110000000",
  settledAt: "2026-07-14T21:00:00.000Z",
  availableAtlasPicks: atlasPicks,
});
config = processManualResult(config, "push", {
  pickId: "manual-pick-20260713100000000",
  settledAt: "2026-07-13T21:00:00.000Z",
  availableAtlasPicks: atlasPicks,
});
config = processManualResult(config, "won", {
  pickId: "manual-pick-20260707100000000",
  settledAt: "2026-07-07T21:00:00.000Z",
  availableAtlasPicks: atlasPicks,
});

const allTime = buildManualAnalytics(config.manualTracking, "all_time", "2026-07-14", "atlas_recommended", now);
assert.equal(allTime.initialBankroll, 500);
assert.equal(allTime.currentBankroll, 498.9);
assert.equal(allTime.profit, -1.1);
assert.equal(allTime.roi, -0.22);
assert.equal(allTime.wins, 2);
assert.equal(allTime.losses, 1);
assert.equal(allTime.pushes, 1);
assert.equal(allTime.winRate, 66.67);
assert.equal(allTime.averageRiskPercentage, 6.2);
assert.equal(allTime.highestRiskPercentage, 10);
assert.equal(allTime.lowestRiskPercentage, 4);
assert.equal(allTime.withinPlanCount, 3);
assert.equal(allTime.abovePlanCount, 2);
assert.equal(allTime.disciplineScore, 88);
assert.equal(allTime.disciplineLabel, "Good Discipline");
assert.equal(allTime.longestWinningStreak, 2);
assert.equal(allTime.longestLosingStreak, 1);
assert.equal(allTime.performanceBySport.length >= 2, true);
assert.equal(allTime.performanceBySport[0].picks >= allTime.performanceBySport[1].picks, true);
assert.equal(allTime.performanceByMarket.some((market) => market.label === "Moneyline"), true);

const today = buildManualAnalytics(config.manualTracking, "today", "2026-07-14", "atlas_recommended", now);
assert.equal(today.totalPicks, 3);
assert.equal(today.wins, 1);
assert.equal(today.losses, 1);
assert.equal(today.pushes, 0);
assert.equal(today.activePicks, 1);

const yesterday = buildManualAnalytics(config.manualTracking, "yesterday", "2026-07-14", "atlas_recommended", now);
assert.equal(yesterday.totalPicks, 1);
assert.equal(yesterday.pushes, 1);
assert.equal(yesterday.hasCompletedResults, true);

const empty = buildManualAnalytics(undefined, "all_time", "2026-07-14", "atlas_recommended", now);
assert.equal(empty.hasPicks, false);
assert.equal(empty.hasCompletedResults, false);
assert.equal(empty.disciplineScore, 100);

const deterministic = buildManualAnalytics(config.manualTracking, "all_time", "2026-07-14", "atlas_recommended", now);
assert.deepEqual(deterministic, allTime);

console.log("Manual Analytics engine validation OK");
