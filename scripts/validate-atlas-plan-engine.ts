import assert from "node:assert/strict";
import {
  buildFinancialPlan,
  createAtlasPlan,
  formatPlanPackage,
  formatPlanStatus,
  getPlanStatus,
  getPlanStatusTone,
  normalizeBankrollConfig,
  syncPlanWithFinancialEngine,
  updateAtlasPlan,
  type BankrollConfig,
} from "../app/lib/bankroll";

const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 200,
  recommendedUnit: 10,
  profile: "atlas_recommended",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const baseFinancialPlan = buildFinancialPlan(baseConfig);
const atlasPlan = createAtlasPlan(baseFinancialPlan.metrics, "2026-07-14T00:00:00.000Z");

assert.equal(atlasPlan.sport, "MLB");
assert.equal(atlasPlan.league, "MLB");
assert.equal(atlasPlan.selection, "Dodgers ML");
assert.equal(atlasPlan.market, "Moneyline");
assert.equal(atlasPlan.odds, -135);
assert.equal(atlasPlan.package, "premium");
assert.equal(atlasPlan.status, "pending");
assert.equal(atlasPlan.source, "top5");
assert.equal(atlasPlan.rank, 1);
assert.equal(atlasPlan.recommendedUnit, 10);
assert.equal(atlasPlan.riskAmount, 10);
assert.equal(atlasPlan.locked, false);
assert.equal(atlasPlan.started, false);
assert.equal(atlasPlan.result, null);

assert.equal(getPlanStatus(atlasPlan), "pending");
assert.equal(getPlanStatusTone("pending"), "pending");
assert.equal(getPlanStatusTone("confirmed"), "positive");
assert.equal(getPlanStatusTone("started"), "active");
assert.equal(getPlanStatusTone("lost"), "negative");
assert.equal(getPlanStatusTone("push"), "neutral");
assert.equal(formatPlanStatus("pending"), "Pending");
assert.equal(formatPlanPackage("premium"), "Premium");

const increasedFinancialPlan = buildFinancialPlan({ ...baseConfig, currentBankroll: 214 });
const syncedPlan = syncPlanWithFinancialEngine(atlasPlan, increasedFinancialPlan.metrics, "2026-07-14T01:00:00.000Z");
assert.equal(syncedPlan.recommendedUnit, 10.7);
assert.equal(syncedPlan.riskAmount, 10.7);
assert.equal(syncedPlan.selection, "Dodgers ML");

const higherExposurePlan = syncPlanWithFinancialEngine(atlasPlan, buildFinancialPlan({ ...baseConfig, currentBankroll: 214, profile: "higher_exposure" }).metrics);
assert.equal(higherExposurePlan.recommendedUnit, 14.98);
assert.equal(higherExposurePlan.riskAmount, 14.98);

const startedPlan = updateAtlasPlan(atlasPlan, { status: "started", started: true });
assert.equal(startedPlan.started, true);
assert.equal(startedPlan.locked, true);

const normalizedConfig = normalizeBankrollConfig({ ...baseConfig, atlasPlan });
assert.equal(normalizedConfig.atlasPlan?.recommendedUnit, 10);
assert.equal(normalizedConfig.atlasPlan?.riskAmount, 10);

const refreshedConfig = normalizeBankrollConfig({
  ...normalizedConfig,
  currentBankroll: 180,
});
assert.equal(refreshedConfig.atlasPlan?.recommendedUnit, 9);
assert.equal(refreshedConfig.atlasPlan?.riskAmount, 9);

console.log("Atlas Plan engine validation OK");
