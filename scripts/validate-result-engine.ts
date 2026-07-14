import assert from "node:assert/strict";
import {
  buildFinancialPlan,
  calculateAmericanOddsProfit,
  createAtlasPlan,
  getCompletedPlans,
  getPendingPlans,
  processPlanResult,
  type AtlasPlan,
  type AtlasPlanCollection,
  type BankrollConfig,
} from "../app/lib/bankroll";

const now = "2026-07-14T12:00:00.000Z";
const settledAt = "2026-07-14T15:00:00.000Z";

const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 200,
  recommendedUnit: 10,
  profile: "atlas_recommended",
  createdAt: now,
  updatedAt: now,
};

const metrics = buildFinancialPlan(baseConfig).metrics;

function plan(overrides: Partial<AtlasPlan> = {}): AtlasPlan {
  return {
    ...createAtlasPlan(metrics, now),
    id: "atlas-plan-premium-mlb-1",
    candidateId: "premium-mlb-1",
    odds: -110,
    riskAmount: 10,
    recommendedUnit: 10,
    startTime: "2026-07-14T18:00:00.000Z",
    ...overrides,
  };
}

function collection(plans: AtlasPlan[], primaryPlan = plans[0]): AtlasPlanCollection {
  return {
    plans,
    primaryPlan,
    manualSelectionRequired: false,
    createdAt: now,
    updatedAt: now,
  };
}

assert.equal(calculateAmericanOddsProfit(10, -110), 9.09);
assert.equal(calculateAmericanOddsProfit(10, -135), 7.41);
assert.equal(calculateAmericanOddsProfit(10, 120), 12);

const wonConfig = processPlanResult(
  {
    ...baseConfig,
    atlasPlanCollection: collection([plan()]),
  },
  "won",
  { settledAt },
);
assert.equal(wonConfig.currentBankroll, 209.09);
assert.equal(wonConfig.recommendedUnit, 10.45);
assert.equal(wonConfig.atlasPlanCollection?.plans[0].status, "won");
assert.equal(wonConfig.atlasPlanCollection?.plans[0].result, "won");
assert.equal(wonConfig.atlasPlanCollection?.plans[0].completedAt, settledAt);
assert.equal(wonConfig.atlasPlanCollection?.plans[0].profit, 9.09);
assert.equal(buildFinancialPlan(wonConfig).metrics.profit, 9.09);
assert.equal(buildFinancialPlan(wonConfig).metrics.roi.value, 4.55);

const idempotentWon = processPlanResult(wonConfig, "won", { settledAt: "2026-07-14T16:00:00.000Z" });
assert.equal(idempotentWon.currentBankroll, wonConfig.currentBankroll);
assert.equal(idempotentWon.atlasPlanCollection?.plans[0].completedAt, settledAt);

const lostConfig = processPlanResult(
  {
    ...baseConfig,
    atlasPlanCollection: collection([plan()]),
  },
  "lost",
  { settledAt },
);
assert.equal(lostConfig.currentBankroll, 190);
assert.equal(lostConfig.recommendedUnit, 9.5);
assert.equal(lostConfig.atlasPlanCollection?.plans[0].status, "lost");
assert.equal(lostConfig.atlasPlanCollection?.plans[0].profit, -10);
assert.equal(buildFinancialPlan(lostConfig).metrics.profit, -10);
assert.equal(buildFinancialPlan(lostConfig).metrics.roi.value, -5);

const pushConfig = processPlanResult(
  {
    ...baseConfig,
    atlasPlanCollection: collection([plan()]),
  },
  "push",
  { settledAt },
);
assert.equal(pushConfig.currentBankroll, 200);
assert.equal(pushConfig.recommendedUnit, 10);
assert.equal(pushConfig.atlasPlanCollection?.plans[0].status, "push");
assert.equal(pushConfig.atlasPlanCollection?.plans[0].profit, 0);

const cancelledConfig = processPlanResult(
  {
    ...baseConfig,
    atlasPlanCollection: collection([plan()]),
  },
  "cancelled",
  { settledAt },
);
assert.equal(cancelledConfig.currentBankroll, 200);
assert.equal(cancelledConfig.recommendedUnit, 10);
assert.equal(cancelledConfig.atlasPlanCollection?.plans[0].status, "cancelled");
assert.equal(cancelledConfig.atlasPlanCollection?.plans[0].profit, 0);

const firstPlan = plan({ id: "atlas-plan-premium-mlb-1", candidateId: "premium-mlb-1", startTime: "2026-07-14T18:00:00.000Z" });
const secondPlan = plan({
  id: "atlas-plan-premium-mlb-2",
  candidateId: "premium-mlb-2",
  selection: "Braves ML",
  odds: -122,
  rank: 2,
  startTime: "2026-07-14T20:00:00.000Z",
});
const nextPrimaryConfig = processPlanResult(
  {
    ...baseConfig,
    atlasPlanCollection: collection([firstPlan, secondPlan], firstPlan),
  },
  "lost",
  { planId: firstPlan.id, settledAt },
);
assert.equal(nextPrimaryConfig.atlasPlanCollection?.primaryPlan?.id, secondPlan.id);
assert.equal(nextPrimaryConfig.atlasPlan?.id, secondPlan.id);
assert.equal(nextPrimaryConfig.atlasPlanCollection?.primaryPlan?.recommendedUnit, 9.5);
assert.equal(nextPrimaryConfig.atlasPlanCollection?.primaryPlan?.riskAmount, 9.5);
assert.equal(getCompletedPlans(nextPrimaryConfig.atlasPlanCollection).length, 1);
assert.equal(getPendingPlans(nextPrimaryConfig.atlasPlanCollection).length, 1);

const zeroBankrollConfig = processPlanResult(
  {
    ...baseConfig,
    currentBankroll: 5,
    atlasPlanCollection: collection([plan({ riskAmount: 10 })]),
  },
  "lost",
  { settledAt },
);
assert.equal(zeroBankrollConfig.currentBankroll, 0);
assert.equal(zeroBankrollConfig.recommendedUnit, 0);

console.log("Result engine validation OK");
