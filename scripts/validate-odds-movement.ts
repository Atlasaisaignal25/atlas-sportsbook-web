import assert from "node:assert/strict";
import { calculateOddsMovement } from "../lib/market-impact/odds/calculateOddsMovement";
import { buildConsensusMovement } from "../lib/market-impact/odds/buildConsensusMovement";
import { mergeEvents } from "../lib/market-impact/mergeEvents";
import { atlasEventFromConsensusMovement } from "../lib/market-impact/providers/oddsProvider";
import type { AtlasEvent } from "../types/atlasEvent";
import type { OddsMovement, OddsSnapshot } from "../types/oddsMovement";

const previousAt = "2026-07-09T18:00:00Z";
const currentAt = "2026-07-09T18:18:00Z";

function snapshot(overrides: Partial<OddsSnapshot> = {}): OddsSnapshot {
  return {
    sport: "MLB",
    eventId: "game-1",
    commenceTime: "2026-07-09T23:10:00Z",
    homeTeam: "New York Mets",
    awayTeam: "Atlanta Braves",
    bookmaker: "DraftKings",
    marketKey: "h2h",
    outcomeName: "New York Mets",
    price: -125,
    capturedAt: previousAt,
    ...overrides,
  };
}

function movement(overrides: Partial<OddsMovement> = {}): OddsMovement {
  return {
    id: "move-1",
    sport: "MLB",
    eventId: "game-1",
    homeTeam: "New York Mets",
    awayTeam: "Atlanta Braves",
    commenceTime: "2026-07-09T23:10:00Z",
    bookmaker: "DraftKings",
    marketKey: "h2h",
    outcomeName: "New York Mets",
    previousPrice: -125,
    currentPrice: -145,
    priceDelta: -20,
    impliedProbabilityDelta: 0.036,
    direction: "SHORTENING",
    movementStartedAt: previousAt,
    detectedAt: currentAt,
    elapsedMinutes: 18,
    magnitudeScore: 50,
    impact: "MEDIUM",
    ...overrides,
  };
}

assert.equal(calculateOddsMovement(null, snapshot({ capturedAt: currentAt, price: -145 })), null);
assert.equal(calculateOddsMovement(snapshot(), snapshot({ capturedAt: currentAt })), null);

const moneylineFavorite = calculateOddsMovement(snapshot(), snapshot({ price: -145, capturedAt: currentAt }));
assert.equal(moneylineFavorite?.direction, "SHORTENING");
assert.equal(moneylineFavorite?.impact, "MEDIUM");

const moneylineCrossZero = calculateOddsMovement(
  snapshot({ price: 120 }),
  snapshot({ price: -105, capturedAt: currentAt }),
);
assert.equal(moneylineCrossZero?.direction, "SHORTENING");

const spreadMove = calculateOddsMovement(
  snapshot({ marketKey: "spreads", point: -1.5, price: -110 }),
  snapshot({ marketKey: "spreads", point: -2, price: -110, capturedAt: currentAt }),
);
assert.equal(spreadMove?.direction, "DOWN");
assert.equal(spreadMove?.impact, "MEDIUM");

const totalMove = calculateOddsMovement(
  snapshot({ marketKey: "totals", outcomeName: "Over", point: 8.5, price: -110 }),
  snapshot({ marketKey: "totals", outcomeName: "Over", point: 9, price: -110, capturedAt: currentAt }),
);
assert.equal(totalMove?.direction, "UP");

const juiceOnly = calculateOddsMovement(
  snapshot({ marketKey: "totals", outcomeName: "Under", point: 8.5, price: -105 }),
  snapshot({ marketKey: "totals", outcomeName: "Under", point: 8.5, price: -122, capturedAt: currentAt }),
);
assert.equal(juiceOnly?.direction, "SHORTENING");

const singleConsensus = buildConsensusMovement({
  movements: [movement()],
  monitoredSportsbookCountByEvent: new Map([["game-1", 4]]),
  now: new Date(currentAt),
});
assert.equal(singleConsensus[0]?.impact, "LOW");

const fourBookConsensus = buildConsensusMovement({
  movements: [
    movement({ bookmaker: "DraftKings" }),
    movement({ id: "move-2", bookmaker: "FanDuel" }),
    movement({ id: "move-3", bookmaker: "BetMGM" }),
    movement({ id: "move-4", bookmaker: "Caesars" }),
  ],
  monitoredSportsbookCountByEvent: new Map([["game-1", 4]]),
  now: new Date(currentAt),
});
assert.equal(fourBookConsensus[0]?.impact, "HIGH");

const conflicting = buildConsensusMovement({
  movements: [
    movement({ bookmaker: "DraftKings", direction: "SHORTENING" }),
    movement({ id: "move-2", bookmaker: "FanDuel", direction: "DRIFTING" }),
  ],
  monitoredSportsbookCountByEvent: new Map([["game-1", 2]]),
  now: new Date(currentAt),
});
assert.equal(conflicting.length, 2);

const oddsEvent = atlasEventFromConsensusMovement(fourBookConsensus[0]!);
assert.equal(oddsEvent.marketMovement?.sportsbookCount, 4);

const newsEvent: AtlasEvent = {
  ...oddsEvent,
  id: "news-1",
  title: "New York Mets key player scratched",
  category: "INJURY",
  impact: "HIGH",
  team: "New York Mets",
  marketMovement: undefined,
  sources: [{ name: "ESPN", url: "https://espn.com", publishedAt: currentAt, reliability: 98, provider: "GNews" }],
  timeline: [{ timestamp: currentAt, provider: "GNews", eventType: "INJURY", summary: "Player scratched." }],
};
assert.equal(mergeEvents([newsEvent, oddsEvent]).length, 1);

const unrelatedNews: AtlasEvent = { ...newsEvent, id: "news-2", team: "Boston Red Sox", title: "Boston Red Sox injury" };
assert.equal(mergeEvents([unrelatedNews, oddsEvent]).length, 2);

const duplicateSnapshots = [snapshot({ capturedAt: currentAt }), snapshot({ capturedAt: currentAt })];
assert.equal(new Set(duplicateSnapshots.map((item) => `${item.eventId}:${item.bookmaker}:${item.marketKey}:${item.outcomeName}:${item.price}`)).size, 1);

console.log("Odds movement validation passed");
