import assert from "node:assert/strict";
import {
  buildComparison,
  buildManualAnalytics,
  createAtlasPlan,
  createManualTracking,
  createTrackedPick,
  filterPicksByMembership,
  processManualResult,
  processPlanResult,
  type BankrollConfig,
  type ManualTrackingCollection,
} from "../app/lib/bankroll";
import { validationAtlasSources } from "./bankroll-validation-sources";

const now = new Date("2026-07-14T12:00:00.000Z");
const membership = {
  package: "unlimited" as const,
  selectedSport: null,
  availableSports: ["MLB" as const, "NBA" as const],
};
const atlasPicks = filterPicksByMembership(membership, now.toISOString(), validationAtlasSources);

const baseConfig: BankrollConfig = {
  initialBankroll: 500,
  currentBankroll: 500,
  recommendedUnit: 25,
  profile: "atlas_recommended",
  membership,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const atlasPlan = {
  ...createAtlasPlan({
    currentBankroll: 500,
    recommendedUnit: 25,
    profit: 0,
    roi: { value: 0, status: "zero" },
    exposure: { value: 5, target: 5, status: "aligned" },
  }, "2026-07-14T09:00:00.000Z"),
  id: "atlas-plan-1",
  candidateId: atlasPicks[0].id,
  sport: "MLB",
  market: "Moneyline",
  selection: "Dodgers ML",
  odds: -100,
  riskAmount: 25,
  plannedExposure: 5,
  completedAt: null,
};

let atlasConfig: BankrollConfig = {
  ...baseConfig,
  atlasPlanCollection: {
    plans: [atlasPlan],
    primaryPlan: atlasPlan,
    manualSelectionRequired: false,
    createdAt: "2026-07-14T09:00:00.000Z",
    updatedAt: "2026-07-14T09:00:00.000Z",
  },
};
atlasConfig = processPlanResult(atlasConfig, "won", {
  planId: "atlas-plan-1",
  settledAt: "2026-07-14T20:00:00.000Z",
});

function addManualPick(collection: ManualTrackingCollection, pickIndex: number, riskAmount: string, createdAt: string) {
  const pick = atlasPicks[pickIndex];
  return createTrackedPick(collection, pick, { atlasPickId: pick.id, riskAmount, notes: "" }, 500, createdAt);
}

let manualTracking = createManualTracking("2026-07-14T00:00:00.000Z", 500);
manualTracking = addManualPick(manualTracking, 0, "$25", "2026-07-14T10:00:00.000Z");
manualTracking = addManualPick(manualTracking, 5, "$25", "2026-07-14T11:00:00.000Z");

let configWithManual: BankrollConfig = { ...atlasConfig, manualTracking };
configWithManual.weeklySummaries = [
  {
    id: "weekly-summary-1",
    cycleNumber: 1,
    startDate: "2026-07-14T00:00:00.000Z",
    endDate: "2026-07-14T23:59:59.000Z",
    status: "closed",
    initialBankroll: 500,
    finalBankroll: 525,
    profit: 25,
    roi: 5,
    recommendedUnitFinal: 25,
    profile: "atlas_recommended",
    package: "premium",
    currentExposure: 5,
    wins: 1,
    losses: 0,
    pushes: 0,
    cancelled: 0,
    completedPlans: 1,
    pendingPlans: 0,
    winRate: 100,
    planScore: 95,
    replacementCount: 0,
    averageUnit: 25,
    totalRisk: 25,
    totalProfit: 25,
    streaks: {
      longestWinningStreak: 1,
      longestLosingStreak: 0,
      currentEndingStreak: 1,
      currentEndingType: "won",
    },
    createdAt: "2026-07-14T23:59:59.000Z",
  },
];
configWithManual = processManualResult(configWithManual, "won", {
  pickId: "manual-pick-20260714100000000",
  settledAt: "2026-07-14T21:00:00.000Z",
  availableAtlasPicks: atlasPicks,
});
configWithManual = processManualResult(configWithManual, "won", {
  pickId: "manual-pick-20260714110000000",
  settledAt: "2026-07-14T22:00:00.000Z",
  availableAtlasPicks: atlasPicks,
});

const manualAnalytics = buildManualAnalytics(configWithManual.manualTracking, "today", "2026-07-14", "atlas_recommended", now);
const comparison = buildComparison(configWithManual, manualAnalytics, "today", "2026-07-14", now);

assert.equal(comparison.hasComparisonData, true);
assert.equal(comparison.atlasROI, 5);
assert.equal(comparison.manualROI, 7.28);
assert.equal(comparison.betterROI, "manual");
assert.equal(comparison.betterWinRate, "even");
assert.equal(comparison.betterDiscipline, "manual");
assert.equal(comparison.roiComparison.leader, "manual");
assert.equal(comparison.profitComparison.leader, "manual");
assert.equal(comparison.disciplineComparison.leader, "manual");
assert.equal(comparison.sports.some((sport) => sport.label === "MLB"), true);
assert.equal(comparison.markets.some((market) => market.label === "Moneyline"), true);
assert.equal(comparison.insights.length > 0, true);

const noManualComparison = buildComparison(atlasConfig, buildManualAnalytics(undefined, "today", "2026-07-14", "atlas_recommended", now), "today", "2026-07-14", now);
assert.equal(noManualComparison.hasComparisonData, false);
assert.equal(noManualComparison.insights[0], "Comparison will become available after both Atlas Plan and My Tracking have completed picks.");

const allTimeComparison = buildComparison(configWithManual, buildManualAnalytics(configWithManual.manualTracking, "all_time", "2026-07-14", "atlas_recommended", now), "all_time", "2026-07-14", now);
assert.equal(allTimeComparison.hasComparisonData, true);

const deterministic = buildComparison(configWithManual, manualAnalytics, "today", "2026-07-14", now);
assert.deepEqual(deterministic, comparison);

console.log("Comparison engine validation OK");
