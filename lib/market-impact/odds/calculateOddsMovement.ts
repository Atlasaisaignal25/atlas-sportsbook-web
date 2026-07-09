import type { OddsMovement, OddsMovementDirection, OddsSnapshot } from "@/types/oddsMovement";
import { impliedProbabilityDelta } from "./oddsConversion";
import { calculateMovementImpact } from "./calculateMovementImpact";
import { MLB_ODDS_MOVEMENT_THRESHOLDS } from "./movementThresholds";

function minutesBetween(start: string, end: string) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(Math.round((endMs - startMs) / 60000), 0);
}

function movementDirection(input: {
  marketKey: OddsSnapshot["marketKey"];
  previousPoint?: number;
  currentPoint?: number;
  previousPrice?: number;
  currentPrice?: number;
  impliedDelta?: number;
}): OddsMovementDirection {
  const pointDelta =
    input.previousPoint !== undefined && input.currentPoint !== undefined
      ? input.currentPoint - input.previousPoint
      : undefined;

  if (input.marketKey === "h2h") {
    if (!input.impliedDelta) return "UNCHANGED";
    return input.impliedDelta > 0 ? "SHORTENING" : "DRIFTING";
  }

  if (pointDelta && pointDelta !== 0) return pointDelta > 0 ? "UP" : "DOWN";
  if (!input.impliedDelta) return "UNCHANGED";
  return input.impliedDelta > 0 ? "SHORTENING" : "DRIFTING";
}

function passesThreshold(snapshot: OddsSnapshot, movement: {
  pointDelta?: number;
  priceDelta?: number;
  impliedDelta?: number;
}) {
  const impliedAbs = Math.abs(movement.impliedDelta ?? 0);
  const pointAbs = Math.abs(movement.pointDelta ?? 0);
  const priceAbs = Math.abs(movement.priceDelta ?? 0);

  if (snapshot.marketKey === "h2h") {
    return (
      impliedAbs >= MLB_ODDS_MOVEMENT_THRESHOLDS.moneyline.lowImpliedProbabilityDelta ||
      priceAbs >= MLB_ODDS_MOVEMENT_THRESHOLDS.moneyline.lowPriceDelta
    );
  }

  if (snapshot.marketKey === "spreads") {
    return (
      pointAbs >= MLB_ODDS_MOVEMENT_THRESHOLDS.spreads.mediumPointDelta ||
      impliedAbs >= MLB_ODDS_MOVEMENT_THRESHOLDS.spreads.lowImpliedProbabilityDelta
    );
  }

  return (
    pointAbs >= MLB_ODDS_MOVEMENT_THRESHOLDS.totals.mediumPointDelta ||
    impliedAbs >= MLB_ODDS_MOVEMENT_THRESHOLDS.totals.lowImpliedProbabilityDelta
  );
}

export function calculateOddsMovement(previous: OddsSnapshot | null, current: OddsSnapshot): OddsMovement | null {
  if (!previous) return null;

  const pointDelta =
    previous.point !== undefined && current.point !== undefined ? current.point - previous.point : undefined;
  const priceDelta =
    previous.price !== undefined && current.price !== undefined ? current.price - previous.price : undefined;
  const impliedDelta = impliedProbabilityDelta(previous.price, current.price);

  if (
    (pointDelta === undefined || pointDelta === 0) &&
    (priceDelta === undefined || priceDelta === 0)
  ) {
    return null;
  }

  if (!passesThreshold(current, { pointDelta, priceDelta, impliedDelta })) return null;

  const elapsedMinutes = minutesBetween(previous.capturedAt, current.capturedAt);
  const direction = movementDirection({
    marketKey: current.marketKey,
    previousPoint: previous.point,
    currentPoint: current.point,
    previousPrice: previous.price,
    currentPrice: current.price,
    impliedDelta,
  });

  if (direction === "UNCHANGED") return null;

  const impact = calculateMovementImpact({
    marketKey: current.marketKey,
    impliedProbabilityDelta: impliedDelta,
    pointDelta,
    sportsbookCount: 1,
    monitoredSportsbookCount: 1,
    elapsedMinutes,
  });

  return {
    id: `${current.eventId}:${current.bookmaker}:${current.marketKey}:${current.outcomeName}:${current.capturedAt}`,
    sport: "MLB",
    eventId: current.eventId,
    homeTeam: current.homeTeam,
    awayTeam: current.awayTeam,
    commenceTime: current.commenceTime,
    bookmaker: current.bookmaker,
    marketKey: current.marketKey,
    outcomeName: current.outcomeName,
    previousPoint: previous.point,
    currentPoint: current.point,
    previousPrice: previous.price,
    currentPrice: current.price,
    pointDelta,
    priceDelta,
    impliedProbabilityDelta: impliedDelta,
    direction,
    movementStartedAt: previous.capturedAt,
    detectedAt: current.capturedAt,
    elapsedMinutes,
    magnitudeScore: impact.magnitudeScore,
    impact: impact.impact,
  };
}
