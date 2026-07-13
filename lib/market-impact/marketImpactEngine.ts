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

type SportsbookMovement = {
  previous: OddsSnapshot;
  current: OddsSnapshot;
  market: MarketImpactMarket;
  movementType: MarketImpactMovementType;
  oldLine: number | null;
  newLine: number | null;
  oldOdds: number | null;
  newOdds: number | null;
  direction: MarketImpactDirection;
  movementSize: number;
  why: string;
  impact: string;
};

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

function slateDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function windowBucket(value: string) {
  const windowMs = MARKET_IMPACT_THRESHOLDS.consensus.windowMinutes * 60000;
  return Math.floor(new Date(value).getTime() / windowMs);
}

function consensusLevel(percent: number): MarketImpactEvent["consensusLevel"] {
  if (percent >= MARKET_IMPACT_THRESHOLDS.consensus.highPercent) return "HIGH CONSENSUS";
  if (percent >= MARKET_IMPACT_THRESHOLDS.consensus.mediumPercent) return "MEDIUM CONSENSUS";
  return "LOW CONSENSUS";
}

function eventId(input: {
  sport: string;
  eventId: string;
  capturedAt: string;
  marketKey: string;
  outcomeName: string;
  movementType: MarketImpactMovementType;
  direction: MarketImpactDirection;
}) {
  return crypto
    .createHash("sha256")
    .update([
      MARKET_IMPACT_ENGINE_VERSION,
      slateDate(input.capturedAt),
      input.sport,
      input.eventId,
      input.marketKey,
      input.outcomeName,
      input.movementType,
      input.direction,
      windowBucket(input.capturedAt),
    ].join("|"))
    .digest("hex")
    .slice(0, 32);
}

function buildSportsbookMovement(previous: OddsSnapshot | null, current: OddsSnapshot): SportsbookMovement | null {
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

  return {
    previous,
    current,
    market,
    movementType,
    oldLine,
    newLine,
    oldOdds,
    newOdds,
    direction,
    movementSize,
    why,
    impact,
  };
}

function observedBookCount(snapshots: OddsSnapshot[], movement: SportsbookMovement) {
  const books = new Set<string>();
  for (const snapshot of snapshots) {
    if (
      snapshot.eventId === movement.current.eventId &&
      snapshot.marketKey === movement.current.marketKey &&
      snapshot.outcomeName === movement.current.outcomeName &&
      snapshot.price !== undefined
    ) {
      books.add(snapshot.bookmakerKey ?? snapshot.bookmaker);
    }
  }
  return books.size;
}

function movementGroupKey(movement: SportsbookMovement) {
  return [
    movement.current.sport,
    movement.current.eventId,
    movement.current.marketKey,
    movement.current.outcomeName,
    movement.movementType,
    movement.direction,
    windowBucket(movement.current.capturedAt),
  ].join("|");
}

function buildConsensusEvents(movements: SportsbookMovement[], snapshots: OddsSnapshot[]) {
  const grouped = new Map<string, SportsbookMovement[]>();
  for (const movement of movements) {
    const key = movementGroupKey(movement);
    grouped.set(key, [...(grouped.get(key) ?? []), movement]);
  }

  return [...grouped.values()].map((group): MarketImpactEvent => {
    const sorted = [...group].sort((a, b) => new Date(a.current.capturedAt).getTime() - new Date(b.current.capturedAt).getTime());
    const first = sorted[0];
    const latest = sorted[sorted.length - 1];
    const booksObserved = Math.max(observedBookCount(snapshots, first), group.length);
    const bookKeys = Array.from(new Set(group.map((movement) => movement.current.bookmakerKey ?? movement.current.bookmaker)));
    const bookNames = Array.from(new Set(group.map((movement) => movement.current.bookmakerName ?? movement.current.bookmaker)));
    const consensusPercent = booksObserved > 0 ? (bookKeys.length / booksObserved) * 100 : 0;
    const movementSize = Math.max(...group.map((movement) => movement.movementSize));
    const confidence = bookKeys.length === 1
      ? "LOW"
      : consensusPercent >= MARKET_IMPACT_THRESHOLDS.consensus.highPercent
        ? "HIGH"
        : confidenceForSize({ market: latest.market, movementType: latest.movementType, size: movementSize });

    return {
      sport: "MLB",
      eventId: eventId({
        sport: latest.current.sport,
        eventId: latest.current.eventId,
        capturedAt: latest.current.capturedAt,
        marketKey: latest.current.marketKey,
        outcomeName: latest.current.outcomeName,
        movementType: latest.movementType,
        direction: latest.direction,
      }),
      homeTeam: latest.current.homeTeam,
      awayTeam: latest.current.awayTeam,
      market: latest.market,
      selection: latest.current.outcomeName,
      movementType: latest.movementType,
      oldLine: first.oldLine,
      newLine: latest.newLine,
      oldOdds: first.oldOdds,
      newOdds: latest.newOdds,
      direction: latest.direction,
      movementSize,
      confidence,
      why: latest.why,
      impact: `${bookKeys.length} of ${booksObserved} sportsbooks moved. Consensus ${consensusPercent.toFixed(1)}%.`,
      publishedAt: latest.current.capturedAt,
      booksObserved,
      booksMoved: bookKeys.length,
      consensusPercent,
      consensusLevel: consensusLevel(consensusPercent),
      sportsbookKeysMoved: bookKeys,
      sportsbookNamesMoved: bookNames,
      firstBookToMove: first.current.bookmakerName ?? first.current.bookmaker,
      firstMoveAt: first.current.capturedAt,
      latestBookToMove: latest.current.bookmakerName ?? latest.current.bookmaker,
      latestMoveAt: latest.current.capturedAt,
      movementWindowMinutes: MARKET_IMPACT_THRESHOLDS.consensus.windowMinutes,
      sportsbookDetails: sorted.map((movement) => ({
        key: movement.current.bookmakerKey ?? movement.current.bookmaker,
        name: movement.current.bookmakerName ?? movement.current.bookmaker,
        oldLine: movement.oldLine,
        newLine: movement.newLine,
        oldOdds: movement.oldOdds,
        newOdds: movement.newOdds,
        movedAt: movement.current.capturedAt,
      })),
    };
  });
}

export async function captureMarketImpactEvents(apiKey: string) {
  const capturedAt = new Date().toISOString();
  const { games, health } = await fetchCurrentMlbOdds(apiKey);
  const { snapshots } = normalizeOddsSnapshots(games, capturedAt);
  const previousSnapshots = await getLatestSnapshotsForSport("MLB");
  const movements = snapshots
    .map((snapshot) => {
      const key = [snapshot.eventId, snapshot.bookmaker, snapshot.marketKey, snapshot.outcomeName].join(":");
      return buildSportsbookMovement(previousSnapshots.get(key) ?? null, snapshot);
    })
    .filter((movement): movement is SportsbookMovement => Boolean(movement));
  const events = buildConsensusEvents(movements, snapshots);
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
    sportsbookMovementsDetected: movements.length,
    eventsDetected: events.length,
    eventsInserted: eventWrite.inserted,
    eventsUpdated: eventWrite.updated,
    eventsSkipped: eventWrite.skipped,
    errors: eventWrite.errors,
  };
}
