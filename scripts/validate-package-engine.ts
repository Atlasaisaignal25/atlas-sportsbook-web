import assert from "node:assert/strict";
import {
  buildFinancialPlan,
  buildPlans,
  getPlanCandidatesForMembership,
  getTrackingCandidatesForMembership,
  normalizeBankrollConfig,
  syncPlans,
  type AtlasPackageSources,
  type BankrollConfig,
  type MembershipContext,
} from "../app/lib/bankroll";
import { validationAtlasSources } from "./bankroll-validation-sources";

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
const freeCollection = buildPlans(freeMembership, metrics, now, validationAtlasSources);
assert.equal(freeCollection.manualSelectionRequired, true);
assert.equal(freeCollection.plans.length, 0);
assert.equal(freeCollection.primaryPlan, null);

const exclusiveMembership: MembershipContext = {
  package: "exclusive",
  selectedSport: null,
  availableSports: ["MLB", "NBA", "NFL", "NHL"],
};
const exclusiveCollection = buildPlans(exclusiveMembership, metrics, now, validationAtlasSources);
assert.equal(exclusiveCollection.plans.length, 4);
assert.deepEqual(exclusiveCollection.plans.map((plan) => plan.sport), ["MLB", "NBA", "NFL", "NHL"]);
assert.equal(exclusiveCollection.plans.every((plan) => plan.rank === 1), true);
assert.equal(exclusiveCollection.plans.every((plan) => plan.source === "top3"), true);
assert.equal(exclusiveCollection.primaryPlan?.sport, "MLB");

const premiumMembership: MembershipContext = {
  package: "premium",
  selectedSport: "MLB",
  availableSports: ["MLB"],
};
const premiumCollection = buildPlans(premiumMembership, metrics, now, validationAtlasSources);
assert.equal(premiumCollection.plans.length, 1);
assert.equal(premiumCollection.plans[0].sport, "MLB");
assert.equal(premiumCollection.plans[0].source, "top5");
assert.equal(premiumCollection.primaryPlan?.selection, "Dodgers ML");

const unlimitedMembership: MembershipContext = {
  package: "unlimited",
  selectedSport: null,
  availableSports: ["MLB", "NBA", "NFL", "NHL"],
};
const unlimitedCollection = buildPlans(unlimitedMembership, metrics, now, validationAtlasSources);
assert.equal(unlimitedCollection.plans.length, 4);
assert.equal(unlimitedCollection.plans.every((plan) => plan.rank === 1), true);
assert.equal(unlimitedCollection.plans.every((plan) => plan.source === "top5"), true);

const increasedMetrics = buildFinancialPlan({ ...baseConfig, currentBankroll: 214 }).metrics;
const syncedPremium = syncPlans(premiumCollection, premiumMembership, increasedMetrics, "2026-07-14T01:00:00.000Z", validationAtlasSources);
assert.equal(syncedPremium.plans[0].recommendedUnit, 10.7);
assert.equal(syncedPremium.plans[0].riskAmount, 10.7);
assert.equal(syncedPremium.primaryPlan?.recommendedUnit, 10.7);
assert.equal(syncedPremium.primaryPlan?.riskAmount, 10.7);

const normalizedConfig = normalizeBankrollConfig({
  ...baseConfig,
  membership: unlimitedMembership,
});
assert.equal(normalizedConfig.membership?.package, "unlimited");
assert.equal(normalizedConfig.atlasPlanCollection?.plans.length, 0);

const liveSynced = syncPlans(normalizedConfig.atlasPlanCollection, unlimitedMembership, metrics, now, validationAtlasSources);
assert.equal(liveSynced.plans.length, 4);

const soccerAdaptiveSources = soccerSources(6, 5);
const soccerFreeTracking = getTrackingCandidatesForMembership(
  { package: "free", selectedSport: null, availableSports: ["SOCCER"] },
  now,
  soccerAdaptiveSources,
);
assert.equal(soccerFreeTracking.length, 2);
assert.deepEqual(soccerFreeTracking.map((pick) => pick.selection), ["Soccer Signal 5", "Soccer Signal 6"]);
assert.equal(soccerFreeTracking.every((pick) => pick.source === "signals"), true);

const soccerExclusiveTracking = getTrackingCandidatesForMembership(
  { package: "exclusive", selectedSport: null, availableSports: ["SOCCER"] },
  now,
  soccerAdaptiveSources,
);
assert.equal(soccerExclusiveTracking.length, 2);
assert.deepEqual(soccerExclusiveTracking.map((pick) => pick.selection), ["Soccer Signal 5", "Soccer Signal 6"]);
assert.equal(soccerExclusiveTracking.every((pick) => pick.source === "top3"), true);

const soccerPremiumCandidates = getPlanCandidatesForMembership(
  { package: "premium", selectedSport: "SOCCER", availableSports: ["SOCCER"] },
  now,
  soccerAdaptiveSources,
);
assert.equal(soccerPremiumCandidates.length, 3);
assert.deepEqual(soccerPremiumCandidates.map((pick) => pick.selection), ["Soccer Signal 2", "Soccer Signal 3", "Soccer Signal 4"]);
assert.equal(soccerPremiumCandidates.every((pick) => pick.source === "top5"), true);

const soccerUnlimitedCandidates = getPlanCandidatesForMembership(
  { package: "unlimited", selectedSport: null, availableSports: ["SOCCER"] },
  now,
  soccerAdaptiveSources,
);
assert.equal(soccerUnlimitedCandidates.length, 3);
assert.deepEqual(soccerUnlimitedCandidates.map((pick) => pick.selection), ["Soccer Signal 2", "Soccer Signal 3", "Soccer Signal 4"]);

const compactSoccerSources = soccerSources(4, 4);
assert.equal(getTrackingCandidatesForMembership({ package: "free", selectedSport: null, availableSports: ["SOCCER"] }, now, compactSoccerSources).length, 0);
assert.equal(getTrackingCandidatesForMembership({ package: "exclusive", selectedSport: null, availableSports: ["SOCCER"] }, now, compactSoccerSources).length, 0);
assert.equal(getPlanCandidatesForMembership({ package: "premium", selectedSport: "SOCCER", availableSports: ["SOCCER"] }, now, compactSoccerSources).length, 3);

console.log("Package engine validation OK");

function soccerSources(signalCount: number, top5Count: number): AtlasPackageSources {
  const signals = Array.from({ length: signalCount }, (_, index) => source(
    `soccer-game-${index + 1}`,
    "SOCCER",
    `Soccer Signal ${index + 1}`,
    "Moneyline",
    -110 - index,
    index + 1,
  ));
  const top5 = Array.from({ length: top5Count }, (_, index) => source(
    `soccer-game-${index + 1}`,
    "SOCCER",
    `Soccer Signal ${index + 1}`,
    "Moneyline",
    -110 - index,
    index + 1,
  ));

  return {
    signals,
    top3: top5.filter((pick) => (pick.rank ?? 999) <= 3),
    top5,
  };
}

function source(
  id: string,
  sport: "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER",
  selection: string,
  market: string,
  odds: number,
  rank: number,
) {
  return {
    id,
    sport,
    league: sport,
    eventId: id,
    homeTeam: `${sport} Home`,
    awayTeam: `${sport} Away`,
    selection,
    market,
    odds,
    status: "pending" as const,
    rank,
    startTime: now,
  };
}
