import assert from "node:assert/strict";
import {
  closeWeeklyCycle,
  createAtlasPlan,
  createWeeklyCycle,
  createWeeklySummary,
  normalizeWeeklyState,
  shouldCloseWeeklyCycle,
  type AtlasPlan,
  type AtlasPlanFinalResult,
  type BankrollConfig,
  type BankrollCycle,
} from "../app/lib/bankroll";

const cycleStart = "2026-07-07T00:00:00.000Z";
const cycleEnd = "2026-07-14T00:00:00.000Z";
const closedAt = "2026-07-15T00:00:00.000Z";

const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 214,
  recommendedUnit: 10.7,
  profile: "atlas_recommended",
  membership: {
    package: "premium",
    selectedSport: "MLB",
    availableSports: ["MLB"],
  },
  createdAt: cycleStart,
  updatedAt: cycleStart,
};

const activeCycle: BankrollCycle = {
  ...createWeeklyCycle(1, cycleStart, 200),
  endDate: cycleEnd,
};

function plan(index: number, result: AtlasPlanFinalResult, profit: number, completedDay: number): AtlasPlan {
  return {
    ...createAtlasPlan(
      {
        currentBankroll: 200,
        recommendedUnit: 10,
        profit: 0,
        roi: { value: 0, status: "zero" },
        exposure: { value: 5, target: 5, status: "aligned" },
      },
      cycleStart,
    ),
    id: `weekly-plan-${index}`,
    candidateId: `weekly-candidate-${index}`,
    status: result,
    result,
    completedAt: `2026-07-${String(completedDay).padStart(2, "0")}T12:00:00.000Z`,
    profit,
    riskAmount: 10,
    recommendedUnit: 10,
    replacementHistory: index === 1 ? [{ originalPickId: "a", replacementPickId: "b", originalRank: 1, replacementRank: 2, reason: "removed", replacedAt: cycleStart, sport: "MLB", source: "top5", package: "premium" }] : [],
  };
}

const completedPlans = [
  plan(1, "won", 6, 8),
  plan(2, "won", 6, 9),
  plan(3, "lost", -5, 10),
  plan(4, "won", 6, 11),
  plan(5, "lost", -5, 12),
  plan(6, "won", 6, 13),
  plan(7, "push", 0, 13),
];

const weeklyConfig: BankrollConfig = {
  ...baseConfig,
  activeCycle,
  atlasPlanCollection: {
    plans: completedPlans,
    primaryPlan: null,
    manualSelectionRequired: false,
    createdAt: cycleStart,
    updatedAt: cycleStart,
  },
};

const summary = createWeeklySummary(weeklyConfig, activeCycle, closedAt);
assert.equal(summary.initialBankroll, 200);
assert.equal(summary.finalBankroll, 214);
assert.equal(summary.profit, 14);
assert.equal(summary.roi, 7);
assert.equal(summary.recommendedUnitFinal, 10.7);
assert.equal(summary.package, "premium");
assert.equal(summary.currentExposure, 5);
assert.equal(summary.wins, 4);
assert.equal(summary.losses, 2);
assert.equal(summary.pushes, 1);
assert.equal(summary.cancelled, 0);
assert.equal(summary.completedPlans, 7);
assert.equal(summary.pendingPlans, 0);
assert.equal(summary.winRate, 66.67);
assert.equal(summary.replacementCount, 1);
assert.equal(summary.averageUnit, 10);
assert.equal(summary.totalRisk, 70);
assert.equal(summary.totalProfit, 14);
assert.equal(summary.streaks.longestWinningStreak, 2);
assert.equal(summary.streaks.longestLosingStreak, 1);
assert.equal(summary.streaks.currentEndingStreak, 1);
assert.equal(summary.streaks.currentEndingType, "won");
assert.equal(summary.planScore, 100);

assert.equal(shouldCloseWeeklyCycle(activeCycle, "2026-07-14T00:00:00.000Z"), false);
assert.equal(shouldCloseWeeklyCycle(activeCycle, "2026-07-14T00:00:01.000Z"), true);

const closedConfig = closeWeeklyCycle(weeklyConfig, closedAt);
assert.equal(closedConfig.weeklySummaries?.length, 1);
assert.equal(closedConfig.weeklySummaries?.[0].profit, 14);
assert.equal(closedConfig.cycleHistory?.length, 1);
assert.equal(closedConfig.cycleHistory?.[0].status, "closed");
assert.equal(closedConfig.activeCycle?.cycleNumber, 2);
assert.equal(closedConfig.activeCycle?.initialBankroll, 214);
assert.equal(closedConfig.activeCycle?.status, "open");

const normalizedClosedConfig = normalizeWeeklyState(closedConfig, "2026-07-15T01:00:00.000Z");
assert.equal(normalizedClosedConfig.weeklySummaries?.length, 1);
assert.equal(normalizedClosedConfig.cycleHistory?.length, 1);
assert.equal(normalizedClosedConfig.activeCycle?.cycleNumber, 2);

const migratedConfig = normalizeWeeklyState(baseConfig, cycleStart);
assert.equal(migratedConfig.activeCycle?.cycleNumber, 1);
assert.equal(migratedConfig.activeCycle?.initialBankroll, 200);
assert.deepEqual(migratedConfig.weeklySummaries, []);
assert.deepEqual(migratedConfig.cycleHistory, []);

const multiCycleConfig = normalizeWeeklyState(
  {
    ...weeklyConfig,
    weeklySummaries: [summary],
    cycleHistory: [{ ...activeCycle, status: "closed", closedAt }],
    activeCycle: {
      ...createWeeklyCycle(2, closedAt, 214),
      endDate: "2026-07-22T00:00:00.000Z",
    },
  },
  "2026-07-23T00:00:00.000Z",
);
assert.equal(multiCycleConfig.weeklySummaries?.length, 2);
assert.equal(multiCycleConfig.cycleHistory?.length, 2);
assert.equal(multiCycleConfig.activeCycle?.cycleNumber, 3);

console.log("Weekly Summary engine validation OK");
