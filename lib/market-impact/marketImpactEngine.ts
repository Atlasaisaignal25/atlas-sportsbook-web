import crypto from "crypto";
import { fetchCurrentMlbOdds, normalizeOddsSnapshots } from "@/lib/market-impact/providers/oddsProvider";
import { getLatestSnapshotsForSport, insertSnapshotsDeduped } from "@/lib/market-impact/odds/snapshotRepository";
import { MARKET_IMPACT_ENGINE_VERSION, MARKET_IMPACT_THRESHOLDS } from "@/lib/market-impact/marketImpactThresholds";
import { insertMarketImpactEventsDeduped } from "@/lib/market-impact/marketImpactEventsRepository";
import type { OddsSnapshot } from "@/types/oddsMovement";
import type {
  MarketImpactDirection,
  MarketImpactEvent,
  MarketImpactMarket,
  MarketImpactMovementType,
} from "@/types/marketImpactEvent";
import type { PulseImpact } from "@/types/marketImpact";

function marketLabel(marketKey: OddsSnapshot["marketKey"]): MarketImpactMarket {
  if (marketKey === "spreads") return "Spread";
  if (marketKey === "totals") return "Totals";
  return "Moneyline";
}

function formatOdds(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return value > 0 ? `+${value}` : `${value}`;
}

function formatLine(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function directionFromDelta(delta: number): MarketImpactDirection {
  if (delta > 0) return "UP";
  if (delta < 0) return "DOWN";
  return "NO_CHANGE";
}

function confidenceForSize(input: {
  market: MarketImpactMarket;
  movementType: MarketImpactMovementType;
  size: number;
}): PulseImpact {
  const thresholds =
    input.market === "Moneyline"
      ? MARKET_IMPACT_THRESHOLDS.moneyline
      : input.market === "Spread"
        ? MARKET_IMPACT_THRESHOLDS.spread
        : MARKET_IMPACT_THRESHOLDS.totals;

  if (input.movementType === "LINE_MOVEMENT" && input.market !== "Moneyline") {
    const lineThresholds = input.market === "Spread" ? MARKET_IMPACT_THRESHOLDS.spread : MARKET_IMPACT_THRESHOLDS.totals;
    if (input.size >= lineThresholds.highLineDelta) return "HIGH";
    if (input.size >= lineThresholds.mediumLineDelta) return "MEDIUM";
    return "LOW";
  }

  if (input.size >= thresholds.highOddsDelta) return "HIGH";
  if (input.size >= thresholds.mediumOddsDelta) return "MEDIUM";
  return "LOW";
}

function eventId(input: {
  current: OddsSnapshot;
  previous: OddsSnapshot;
  movementType: MarketImpactMovementType;
  oldLine: number | null;
  newLine: number | null;
  oldOdds: number | null;
  newOdds: number | null;
}) {
  return crypto
    .createHash("sha256")
    .update([
      MARKET_IMPACT_ENGINE_VERSION,
      input.current.sport,
      input.current.eventId,
      input.current.bookmaker,
      input.current.marketKey,
      input.current.outcomeName,
      input.movementType,
      input.oldLine ?? "",
      input.newLine ?? "",
      input.oldOdds ?? "",
      input.newOdds ?? "",
    ].join("|"))
    .digest("hex")
    .slice(0, 32);
}

function buildMarketImpactEvent(previous: OddsSnapshot | null, current: OddsSnapshot): MarketImpactEvent | null {
  if (!previous) return null;

  const market = marketLabel(current.marketKey);
  const oldLine = previous.point ?? null;
  const newLine = current.point ?? null;
  const oldOdds = previous.price ?? null;
  const newOdds = current.price ?? null;
  const lineDelta = oldLine !== null && newLine !== null ? newLine - oldLine : 0;
  const oddsDelta = oldOdds !== null && newOdds !== null ? newOdds - oldOdds : 0;
  const lineAbs = Math.abs(lineDelta);
  const oddsAbs = Math.abs(oddsDelta);

  let movementType: MarketImpactMovementType | null = null;
  let movementSize = 0;
  let direction: MarketImpactDirection = "NO_CHANGE";
  let why = "";
  let impact = "";

  if (current.marketKey === "h2h") {
    if (oddsAbs < MARKET_IMPACT_THRESHOLDS.moneyline.minOddsDelta) return null;
    movementType = "LINE_MOVEMENT";
    movementSize = oddsAbs;
    direction = directionFromDelta(oddsDelta);
    why = `Moneyline moved from ${formatOdds(oldOdds)} to ${formatOdds(newOdds)}.`;
    impact = "Significant market movement detected.";
  } else {
    const thresholds = current.marketKey === "spreads" ? MARKET_IMPACT_THRESHOLDS.spread : MARKET_IMPACT_THRESHOLDS.totals;

    if (lineAbs >= thresholds.minLineDelta) {
      movementType = "LINE_MOVEMENT";
      movementSize = lineAbs;
      direction = directionFromDelta(lineDelta);
      why = `${market} line moved from ${formatLine(oldLine)} to ${formatLine(newLine)}.`;
      impact = "Significant market line movement detected.";
    } else if (oddsAbs >= thresholds.minOddsDelta) {
      movementType = "ODDS_MOVEMENT";
      movementSize = oddsAbs;
      direction = directionFromDelta(oddsDelta);
      why = `Odds moved from ${formatOdds(oldOdds)} to ${formatOdds(newOdds)}.`;
      impact = "Market pricing changed significantly.";
    }
  }

  if (!movementType || direction === "NO_CHANGE") return null;

  const confidence = confidenceForSize({ market, movementType, size: movementSize });

  return {
    sport: "MLB",
    eventId: eventId({ current, previous, movementType, oldLine, newLine, oldOdds, newOdds }),
    homeTeam: current.homeTeam,
    awayTeam: current.awayTeam,
    market,
    selection: current.outcomeName,
    movementType,
    oldLine,
    newLine,
    oldOdds,
    newOdds,
    direction,
    movementSize,
    confidence,
    why,
    impact,
    publishedAt: current.capturedAt,
  };
}

export async function captureMarketImpactEvents(apiKey: string) {
  const capturedAt = new Date().toISOString();
  const { games, health } = await fetchCurrentMlbOdds(apiKey);
  const { snapshots } = normalizeOddsSnapshots(games, capturedAt);
  const previousSnapshots = await getLatestSnapshotsForSport("MLB");
  const events = snapshots
    .map((snapshot) => {
      const key = [snapshot.eventId, snapshot.bookmaker, snapshot.marketKey, snapshot.outcomeName].join(":");
      return buildMarketImpactEvent(previousSnapshots.get(key) ?? null, snapshot);
    })
    .filter((event): event is MarketImpactEvent => Boolean(event));
  const snapshotWrite = await insertSnapshotsDeduped(snapshots);
  const eventWrite = await insertMarketImpactEventsDeduped(events);

  return {
    ok: health.ok && eventWrite.errors.length === 0,
    engine: MARKET_IMPACT_ENGINE_VERSION,
    sport: "MLB",
    health,
    snapshotsCaptured: snapshots.length,
    snapshotsInserted: snapshotWrite.inserted,
    snapshotsSkipped: snapshotWrite.skipped,
    eventsDetected: events.length,
    eventsInserted: eventWrite.inserted,
    eventsSkipped: eventWrite.skipped,
    errors: eventWrite.errors,
  };
}
