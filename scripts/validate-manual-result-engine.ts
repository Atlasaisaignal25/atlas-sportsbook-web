import assert from "node:assert/strict";
import {
  createManualPick,
  createManualTracking,
  processManualResult,
  type BankrollConfig,
  type ManualPickInput,
} from "../app/lib/bankroll";

const now = "2026-07-14T00:00:00.000Z";
const settledAt = "2026-07-14T03:00:00.000Z";

const baseConfig: BankrollConfig = {
  initialBankroll: 500,
  currentBankroll: 500,
  recommendedUnit: 25,
  profile: "atlas_recommended",
  createdAt: now,
  updatedAt: now,
};

const baseInput: ManualPickInput = {
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

function configWithManualPick(input: ManualPickInput = baseInput): BankrollConfig {
  const manualTracking = createManualPick(createManualTracking(now, 500), input, 500, now);

  return {
    ...baseConfig,
    manualTracking,
  };
}

const wonConfig = processManualResult(configWithManualPick(), "won", {
  pickId: "manual-pick-20260714000000000",
  settledAt,
});
assert.equal(wonConfig.currentBankroll, 500);
assert.equal(wonConfig.manualTracking?.manualFinancialState.currentBankroll, 545.45);
assert.equal(wonConfig.manualTracking?.manualStats.profit, 45.45);
assert.equal(wonConfig.manualTracking?.manualStats.roi, 9.09);
assert.equal(wonConfig.manualTracking?.manualStats.wins, 1);
assert.equal(wonConfig.manualTracking?.manualStats.winRate, 100);
assert.equal(wonConfig.manualTracking?.activePicks.length, 0);
assert.equal(wonConfig.manualTracking?.completedPicks.length, 1);
assert.equal(wonConfig.manualTracking?.completedPicks[0].result, "won");
assert.equal(wonConfig.manualTracking?.completedPicks[0].timeline.some((event) => event.message === "Result Registered"), true);
assert.equal(wonConfig.manualTracking?.manualTimeline.some((event) => event.message === "Manual Bankroll Updated"), true);

const lostConfig = processManualResult(configWithManualPick(), "lost", {
  pickId: "manual-pick-20260714000000000",
  settledAt,
});
assert.equal(lostConfig.currentBankroll, 500);
assert.equal(lostConfig.manualTracking?.manualFinancialState.currentBankroll, 450);
assert.equal(lostConfig.manualTracking?.manualStats.profit, -50);
assert.equal(lostConfig.manualTracking?.manualStats.roi, -10);
assert.equal(lostConfig.manualTracking?.manualStats.losses, 1);
assert.equal(lostConfig.manualTracking?.manualStats.winRate, 0);

const pushConfig = processManualResult(configWithManualPick(), "push", {
  pickId: "manual-pick-20260714000000000",
  settledAt,
});
assert.equal(pushConfig.currentBankroll, 500);
assert.equal(pushConfig.manualTracking?.manualFinancialState.currentBankroll, 500);
assert.equal(pushConfig.manualTracking?.manualStats.pushes, 1);

const cancelledConfig = processManualResult(configWithManualPick(), "cancelled", {
  pickId: "manual-pick-20260714000000000",
  settledAt,
});
assert.equal(cancelledConfig.currentBankroll, 500);
assert.equal(cancelledConfig.manualTracking?.manualFinancialState.currentBankroll, 500);
assert.equal(cancelledConfig.manualTracking?.manualStats.cancelled, 1);

const idempotent = processManualResult(wonConfig, "won", {
  pickId: "manual-pick-20260714000000000",
  settledAt: "2026-07-14T04:00:00.000Z",
});
assert.equal(idempotent.manualTracking?.manualFinancialState.currentBankroll, 545.45);
assert.equal(idempotent.manualTracking?.completedPicks[0].completedAt, settledAt);

console.log("Manual Result engine validation OK");
