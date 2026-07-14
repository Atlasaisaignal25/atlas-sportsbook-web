import assert from "node:assert/strict";
import {
  buildFinancialPlan,
  createAtlasPlan,
  evaluateCollectionReplacements,
  evaluatePlanReplacement,
  lockStartedPlans,
  normalizeBankrollConfig,
  type AtlasPlan,
  type AtlasPlanCandidate,
  type BankrollConfig,
  type MembershipContext,
} from "../app/lib/bankroll";

const now = "2026-07-14T12:00:00.000Z";
const future = "2026-07-14T18:00:00.000Z";
const past = "2026-07-14T10:00:00.000Z";

const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 200,
  recommendedUnit: 10,
  profile: "atlas_recommended",
  createdAt: now,
  updatedAt: now,
};

const metrics = buildFinancialPlan(baseConfig).metrics;

const exclusiveMembership: MembershipContext = {
  package: "exclusive",
  selectedSport: null,
  availableSports: ["MLB", "NBA"],
};

const premiumMembership: MembershipContext = {
  package: "premium",
  selectedSport: "MLB",
  availableSports: ["MLB"],
};

const unlimitedMembership: MembershipContext = {
  package: "unlimited",
  selectedSport: null,
  availableSports: ["MLB", "NBA"],
};

function plan(overrides: Partial<AtlasPlan> = {}): AtlasPlan {
  return {
    ...createAtlasPlan(metrics, now),
    id: "atlas-plan-premium-mlb",
    candidateId: "premium-mlb-1",
    package: "premium",
    source: "top5",
    sport: "MLB",
    league: "MLB",
    rank: 1,
    originalRank: 1,
    startTime: future,
    replacementHistory: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<AtlasPlanCandidate>): AtlasPlanCandidate {
  return {
    candidateId: "premium-mlb-1",
    sport: "MLB",
    league: "MLB",
    selection: "Dodgers ML",
    market: "Moneyline",
    odds: -135,
    status: "pending",
    package: "premium",
    startTime: future,
    source: "top5",
    rank: 1,
    ...overrides,
  };
}

const exclusiveRemoved = evaluatePlanReplacement(
  plan({ id: "atlas-plan-exclusive-mlb", candidateId: "signals-mlb-1", package: "exclusive", source: "signals", status: "removed" }),
  [
    candidate({ candidateId: "signals-mlb-1", package: "exclusive", source: "signals", status: "removed", rank: 1 }),
    candidate({ candidateId: "signals-mlb-2", package: "exclusive", source: "signals", selection: "Yankees ML", rank: 2 }),
    candidate({ candidateId: "signals-mlb-3", package: "exclusive", source: "signals", selection: "Mets ML", rank: 3 }),
  ],
  exclusiveMembership,
  metrics,
  now,
);
assert.equal(exclusiveRemoved.candidateId, "signals-mlb-2");
assert.equal(exclusiveRemoved.rank, 2);
assert.equal(exclusiveRemoved.replacementHistory.length, 1);
assert.equal(exclusiveRemoved.replacementHistory[0].reason, "removed");

const exclusiveDowngraded = evaluatePlanReplacement(
  plan({ id: "atlas-plan-exclusive-mlb", candidateId: "signals-mlb-1", package: "exclusive", source: "signals", status: "downgraded" }),
  [
    candidate({ candidateId: "signals-mlb-1", package: "exclusive", source: "signals", status: "downgraded", rank: 1 }),
    candidate({ candidateId: "signals-mlb-2", package: "exclusive", source: "signals", selection: "Yankees ML", rank: 2, status: "started" }),
    candidate({ candidateId: "signals-mlb-3", package: "exclusive", source: "signals", selection: "Mets ML", rank: 3, status: "confirmed" }),
  ],
  exclusiveMembership,
  metrics,
  now,
);
assert.equal(exclusiveDowngraded.candidateId, "signals-mlb-3");
assert.equal(exclusiveDowngraded.rank, 3);
assert.equal(exclusiveDowngraded.status, "confirmed");

const premiumSkipToFour = evaluatePlanReplacement(
  plan({ status: "removed" }),
  [
    candidate({ candidateId: "premium-mlb-1", status: "removed", rank: 1 }),
    candidate({ candidateId: "premium-mlb-2", selection: "Braves ML", rank: 2, status: "started" }),
    candidate({ candidateId: "premium-mlb-3", selection: "Phillies ML", rank: 3, status: "removed" }),
    candidate({ candidateId: "premium-mlb-4", selection: "Padres ML", rank: 4 }),
    candidate({ candidateId: "premium-mlb-5", selection: "Orioles ML", rank: 5 }),
  ],
  premiumMembership,
  metrics,
  now,
);
assert.equal(premiumSkipToFour.candidateId, "premium-mlb-4");
assert.equal(premiumSkipToFour.rank, 4);

const noReplacement = evaluatePlanReplacement(
  plan({ status: "removed" }),
  [
    candidate({ candidateId: "premium-mlb-1", status: "removed", rank: 1 }),
    candidate({ candidateId: "premium-mlb-2", rank: 2, status: "started" }),
    candidate({ candidateId: "premium-mlb-3", rank: 3, status: "removed" }),
    candidate({ candidateId: "premium-mlb-4", rank: 4, startTime: past }),
    candidate({ candidateId: "premium-mlb-5", rank: 5, status: "downgraded" }),
  ],
  premiumMembership,
  metrics,
  now,
);
assert.equal(noReplacement.status, "no_eligible_replacement");
assert.equal(noReplacement.replacementHistory.length, 0);

const lockedPlan = lockStartedPlans([plan({ startTime: past })], now)[0];
const lockedAfterRemoved = evaluatePlanReplacement(
  { ...lockedPlan, status: "removed" },
  [candidate({ candidateId: "premium-mlb-2", rank: 2 })],
  premiumMembership,
  metrics,
  now,
);
assert.equal(lockedAfterRemoved.candidateId, "premium-mlb-1");
assert.equal(lockedAfterRemoved.locked, true);
assert.equal(lockedAfterRemoved.started, true);
assert.equal(lockedAfterRemoved.replacementHistory.length, 0);

const mlbPlan = plan({ id: "atlas-plan-unlimited-mlb", candidateId: "premium-mlb-1", package: "unlimited", status: "removed" });
const nbaPlan = plan({ id: "atlas-plan-unlimited-nba", candidateId: "premium-nba-1", package: "unlimited", sport: "NBA", league: "NBA", selection: "Celtics ML", source: "top5" });
const unlimitedPlans = evaluateCollectionReplacements(
  [mlbPlan, nbaPlan],
  [
    candidate({ candidateId: "premium-mlb-1", package: "unlimited", status: "removed", rank: 1 }),
    candidate({ candidateId: "premium-mlb-2", package: "unlimited", selection: "Braves ML", rank: 2 }),
    candidate({ candidateId: "premium-nba-1", package: "unlimited", sport: "NBA", league: "NBA", selection: "Celtics ML", rank: 1 }),
    candidate({ candidateId: "premium-nba-2", package: "unlimited", sport: "NBA", league: "NBA", selection: "Nuggets ML", rank: 2 }),
  ],
  unlimitedMembership,
  metrics,
  now,
);
assert.equal(unlimitedPlans.find((item) => item.sport === "MLB")?.candidateId, "premium-mlb-2");
assert.equal(unlimitedPlans.find((item) => item.sport === "NBA")?.candidateId, "premium-nba-1");

const idempotentOnce = evaluatePlanReplacement(
  plan({ status: "removed" }),
  [
    candidate({ candidateId: "premium-mlb-1", status: "removed", rank: 1 }),
    candidate({ candidateId: "premium-mlb-2", selection: "Braves ML", rank: 2 }),
  ],
  premiumMembership,
  metrics,
  now,
);
const idempotentTwice = evaluatePlanReplacement(
  idempotentOnce,
  [
    candidate({ candidateId: "premium-mlb-1", status: "removed", rank: 1 }),
    candidate({ candidateId: "premium-mlb-2", selection: "Braves ML", rank: 2 }),
  ],
  premiumMembership,
  metrics,
  now,
);
assert.equal(idempotentTwice.candidateId, idempotentOnce.candidateId);
assert.equal(idempotentTwice.replacementHistory.length, 1);

const migrated = normalizeBankrollConfig({
  ...baseConfig,
  atlasPlanCollection: {
    plans: [
      {
        ...createAtlasPlan(metrics, now),
        candidateId: "premium-mlb-1",
        replacementHistory: [],
      },
    ],
    primaryPlan: null,
    manualSelectionRequired: false,
    createdAt: now,
    updatedAt: now,
  },
});
assert.equal(migrated.atlasPlanCollection?.plans[0].replacementHistory.length, 0);
assert.equal(migrated.atlasPlanCollection?.plans[0].candidateId, "premium-mlb-1");

console.log("Replacement engine validation OK");
