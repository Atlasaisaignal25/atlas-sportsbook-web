import assert from "node:assert/strict";
import {
  buildFinancialPlan,
  calculateExposure,
  calculateFinancialMetrics,
  calculateRecommendedUnit,
  calculateROI,
  formatPercentage,
  normalizeBankrollConfig,
  updateCurrentBankroll,
  type BankrollConfig,
  type FinancialState,
} from "../app/lib/bankroll";

const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 214,
  recommendedUnit: 10,
  profile: "atlas_recommended",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const gainPlan = buildFinancialPlan(baseConfig);
assert.equal(gainPlan.metrics.currentBankroll, 214);
assert.equal(gainPlan.metrics.profit, 14);
assert.equal(gainPlan.metrics.roi.value, 7);
assert.equal(gainPlan.metrics.roi.status, "positive");
assert.equal(gainPlan.metrics.recommendedUnit, 10.7);
assert.equal(gainPlan.metrics.exposure.value, 5);
assert.equal(gainPlan.metrics.exposure.status, "aligned");

const lossPlan = buildFinancialPlan({ ...baseConfig, currentBankroll: 180 });
assert.equal(lossPlan.metrics.profit, -20);
assert.equal(lossPlan.metrics.roi.value, -10);
assert.equal(lossPlan.metrics.roi.status, "negative");
assert.equal(lossPlan.metrics.recommendedUnit, 9);
assert.equal(lossPlan.metrics.exposure.value, 5);

const higherExposure = buildFinancialPlan({ ...baseConfig, profile: "higher_exposure" });
assert.equal(higherExposure.metrics.recommendedUnit, 14.98);
assert.equal(higherExposure.metrics.exposure.value, 7);
assert.equal(higherExposure.metrics.exposure.status, "aligned");

const zeroState: FinancialState = {
  initialBankroll: 200,
  currentBankroll: 0,
  profile: "atlas_recommended",
  currentCycle: "Day 4 / 7",
  planStatus: "active",
  createdAt: baseConfig.createdAt,
  updatedAt: baseConfig.updatedAt,
};
const zeroMetrics = calculateFinancialMetrics(zeroState);
assert.equal(zeroMetrics.currentBankroll, 0);
assert.equal(zeroMetrics.recommendedUnit, 0);
assert.equal(zeroMetrics.profit, -200);
assert.equal(zeroMetrics.roi.value, -100);
assert.equal(zeroMetrics.exposure.value, 0);

const updated = updateCurrentBankroll(gainPlan.state, 180);
assert.equal(updated.metrics.recommendedUnit, 9);
assert.equal(updated.metrics.profit, -20);
assert.equal(updated.metrics.roi.value, -10);
assert.equal(updated.metrics.exposure.value, 5);

const normalized = normalizeBankrollConfig({ ...baseConfig, currentBankroll: -25, recommendedUnit: 99 });
assert.equal(normalized.currentBankroll, 0);
assert.equal(normalized.recommendedUnit, 0);

assert.equal(calculateRecommendedUnit(1000, "atlas_recommended"), 50);
assert.equal(calculateRecommendedUnit(1000, "higher_exposure"), 70);
assert.deepEqual(calculateROI(214, 200), { value: 7, status: "positive" });
assert.deepEqual(calculateExposure(14.98, 214, "higher_exposure"), { value: 7, target: 7, status: "aligned" });
assert.equal(formatPercentage(7), "+7%");
assert.equal(formatPercentage(-10), "-10%");
assert.equal(formatPercentage(0), "0%");

console.log("Bankroll financial engine validation OK");
