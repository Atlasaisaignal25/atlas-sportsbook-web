import assert from "node:assert/strict";
import {
  calculateCurrentConfidence,
  createDynamicValidationInput,
  createNeutralValidationResult,
  createValidationResult,
  DYNAMIC_VALIDATION_MODULES,
  evaluateLineMovementValidation,
  getDynamicValidationModule,
  runDynamicValidation,
  UNIVERSAL_LINE_MOVEMENT_SPORTS,
} from "../app/lib/dynamic-validation";
import { normalizeAtlasProductSignal } from "../app/lib/product-normalization";

const now = "2026-07-17T12:00:00.000Z";

const signals = [
  normalizeAtlasProductSignal(
    {
      sport: "MLB",
      game_id: "mlb-1",
      away_team: "Yankees",
      home_team: "Blue Jays",
      pick: "Yankees ML",
      market: "Moneyline",
      odds: -115,
      confidence: 63,
      rank: 3,
      start_time: "2026-07-17T19:05:00.000Z",
      status: "INTERNAL_CANDIDATE",
    },
    { sport: "MLB", product: "dynamic_candidate_pool", index: 0 },
  ),
  normalizeAtlasProductSignal(
    {
      sport: "SOCCER",
      game_id: "soccer-1",
      away_team: "Away FC",
      home_team: "Home FC",
      pick: "Under 2.5",
      market: "Total",
      odds: -109,
      confidence: 72,
      rank: 1,
      start_time: "2026-07-17T20:30:00.000Z",
      status: "PENDING",
    },
    { sport: "SOCCER", product: "dynamic_candidate_pool", index: 1 },
  ),
  normalizeAtlasProductSignal(
    {
      sport: "NBA",
      game_id: "nba-1",
      away_team: "Away",
      home_team: "Home",
      pick: "Home -4.5",
      market: "Spread",
      odds: -110,
      confidence: 67,
      rank: 2,
      start_time: "2026-07-17T21:00:00.000Z",
      status: "ENGINE_READY",
    },
    { sport: "NBA", product: "dynamic_candidate_pool", index: 2 },
  ),
];

const run = runDynamicValidation(
  [
    createDynamicValidationInput(signals[0], [
      createValidationResult({
        moduleId: "line_movement",
        direction: "POSITIVE",
        reason: "Foundation validation sample: movement supports the signal.",
        timestamp: now,
        weight: 5,
      }),
    ]),
    createDynamicValidationInput(signals[1], [
      createValidationResult({
        moduleId: "odds_movement",
        direction: "NEGATIVE",
        reason: "Foundation validation sample: movement against the signal.",
        timestamp: now,
        weight: 8,
      }),
    ]),
    createDynamicValidationInput(signals[2], [
      createNeutralValidationResult("weather", now),
    ]),
  ],
  now,
);

assert.equal(getDynamicValidationModule("line_movement")?.enabled, true);
assert.deepEqual(UNIVERSAL_LINE_MOVEMENT_SPORTS, ["MLB", "SOCCER", "NBA", "NFL", "NHL", "NCAAB", "NCAAF"]);
assert.equal(DYNAMIC_VALIDATION_MODULES.filter((module) => module.enabled).map((module) => module.id).join(","), "line_movement");
assert.equal(DYNAMIC_VALIDATION_MODULES.length >= 8, true);

assert.equal(calculateCurrentConfidence(63, 5), 68);
assert.equal(calculateCurrentConfidence(72, -8), 64);

assert.equal(run.signals.length, 3);
assert.equal(run.signals[0].signalId, signals[0].signalId);
assert.equal(run.signals[0].baseConfidence, 63);
assert.equal(run.signals[0].dynamicScore, 5);
assert.equal(run.signals[0].currentConfidence, 68);
assert.equal(run.signals[0].dynamicRank, 1);
assert.equal(run.topSignal?.signalId, signals[0].signalId);

assert.equal(run.signals[1].signalId, signals[2].signalId);
assert.equal(run.signals[1].dynamicScore, 0);
assert.equal(run.signals[1].currentConfidence, 67);

assert.equal(run.signals[2].signalId, signals[1].signalId);
assert.equal(run.signals[2].dynamicScore, -8);
assert.equal(run.signals[2].currentConfidence, 64);

