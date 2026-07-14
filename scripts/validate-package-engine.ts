import assert from "node:assert/strict";
import {
  buildFinancialPlan,
  buildPlans,
  normalizeBankrollConfig,
  syncPlans,
  type BankrollConfig,
  type MembershipContext,
} from "../app/lib/bankroll";

const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 200,
  recommendedUnit: 10,
  profile: "atlas_recommended",
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const now = "2026-07-14T00:00:00.000Z";
const metrics = buildFinancialPlan(baseConfig).metrics;

const freeMembership: MembershipContext = {
  package: "free",
  selectedSport: null,
  availableSports: ["MLB", "NBA", "NFL", "NHL"],
};
const freeCollection = buildPlans(freeMembership, metrics, now);
assert.equal(freeCollection.manualSelectionRequired, true);
assert.equal(freeCollection.plans.length, 0);
assert.equal(freeCollection.primaryPlan, null);

const exclusiveMembership: MembershipContext = {
  package: "exclusive",
  selectedSport: null,
  availableSports: ["MLB", "NBA", "NFL", "NHL"],
};
const exclusiveCollection = buildPlans(exclusiveMembership, metrics, now);
assert.equal(exclusiveCollection.plans.length, 4);
assert.deepEqual(exclusiveCollection.plans.map((plan) => plan.sport), ["MLB", "NBA", "NFL", "NHL"]);
assert.equal(exclusiveCollection.plans.every((plan) => plan.rank === 1), true);
assert.equal(exclusiveCollection.plans.every((plan) => plan.source === "signals"), true);
assert.equal(exclusiveCollection.primaryPlan?.sport, "MLB");

const premiumMembership: MembershipContext = {
  package: "premium",
  selectedSport: "MLB",
  availableSports: ["MLB"],
};
const premiumCollection = buildPlans(premiumMembership, metrics, now);
assert.equal(premiumCollection.plans.length, 1);
assert.equal(premiumCollection.plans[0].sport, "MLB");
assert.equal(premiumCollection.plans[0].source, "top5");
assert.equal(premiumCollection.primaryPlan?.selection, "Dodgers ML");

const unlimitedMembership: MembershipContext = {
  package: "unlimited",
  selectedSport: null,
  availableSports: ["MLB", "NBA", "NFL", "NHL"],
};
const unlimitedCollection = buildPlans(unlimitedMembership, metrics, now);
assert.equal(unlimitedCollection.plans.length, 4);
assert.equal(unlimitedCollection.plans.every((plan) => plan.rank === 1), true);
assert.equal(unlimitedCollection.plans.every((plan) => plan.source === "top5"), true);

const increasedMetrics = buildFinancialPlan({ ...baseConfig, currentBankroll: 214 }).metrics;
const syncedPremium = syncPlans(premiumCollection, premiumMembership, increasedMetrics, "2026-07-14T01:00:00.000Z");
assert.equal(syncedPremium.plans[0].recommendedUnit, 10.7);
assert.equal(syncedPremium.plans[0].riskAmount, 10.7);
assert.equal(syncedPremium.primaryPlan?.recommendedUnit, 10.7);
assert.equal(syncedPremium.primaryPlan?.riskAmount, 10.7);

const normalizedConfig = normalizeBankrollConfig({
  ...baseConfig,
  membership: unlimitedMembership,
});
assert.equal(normalizedConfig.membership?.package, "unlimited");
assert.equal(normalizedConfig.atlasPlanCollection?.plans.length, 4);
assert.equal(normalizedConfig.atlasPlan?.id, normalizedConfig.atlasPlanCollection?.primaryPlan?.id);

console.log("Package engine validation OK");
