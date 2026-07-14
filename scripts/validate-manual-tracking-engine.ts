import assert from "node:assert/strict";
import {
  createManualTracking,
  getActiveManualPicks,
  getCompletedManualPicks,
  normalizeBankrollConfig,
  normalizeManualTracking,
  saveManualTracking,
  type BankrollConfig,
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
  stats: { totalPicks: 0, activeCount: 0, completedCount: 0 },
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

console.log("Manual Tracking engine validation OK");