assert.equal(run.premium.map((signal) => signal.signalId).join(","), `${signals[2].signalId},${signals[1].signalId}`);
assert.equal(run.unlimited.length, 3);

for (const signal of run.signals) {
  assert.equal(signal.status, "PENDING");
  assert.equal(signal.timeline.some((event) => event.type === "generated"), true);
  assert.equal(signal.timeline.some((event) => event.type === "ranking_updated"), true);
}

const lineMovementSignals = [
  normalizeAtlasProductSignal(
    {
      sport: "SOCCER",
      game_id: "soccer-line-1",
      away_team: "Away FC",
      home_team: "Home FC",
      pick: "Under 2.5",
      selection: "Under 2.5",
      market: "Total",
      line: 2.5,
      odds: -110,
      confidence: 70,
      rank: 1,
      start_time: "2026-07-17T20:30:00.000Z",
    },
    { sport: "SOCCER", product: "dynamic_candidate_pool", index: 0 },
  ),
  normalizeAtlasProductSignal(
    {
      sport: "NBA",
      game_id: "nba-line-1",
      away_team: "Away",
      home_team: "Home",
      pick: "Home -4.5",
      selection: "Home -4.5",
      market: "Spread",
      line: -4.5,
      odds: -110,
      confidence: 70,
      rank: 2,
      start_time: "2026-07-17T21:00:00.000Z",
    },
    { sport: "NBA", product: "dynamic_candidate_pool", index: 1 },
  ),
  normalizeAtlasProductSignal(
    {
      sport: "MLB",
      game_id: "mlb-line-1",
      away_team: "Away",
      home_team: "Home",
      pick: "Home ML",
      market: "Moneyline",
      odds: -110,
      confidence: 69,
      rank: 3,
      start_time: "2026-07-17T22:00:00.000Z",
    },
    { sport: "MLB", product: "dynamic_candidate_pool", index: 2 },
  ),
];

const positiveLineMovement = evaluateLineMovementValidation({
  signal: lineMovementSignals[0],
  movement: { openingLine: 2.5, currentLine: 3 },
  timestamp: now,
});
const negativeLineMovement = evaluateLineMovementValidation({
  signal: lineMovementSignals[1],
  movement: { openingLine: -4.5, currentLine: -5.5 },
  timestamp: now,
});
const neutralLineMovement = evaluateLineMovementValidation({
  signal: lineMovementSignals[2],
  movement: null,
  timestamp: now,
});

assert.equal(positiveLineMovement.direction, "POSITIVE");
assert.equal(positiveLineMovement.appliedScore, 2);
assert.equal(negativeLineMovement.direction, "NEGATIVE");
assert.equal(negativeLineMovement.appliedScore, -2);
assert.equal(neutralLineMovement.direction, "NEUTRAL");
assert.equal(neutralLineMovement.appliedScore, 0);

const lineMovementRun = runDynamicValidation(
  [
    createDynamicValidationInput(lineMovementSignals[0], [positiveLineMovement]),
    createDynamicValidationInput(lineMovementSignals[1], [negativeLineMovement]),
    createDynamicValidationInput(lineMovementSignals[2], [neutralLineMovement]),
  ],
  now,
);

assert.equal(lineMovementRun.signals[0].signalId, lineMovementSignals[0].signalId);
assert.equal(lineMovementRun.signals[0].dynamicScore, 2);
assert.equal(lineMovementRun.signals[0].currentConfidence, 72);
assert.equal(lineMovementRun.signals[0].timeline.some((event) => event.moduleId === "line_movement" && event.direction === "POSITIVE"), true);
assert.equal(lineMovementRun.signals[2].dynamicScore, -2);
assert.equal(lineMovementRun.signals[2].currentConfidence, 68);
assert.equal(lineMovementRun.topSignal?.signalId, lineMovementSignals[0].signalId);

assert.equal(Object.isFrozen(run), true);
assert.equal(Object.isFrozen(run.signals), true);
assert.equal(Object.isFrozen(run.signals[0]), true);

console.log("Dynamic Validation Engine line movement validation passed.");
