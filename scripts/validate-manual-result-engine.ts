import assert from "node:assert/strict";
import {
  createManualPick,
  createManualTracking,
  createTrackedPick,
  filterPicksByMembership,
  processManualResult,
  syncManualTrackingWithAtlas,
  type AtlasTrackingPickOption,
  type BankrollConfig,
  type ManualPickInput,
} from "../app/lib/bankroll";
import { validationAtlasSources } from "./bankroll-validation-sources";

const now = "2026-07-14T00:00:00.000Z";
const settledAt = "2026-07-14T03:00:00.000Z";
const baseMembership = {
  package: "premium" as const,
  selectedSport: "MLB" as const,
  availableSports: ["MLB" as const],
};

const baseConfig: BankrollConfig = {
  initialBankroll: 500,
  currentBankroll: 500,
  recommendedUnit: 25,
  profile: "atlas_recommended",
  membership: baseMembership,
  createdAt: now,
  updatedAt: now,
};

const atlasPicks = filterPicksByMembership(baseMembership, now, validationAtlasSources);
const atlasPick = atlasPicks[0];

function withStatus(pick: AtlasTrackingPickOption, status: AtlasTrackingPickOption["status"], completedAt: string | null = null): AtlasTrackingPickOption {
  return {
    ...pick,
    status,
    completedAt,
  };
}

function configWithTrackedPick(pick: AtlasTrackingPickOption = atlasPick, riskAmount = "$50"): BankrollConfig {
  return {
    ...baseConfig,
    manualTracking: createTrackedPick(
      createManualTracking(now, 500),
      pick,
      { atlasPickId: pick.id, riskAmount, notes: "Tracking Atlas pick." },
      500,
      now,
    ),
  };
}

const startedConfig = syncManualTrackingWithAtlas(configWithTrackedPick(), [withStatus(atlasPick, "started")], settledAt);
assert.equal(startedConfig.currentBankroll, 500);
assert.equal(startedConfig.manualTracking?.picks[0].status, "started");
assert.equal(startedConfig.manualTracking?.picks[0].locked, true);
assert.equal(startedConfig.manualTracking?.manualFinancialState.currentBankroll, 500);
assert.equal(startedConfig.manualTracking?.picks[0].timeline.some((event) => event.message === "Event Started"), true);

const wonConfig = syncManualTrackingWithAtlas(configWithTrackedPick(), [withStatus(atlasPick, "won", settledAt)], settledAt);
assert.equal(wonConfig.currentBankroll, 500);
assert.equal(wonConfig.manualTracking?.manualFinancialState.currentBankroll, 537.04);
assert.equal(wonConfig.manualTracking?.manualStats.profit, 37.04);
assert.equal(wonConfig.manualTracking?.manualStats.roi, 7.41);
assert.equal(wonConfig.manualTracking?.manualStats.wins, 1);
assert.equal(wonConfig.manualTracking?.manualStats.winRate, 100);
assert.equal(wonConfig.manualTracking?.activePicks.length, 0);
assert.equal(wonConfig.manualTracking?.completedPicks.length, 1);
assert.equal(wonConfig.manualTracking?.completedPicks[0].result, "won");
assert.equal(wonConfig.manualTracking?.completedPicks[0].resultSyncKey, `manual-pick-20260714000000000:${atlasPick.id}:won:${settledAt}`);
assert.equal(wonConfig.manualTracking?.completedPicks[0].timeline.some((event) => event.message === "Result Synced from Atlas"), true);
assert.equal(wonConfig.manualTracking?.manualTimeline.some((event) => event.message === "Manual Bankroll Updated"), true);

const idempotent = syncManualTrackingWithAtlas(wonConfig, [withStatus(atlasPick, "won", settledAt)], "2026-07-14T04:00:00.000Z");
assert.equal(idempotent.manualTracking?.manualFinancialState.currentBankroll, 537.04);
assert.equal(idempotent.manualTracking?.completedPicks[0].completedAt, settledAt);
assert.equal(idempotent.manualTracking?.completedPicks[0].timeline.filter((event) => event.message === "Result Synced from Atlas").length, 1);

