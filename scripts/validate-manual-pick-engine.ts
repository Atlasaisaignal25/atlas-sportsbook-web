import assert from "node:assert/strict";
import {
  createManualPick,
  createManualTracking,
  deleteManualPick,
  normalizeBankrollConfig,
  saveManualTracking,
  validateManualPick,
  type BankrollConfig,
  type ManualPickInput,
} from "../app/lib/bankroll";

const now = "2026-07-14T00:00:00.000Z";

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
  odds: "-120",
  riskAmount: "$25",
  notes: "Manual tracking note.",
};

const validation = validateManualPick(baseInput, 500);
assert.equal(validation.valid, true);

const tracking = createManualTracking(now);
const withMlbPick = createManualPick(tracking, baseInput, 500, now);
assert.equal(withMlbPick.picks.length, 1);
assert.equal(withMlbPick.activePicks.length, 1);
assert.equal(withMlbPick.completedPicks.length, 0);
assert.equal(withMlbPick.stats.activeCount, 1);
assert.equal(withMlbPick.picks[0].origin, "manual");
assert.equal(withMlbPick.picks[0].source, "manual");
assert.equal(withMlbPick.picks[0].status, "pending");
assert.equal(withMlbPick.picks[0].riskAmount, 25);
assert.equal(withMlbPick.picks[0].riskPercentage, 5);
assert.equal(withMlbPick.picks[0].timeline.length, 1);
assert.equal(withMlbPick.picks[0].timeline[0].message, "Manual Pick Created");

const withNbaPick = createManualPick(
  withMlbPick,
  {
    ...baseInput,
    sport: "NBA",
    league: "NBA",
    homeTeam: "Celtics",
    awayTeam: "Knicks",
    selection: "Celtics ML",
    odds: "1.85",
    riskAmount: "50",
  },
  500,
  "2026-07-14T01:00:00.000Z",
);
assert.equal(withNbaPick.picks.length, 2);
assert.equal(withNbaPick.stats.activeCount, 2);
assert.equal(withNbaPick.picks[1].odds, 1.85);
assert.equal(withNbaPick.picks[1].riskPercentage, 10);

const afterDelete = deleteManualPick(withNbaPick, withMlbPick.picks[0].id, "2026-07-14T02:00:00.000Z");
assert.equal(afterDelete.picks.length, 1);
assert.equal(afterDelete.activePicks.length, 1);
assert.equal(afterDelete.picks[0].sport, "NBA");

const normalizedConfig = normalizeBankrollConfig(baseConfig);
const configWithTracking = normalizeBankrollConfig(saveManualTracking(normalizedConfig, withNbaPick));
assert.equal(configWithTracking.manualTracking?.picks.length, 2);
assert.equal(configWithTracking.manualTracking?.stats.activeCount, 2);
assert.equal(configWithTracking.atlasPlanCollection?.plans.length, normalizedConfig.atlasPlanCollection?.plans.length);
assert.equal(configWithTracking.currentBankroll, normalizedConfig.currentBankroll);

assert.equal(validateManualPick({ ...baseInput, riskAmount: "501" }, 500).valid, false);
assert.equal(validateManualPick({ ...baseInput, selection: "" }, 500).valid, false);
assert.equal(validateManualPick({ ...baseInput, market: "" }, 500).valid, false);
assert.equal(validateManualPick({ ...baseInput, odds: "abc" }, 500).valid, false);
assert.equal(validateManualPick({ ...baseInput, sport: null }, 500).valid, false);

console.log("Manual Pick engine validation OK");
