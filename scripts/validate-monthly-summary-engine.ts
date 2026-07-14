import assert from "node:assert/strict";
import {
  createMonthlySummaries,
  createMonthlySummary,
  getBestWeek,
  getWorstWeek,
  normalizeBankrollConfig,
  normalizeMonthlyState,
  type BankrollConfig,
  type WeeklySummary,
} from "../app/lib/bankroll";

function week(overrides: Partial<WeeklySummary>): WeeklySummary {
  return {
    id: "weekly-summary-1",
    cycleNumber: 1,
    startDate: "2026-07-01T00:00:00.000Z",
    endDate: "2026-07-08T00:00:00.000Z",
    status: "closed",
    initialBankroll: 200,
    finalBankroll: 214,
    profit: 14,
    roi: 7,
    recommendedUnitFinal: 10.7,
    profile: "atlas_recommended",
    package: "premium",
    currentExposure: 5,
    wins: 4,
    losses: 2,
    pushes: 1,
    cancelled: 0,
    completedPlans: 7,
    pendingPlans: 0,
    winRate: 66.67,
    planScore: 96,
    replacementCount: 1,
    averageUnit: 10,
    totalRisk: 70,
    totalProfit: 14,
    streaks: {
      longestWinningStreak: 2,
      longestLosingStreak: 1,
      currentEndingStreak: 1,
      currentEndingType: "won",
    },
    createdAt: "2026-07-08T00:00:00.000Z",
    ...overrides,
  };
}

const julyWeeks = [
  week({ id: "weekly-summary-1", cycleNumber: 1, startDate: "2026-07-01T00:00:00.000Z", endDate: "2026-07-08T00:00:00.000Z", initialBankroll: 200, finalBankroll: 214, profit: 14, roi: 7, wins: 4, losses: 2, pushes: 1, planScore: 96, totalProfit: 14, streaks: { longestWinningStreak: 2, longestLosingStreak: 1, currentEndingStreak: 1, currentEndingType: "won" } }),
  week({ id: "weekly-summary-2", cycleNumber: 2, startDate: "2026-07-08T00:00:00.000Z", endDate: "2026-07-15T00:00:00.000Z", initialBankroll: 214, finalBankroll: 224, profit: 10, roi: 4.67, wins: 3, losses: 1, pushes: 0, planScore: 98, replacementCount: 0, totalRisk: 40, totalProfit: 10, completedPlans: 4, averageUnit: 10, streaks: { longestWinningStreak: 3, longestLosingStreak: 1, currentEndingStreak: 3, currentEndingType: "won" } }),
  week({ id: "weekly-summary-3", cycleNumber: 3, startDate: "2026-07-15T00:00:00.000Z", endDate: "2026-07-22T00:00:00.000Z", initialBankroll: 224, finalBankroll: 218, profit: -6, roi: -2.68, wins: 1, losses: 3, pushes: 1, cancelled: 1, planScore: 86, replacementCount: 2, totalRisk: 60, totalProfit: -6, completedPlans: 6, averageUnit: 10, streaks: { longestWinningStreak: 1, longestLosingStreak: 3, currentEndingStreak: 3, currentEndingType: "lost" } }),
  week({ id: "weekly-summary-4", cycleNumber: 4, startDate: "2026-07-22T00:00:00.000Z", endDate: "2026-07-29T00:00:00.000Z", initialBankroll: 218, finalBankroll: 230, profit: 12, roi: 5.5, wins: 2, losses: 1, pushes: 0, planScore: 94, replacementCount: 1, totalRisk: 30, totalProfit: 12, completedPlans: 3, averageUnit: 10, streaks: { longestWinningStreak: 2, longestLosingStreak: 1, currentEndingStreak: 2, currentEndingType: "won" } }),
];

const monthlySummary = createMonthlySummary(julyWeeks, "2026-07-29T12:00:00.000Z");
assert.equal(monthlySummary.id, "monthly-summary-2026-07");
assert.equal(monthlySummary.month, 7);
assert.equal(monthlySummary.year, 2026);
assert.deepEqual(monthlySummary.weeklySummaryIds, ["weekly-summary-1", "weekly-summary-2", "weekly-summary-3", "weekly-summary-4"]);
assert.equal(monthlySummary.initialBankroll, 200);
assert.equal(monthlySummary.finalBankroll, 230);
assert.equal(monthlySummary.profit, 30);
assert.equal(monthlySummary.roi, 3.5);
assert.equal(monthlySummary.wins, 10);
assert.equal(monthlySummary.losses, 7);
assert.equal(monthlySummary.pushes, 2);
assert.equal(monthlySummary.cancelled, 1);
assert.equal(monthlySummary.winRate, 58.82);
assert.equal(monthlySummary.planScore, 93.5);
assert.equal(monthlySummary.completedPlans, 20);
assert.equal(monthlySummary.replacementCount, 4);
assert.equal(monthlySummary.averageUnit, 10);
assert.equal(monthlySummary.totalRisk, 200);
assert.equal(monthlySummary.totalProfit, 30);
assert.equal(monthlySummary.bestWeekId, "weekly-summary-1");
assert.equal(monthlySummary.bestWeekROI, 7);
assert.equal(monthlySummary.worstWeekId, "weekly-summary-3");
assert.equal(monthlySummary.worstWeekROI, -2.68);
assert.equal(monthlySummary.longestWinningStreak, 3);
assert.equal(monthlySummary.longestLosingStreak, 3);
assert.equal(getBestWeek(julyWeeks)?.id, "weekly-summary-1");
assert.equal(getWorstWeek(julyWeeks)?.id, "weekly-summary-3");

const augustWeek = week({
  id: "weekly-summary-5",
  cycleNumber: 5,
  startDate: "2026-08-01T00:00:00.000Z",
  endDate: "2026-08-08T00:00:00.000Z",
  initialBankroll: 230,
  finalBankroll: 235,
  profit: 5,
  roi: 2.17,
});
const monthlySummaries = createMonthlySummaries([...julyWeeks, augustWeek], "2026-08-08T12:00:00.000Z");
assert.equal(monthlySummaries.length, 2);
assert.equal(monthlySummaries[0].id, "monthly-summary-2026-07");
assert.equal(monthlySummaries[1].id, "monthly-summary-2026-08");
assert.equal(monthlySummaries[1].weeklySummaryIds.length, 1);

const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 230,
  recommendedUnit: 11.5,
  profile: "atlas_recommended",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
  weeklySummaries: julyWeeks,
};
const normalizedMonthly = normalizeMonthlyState(baseConfig, "2026-07-29T12:00:00.000Z");
assert.equal(normalizedMonthly.monthlySummaries?.length, 1);
assert.equal(normalizedMonthly.monthlySummaries?.[0].id, "monthly-summary-2026-07");

const refreshedMonthly = normalizeMonthlyState(normalizedMonthly, "2026-07-29T13:00:00.000Z");
assert.equal(refreshedMonthly.monthlySummaries?.length, 1);
assert.equal(refreshedMonthly.monthlySummaries?.[0].createdAt, normalizedMonthly.monthlySummaries?.[0].createdAt);

const normalizedConfig = normalizeBankrollConfig(baseConfig);
assert.equal(normalizedConfig.monthlySummaries?.length, 1);
assert.equal(normalizedConfig.monthlySummaries?.[0].profit, 30);

console.log("Monthly Summary engine validation OK");