const lostConfig = syncManualTrackingWithAtlas(configWithTrackedPick(), [withStatus(atlasPick, "lost", settledAt)], settledAt);
assert.equal(lostConfig.currentBankroll, 500);
assert.equal(lostConfig.manualTracking?.manualFinancialState.currentBankroll, 450);
assert.equal(lostConfig.manualTracking?.manualStats.profit, -50);
assert.equal(lostConfig.manualTracking?.manualStats.roi, -10);
assert.equal(lostConfig.manualTracking?.manualStats.losses, 1);

const pushConfig = syncManualTrackingWithAtlas(configWithTrackedPick(), [withStatus(atlasPick, "push", settledAt)], settledAt);
assert.equal(pushConfig.currentBankroll, 500);
assert.equal(pushConfig.manualTracking?.manualFinancialState.currentBankroll, 500);
assert.equal(pushConfig.manualTracking?.manualStats.pushes, 1);

const cancelledConfig = syncManualTrackingWithAtlas(configWithTrackedPick(), [withStatus(atlasPick, "cancelled", settledAt)], settledAt);
assert.equal(cancelledConfig.currentBankroll, 500);
assert.equal(cancelledConfig.manualTracking?.manualFinancialState.currentBankroll, 500);
assert.equal(cancelledConfig.manualTracking?.manualStats.cancelled, 1);

const invalidConfig = processManualResult(configWithTrackedPick(), "won", {
  pickId: "manual-pick-20260714000000000",
  settledAt,
  availableAtlasPicks: [],
});
assert.equal(invalidConfig.manualTracking?.manualFinancialState.currentBankroll, 500);
assert.equal(invalidConfig.manualTracking?.picks[0].trackingState, "linked_pick_invalid");
assert.equal(invalidConfig.manualTracking?.picks[0].result, null);

const manipulatedConfig = configWithTrackedPick();
const manipulatedPick = {
  ...manipulatedConfig.manualTracking!.picks[0],
  selection: "Manipulated Selection",
  market: "Manipulated Market",
  sport: "NBA" as const,
  odds: 999,
};
const resyncedConfig = syncManualTrackingWithAtlas({
  ...manipulatedConfig,
  manualTracking: {
    ...manipulatedConfig.manualTracking!,
    picks: [manipulatedPick],
  },
}, [atlasPick], settledAt);
assert.equal(resyncedConfig.manualTracking?.picks[0].selection, atlasPick.selection);
assert.equal(resyncedConfig.manualTracking?.picks[0].market, atlasPick.market);
assert.equal(resyncedConfig.manualTracking?.picks[0].sport, atlasPick.sport);
assert.equal(resyncedConfig.manualTracking?.picks[0].trackedOdds, atlasPick.odds);
assert.equal(resyncedConfig.manualTracking?.picks[0].timeline.some((event) => event.message === "Linked Atlas Pick Data Resynced"), true);

const removedConfig = syncManualTrackingWithAtlas(configWithTrackedPick(), [withStatus(atlasPick, "removed")], settledAt);
assert.equal(removedConfig.manualTracking?.manualFinancialState.currentBankroll, 500);
assert.equal(removedConfig.manualTracking?.picks[0].linkedAtlasPickId, atlasPick.id);
assert.equal(removedConfig.manualTracking?.picks[0].result, null);

const legacyInput: ManualPickInput = {
  sport: "MLB",
  league: "MLB",
  eventId: null,
  homeTeam: "Dodgers",
  awayTeam: "Padres",
  eventDate: "2026-07-14",
  eventTime: "7:10 PM",
  market: "Moneyline",
  selection: "Dodgers ML",
  odds: "-110",
  riskAmount: "50",
  notes: "",
};
const legacyConfig = {
  ...baseConfig,
  manualTracking: createManualPick(createManualTracking(now, 500), legacyInput, 500, now),
};
const syncedLegacy = syncManualTrackingWithAtlas(legacyConfig, [atlasPick], settledAt);
assert.equal(syncedLegacy.manualTracking?.picks[0].linkedAtlasPickId, null);
assert.equal(syncedLegacy.manualTracking?.picks[0].trackingState, "legacy_unlinked");
assert.equal(syncedLegacy.manualTracking?.picks[0].result, null);
assert.equal(syncedLegacy.manualTracking?.manualFinancialState.currentBankroll, 500);

console.log("Manual Result engine validation OK");
