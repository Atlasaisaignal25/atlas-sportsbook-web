import assert from "node:assert/strict";
import {
  americanOddsToImpliedProbability,
  buildConsensusMovementFromSnapshots,
  buildMarketMovementFeatureMap,
  collectOutcomeMarketFeatures,
  isQualifiedMlbMarketContext,
  marketMovementFeatureKey,
  marketOutcomeFeatureKey,
  noVigTwoWayProbabilities,
} from "../app/lib/mlb-engine/marketFeatures";
import type { OddsSnapshot } from "../types/oddsMovement";

const now = new Date();
const previousAt = new Date(now.getTime() - 20 * 60000).toISOString();
const currentAt = now.toISOString();

function closeTo(actual: number | null, expected: number, delta = 0.0001) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(Number(actual) - expected) <= delta, `${actual} was not close to ${expected}`);
}

closeTo(americanOddsToImpliedProbability(-110), 0.5238095);
closeTo(americanOddsToImpliedProbability(120), 0.4545454);
assert.equal(americanOddsToImpliedProbability(0), null);

const fairMinus110 = noVigTwoWayProbabilities(-110, -110);
closeTo(fairMinus110?.first ?? null, 0.5);
closeTo(fairMinus110?.second ?? null, 0.5);
assert.ok((fairMinus110?.hold ?? 0) > 0);

const bookmakers = [
  {
    key: "dk",
    title: "DraftKings",
    last_update: new Date(now.getTime() - 10 * 60000).toISOString(),
    markets: [
      {
        key: "h2h",
        outcomes: [
          { name: "New York Mets", price: -125 },
          { name: "Atlanta Braves", price: 105 },
        ],
      },
      {
        key: "totals",
        outcomes: [
          { name: "Over", point: 8.5, price: -110 },
          { name: "Under", point: 8.5, price: -110 },
        ],
      },
    ],
  },
  {
    key: "fd",
    title: "FanDuel",
    last_update: new Date(now.getTime() - 15 * 60000).toISOString(),
    markets: [
      {
        key: "h2h",
        outcomes: [
          { name: "New York Mets", price: -120 },
          { name: "Atlanta Braves", price: 100 },
        ],
      },
      {
        key: "totals",
        outcomes: [
          { name: "Over", point: 8.5, price: -105 },
          { name: "Under", point: 8.5, price: -115 },
        ],
      },
    ],
  },
];

const h2hFeatures = collectOutcomeMarketFeatures(bookmakers, "h2h", now);
const metsKey = marketOutcomeFeatureKey("h2h", "New York Mets");
const metsFeatures = h2hFeatures.get(metsKey);
assert.equal(metsFeatures?.bookCount, 2);
assert.equal(metsFeatures?.isStale, false);
assert.equal(metsFeatures?.bestPrice, -120);
assert.equal(metsFeatures?.worstPrice, -125);
assert.equal(isQualifiedMlbMarketContext(metsFeatures), true);
assert.ok(Number(metsFeatures?.noVigProbabilityPct) > 52);

const totalFeatures = collectOutcomeMarketFeatures(bookmakers, "totals", now);
const overKey = marketOutcomeFeatureKey("totals", "Over", 8.5);
assert.equal(totalFeatures.get(overKey)?.bookCount, 2);
assert.equal(totalFeatures.get(overKey)?.noVigProbabilityPct, 49.5);

const staleFeatures = collectOutcomeMarketFeatures(
  [
    {
      key: "old",
      title: "OldBook",
      last_update: new Date(now.getTime() - 8 * 60 * 60000).toISOString(),
      markets: [{ key: "h2h", outcomes: [{ name: "New York Mets", price: -125 }] }],
    },
    {
      key: "old-2",
      title: "OldBook 2",
      last_update: new Date(now.getTime() - 7.9 * 60 * 60000).toISOString(),
      markets: [{ key: "h2h", outcomes: [{ name: "New York Mets", price: -122 }] }],
    },
  ],
  "h2h",
  now,
);
assert.equal(staleFeatures.get(metsKey)?.isStale, true);
assert.equal(isQualifiedMlbMarketContext(staleFeatures.get(metsKey)), false);

const missingTimestampFeatures = collectOutcomeMarketFeatures(bookmakers.map(({ last_update: _lastUpdate, ...book }) => book), "h2h", now);
assert.equal(missingTimestampFeatures.get(metsKey)?.isStale, false);

function snapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    sport: "MLB",
    eventId: "game-1",
    commenceTime: "2026-07-10T23:10:00Z",
    homeTeam: "New York Mets",
    awayTeam: "Atlanta Braves",
    bookmaker: "DraftKings",
    marketKey: "h2h",
    outcomeName: "New York Mets",
    price: -120,
    capturedAt: previousAt,
    ...overrides,
  };
}

assert.equal(buildConsensusMovementFromSnapshots([snapshot()]).length, 0);
assert.equal(buildConsensusMovementFromSnapshots([snapshot(), snapshot({ capturedAt: currentAt })]).length, 0);

const consensus = buildConsensusMovementFromSnapshots(
  [
    snapshot({ bookmaker: "DraftKings", price: -120, capturedAt: previousAt }),
    snapshot({ bookmaker: "DraftKings", price: -145, capturedAt: currentAt }),
    snapshot({ bookmaker: "FanDuel", price: -118, capturedAt: previousAt }),
    snapshot({ bookmaker: "FanDuel", price: -140, capturedAt: currentAt }),
  ],
  new Map([["game-1", 2]]),
);
assert.equal(consensus.length, 1);
assert.equal(consensus[0]?.direction, "SHORTENING");
assert.equal(consensus[0]?.sportsbookCount, 2);

const featureMap = buildMarketMovementFeatureMap(consensus);
const movementKey = marketMovementFeatureKey("game-1", "h2h", "New York Mets");
assert.equal(featureMap.get(movementKey)?.eventId, "game-1");

const conflictingConsensus = buildConsensusMovementFromSnapshots(
  [
    snapshot({ bookmaker: "DraftKings", price: -120, capturedAt: previousAt }),
    snapshot({ bookmaker: "DraftKings", price: -145, capturedAt: currentAt }),
    snapshot({ bookmaker: "FanDuel", price: -118, capturedAt: previousAt }),
    snapshot({ bookmaker: "FanDuel", price: 110, capturedAt: currentAt }),
  ],
  new Map([["game-1", 2]]),
);
assert.equal(conflictingConsensus.length, 2);

const qualifiedContexts = [metsFeatures, totalFeatures.get(overKey)].filter(isQualifiedMlbMarketContext);
assert.equal(qualifiedContexts.length, 2);
assert.equal([metsFeatures].filter(isQualifiedMlbMarketContext).length, 1);

console.log("MLB engine validation passed");
