import assert from "node:assert/strict";
import {
  createTrackedPick,
  createManualTracking,
  filterPicksByMembership,
  getActiveManualPicks,
  getCompletedManualPicks,
  loadAvailableAtlasPicks,
  normalizeBankrollConfig,
  normalizeManualTracking,
  saveManualTracking,
  type BankrollConfig,
  type MembershipContext,
  type ManualTrackedPick,
} from "../app/lib/bankroll";

const now = "2026-07-14T00:00:00.000Z";

const baseConfig: BankrollConfig = {
  initialBankroll: 200,
  currentBankroll: 200,
  recommendedUnit: 10,
  profile: "atlas_recommended",
  createdAt: now,
  updatedAt: now,
};

const emptyTracking = createManualTracking(now);
assert.equal(emptyTracking.trackingId, "manual-tracking-v1");
assert.equal(emptyTracking.picks.length, 0);
assert.equal(emptyTracking.activePicks.length, 0);
assert.equal(emptyTracking.completedPicks.length, 0);
assert.equal(emptyTracking.stats.totalPicks, 0);

const activePick: ManualTrackedPick = {
  id: "manual-pick-1",
  origin: "manual",
  linkedAtlasPickId: "premium-mlb-1",
  sport: "MLB",
  league: "MLB",
  eventId: null,
  homeTeam: "Dodgers",
  awayTeam: "Padres",
  eventDate: "2026-07-14",
  eventTime: "7:10 PM",
  market: "Moneyline",
  selection: "Dodgers ML",
  odds: -120,
  riskAmount: 10,
  riskPercentage: 5,
  status: "pending",
  result: null,
  profit: 0,
  createdAt: now,
  updatedAt: now,
  completedAt: null,
  notes: "",
  source: "manual",
  timeline: [],
};
const completedPick: ManualTrackedPick = {
  ...activePick,
  id: "manual-pick-2",
  status: "won",
  result: "won",
  profit: 8.33,
  completedAt: "2026-07-14T03:00:00.000Z",
};

assert.equal(getActiveManualPicks([activePick, completedPick]).length, 1);
assert.equal(getCompletedManualPicks([activePick, completedPick]).length, 1);

const normalizedTracking = normalizeManualTracking({
  ...emptyTracking,
  picks: [activePick, completedPick],
  activePicks: [],
  completedPicks: [],
  stats: emptyTracking.stats,
  manualFinancialState: emptyTracking.manualFinancialState,
  manualStats: emptyTracking.manualStats,
  manualTimeline: [],
});
assert.equal(normalizedTracking.stats.totalPicks, 2);
assert.equal(normalizedTracking.stats.activeCount, 1);
assert.equal(normalizedTracking.stats.completedCount, 1);
assert.equal(normalizedTracking.picks.every((pick) => pick.origin === "manual" && pick.source === "manual"), true);

const normalizedConfig = normalizeBankrollConfig(baseConfig);
assert.equal(normalizedConfig.manualTracking?.trackingId, "manual-tracking-v1");
assert.equal(normalizedConfig.manualTracking?.stats.totalPicks, 0);
assert.equal(normalizedConfig.atlasPlanCollection?.plans.length, 1);

const savedConfig = saveManualTracking(normalizedConfig, normalizedTracking);
assert.equal(savedConfig.manualTracking?.stats.totalPicks, 2);
assert.equal(savedConfig.atlasPlanCollection?.plans.length, normalizedConfig.atlasPlanCollection?.plans.length);
assert.equal(savedConfig.currentBankroll, normalizedConfig.currentBankroll);

const freeMembership: MembershipContext = {
  package: "free",
  selectedSport: null,
  availableSports: ["MLB", "NBA", "NFL", "NHL"],
};
const freePicks = filterPicksByMembership(freeMembership, now);
assert.equal(freePicks.length, 12);
assert.equal(freePicks.every((pick) => pick.source === "signals"), true);

const exclusiveMembership: MembershipContext = {
  package: "exclusive",
  selectedSport: null,
  availableSports: ["MLB", "NBA", "NFL", "NHL"],
};
const exclusivePicks = filterPicksByMembership(exclusiveMembership, now);
assert.equal(exclusivePicks.length, 12);
assert.equal(exclusivePicks.every((pick) => pick.source === "signals" && pick.rank <= 3), true);

const premiumMembership: MembershipContext = {
  package: "premium",
  selectedSport: "MLB",
  availableSports: ["MLB"],
};
const premiumPicks = filterPicksByMembership(premiumMembership, now);
assert.equal(premiumPicks.length, 5);
assert.equal(premiumPicks.every((pick) => pick.source === "top5" && pick.sport === "MLB"), true);

const unlimitedMembership: MembershipContext = {
  package: "unlimited",
  selectedSport: null,
  availableSports: ["MLB", "NBA", "NFL", "NHL"],
};
const unlimitedPicks = filterPicksByMembership(unlimitedMembership, now);
assert.equal(unlimitedPicks.length, 20);
assert.equal(unlimitedPicks.every((pick) => pick.source === "top5" && pick.rank <= 5), true);

const configWithMembership = normalizeBankrollConfig({
  ...baseConfig,
  membership: premiumMembership,
});
const availableAtlasPicks = loadAvailableAtlasPicks(configWithMembership, now);
assert.equal(availableAtlasPicks.length, 5);

const trackedCollection = createTrackedPick(
  createManualTracking(now, 500),
  availableAtlasPicks[0],
  { atlasPickId: availableAtlasPicks[0].id, riskAmount: "$25", notes: "Atlas tracking note." },
  500,
  now,
);
assert.equal(trackedCollection.picks.length, 1);
assert.equal(trackedCollection.activePicks.length, 1);
assert.equal(trackedCollection.picks[0].linkedAtlasPickId, availableAtlasPicks[0].id);
assert.equal(trackedCollection.picks[0].selection, availableAtlasPicks[0].selection);
assert.equal(trackedCollection.picks[0].market, availableAtlasPicks[0].market);
assert.equal(trackedCollection.picks[0].odds, availableAtlasPicks[0].odds);
assert.equal(trackedCollection.picks[0].riskAmount, 25);
assert.equal(trackedCollection.picks[0].riskPercentage, 5);
assert.equal(trackedCollection.picks[0].timeline.map((event) => event.message).join(" → "), "Manual Pick Created → Tracking Started");

const persistedTrackedConfig = normalizeBankrollConfig(saveManualTracking(configWithMembership, trackedCollection));
assert.equal(persistedTrackedConfig.manualTracking?.picks[0].linkedAtlasPickId, availableAtlasPicks[0].id);
assert.equal(persistedTrackedConfig.manualTracking?.activePicks.length, 1);

console.log("Manual Tracking engine validation OK");
