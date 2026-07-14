import assert from "node:assert/strict";
import {
  buildManualMonthlySummary,
  buildManualWeeklySummary,
  closeManualMonth,
  closeManualWeek,
  createManualTracking,
  createTrackedPick,
  filterPicksByMembership,
  loadManualSummaryHistory,
  processManualResult,
  syncManualSummaries,
  type BankrollConfig,
  type ManualTrackingCollection,
} from "../app/lib/bankroll";

const membership = {
  package: "unlimited" as const,
  selectedSport: null,
  availableSports: ["MLB" as const, "NBA" as const],
};
const picks = filterPicksByMembership(membership, "2026-07-01T12:00:00.000Z");
const baseConfig: BankrollConfig = {
  initialBankroll: 500,
  currentBankroll: 500,
  recommendedUnit: 25,
  profile: "atlas_recommended",
  membership,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function addPick(collection: ManualTrackingCollection, pickIndex: number, riskAmount: string, createdAt: string) {
  const pick = picks[pickIndex];
  return createTrackedPick(collection, pick, { atlasPickId: pick.id, riskAmount, notes: "" }, 500, createdAt);
}

function settle(config: BankrollConfig, pickId: string, result: "won" | "lost" | "push" | "cancelled", settledAt: string) {
  return processManualResult(config, result, {
    pickId,
    settledAt,
    availableAtlasPicks: picks,
  });
}

let manualTracking = createManualTracking("2026-07-01T00:00:00.000Z", 500);
manualTracking = addPick(manualTracking, 0, "$25", "2026-07-01T10:00:00.000Z");
manualTracking = addPick(manualTracking, 1, "$30", "2026-07-02T10:00:00.000Z");
manualTracking = addPick(manualTracking, 2, "$20", "2026-07-03T10:00:00.000Z");

let config: BankrollConfig = { ...baseConfig, manualTracking };
config = settle(config, "manual-pick-20260701100000000", "won", "2026-07-01T22:00:00.000Z");
config = settle(config, "manual-pick-20260702100000000", "lost", "2026-07-02T22:00:00.000Z");
config = settle(config, "manual-pick-20260703100000000", "push", "2026-07-03T22:00:00.000Z");

const weekOnePreview = buildManualWeeklySummary(config.manualTracking!, {
  id: "manual-cycle-1",
  cycleNumber: 1,
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-07T23:59:59.999Z",
  status: "open",
  initialBankroll: 500,
  createdAt: "2026-07-01T00:00:00.000Z",
  closedAt: null,
}, "2026-07-07T23:59:59.999Z");

assert.equal(weekOnePreview.completedPicks, 3);
assert.equal(weekOnePreview.wins, 1);
assert.equal(weekOnePreview.losses, 1);
assert.equal(weekOnePreview.pushes, 1);
assert.equal(weekOnePreview.winRate, 50);
assert.equal(weekOnePreview.replacementCount, 0);
assert.equal(weekOnePreview.sportsBreakdown.length > 0, true);
assert.equal(weekOnePreview.marketsBreakdown.length > 0, true);

let summarizedTracking: ManualTrackingCollection = {
  ...config.manualTracking!,
  manualActiveCycle: {
    id: "manual-cycle-1",
    cycleNumber: 1,
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-07-07T23:59:59.999Z",
    status: "open" as const,
    initialBankroll: 500,
    createdAt: "2026-07-01T00:00:00.000Z",
    closedAt: null,
  },
};
summarizedTracking = closeManualWeek(summarizedTracking, "2026-07-07T23:59:59.999Z");
assert.equal(summarizedTracking.manualWeeklySummaries.length, 1);
assert.equal(summarizedTracking.manualCycleHistory.length, 1);
assert.equal(summarizedTracking.manualActiveCycle?.cycleNumber, 2);
assert.equal(summarizedTracking.manualTimeline.some((event) => event.message === "Weekly Summary Generated"), true);

let fourWeekTracking = summarizedTracking;
for (let cycle = 2; cycle <= 4; cycle += 1) {
  const startDay = 1 + (cycle - 1) * 7;
  fourWeekTracking = {
    ...fourWeekTracking,
    manualActiveCycle: {
      id: `manual-cycle-${cycle}`,
      cycleNumber: cycle,
      startDate: `2026-07-${String(startDay).padStart(2, "0")}T00:00:00.000Z`,
      endDate: `2026-07-${String(startDay + 6).padStart(2, "0")}T23:59:59.999Z`,
      status: "open",
      initialBankroll: fourWeekTracking.manualActiveCycle?.initialBankroll ?? 500,
      createdAt: `2026-07-${String(startDay).padStart(2, "0")}T00:00:00.000Z`,
      closedAt: null,
    },
  };
  fourWeekTracking = closeManualWeek(fourWeekTracking, `2026-07-${String(startDay + 6).padStart(2, "0")}T23:59:59.999Z`);
}

assert.equal(fourWeekTracking.manualWeeklySummaries.length, 4);
const monthlySummary = buildManualMonthlySummary(fourWeekTracking.manualWeeklySummaries, "2026-07-31T23:59:59.999Z");
assert.equal(monthlySummary.weeklySummaryIds.length, 4);
assert.equal(monthlySummary.month, 7);
assert.equal(monthlySummary.year, 2026);
assert.equal(monthlySummary.bestWeek.id !== null, true);
assert.equal(monthlySummary.worstWeek.id !== null, true);

fourWeekTracking = closeManualMonth(fourWeekTracking, "2026-07-31T23:59:59.999Z");
assert.equal(fourWeekTracking.manualMonthlySummaries.length, 1);
assert.equal(fourWeekTracking.manualTimeline.some((event) => event.message === "Monthly Summary Generated"), true);

const history = loadManualSummaryHistory(fourWeekTracking, "2026-07-31T23:59:59.999Z");
assert.equal(history.weeklySummaries.length, 4);
assert.equal(history.monthlySummaries.length, 1);
assert.equal(history.activeCycle?.cycleNumber, 5);

const syncedConfig = syncManualSummaries({ ...baseConfig, manualTracking: fourWeekTracking }, "2026-08-01T00:00:00.000Z");
assert.equal(syncedConfig.currentBankroll, 500);
assert.equal(syncedConfig.manualTracking?.manualMonthlySummaries.length, 1);
assert.equal(syncedConfig.manualTracking?.manualWeeklySummaries.length >= 4, true);

console.log("Manual Summary engine validation OK");
