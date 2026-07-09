import type { ConsensusMovement, OddsMovement } from "@/types/oddsMovement";
import { calculateMovementImpact } from "./calculateMovementImpact";
import { MLB_ODDS_MOVEMENT_THRESHOLDS } from "./movementThresholds";

function movementKey(movement: OddsMovement) {
  return [
    movement.eventId,
    movement.marketKey,
    movement.outcomeName.toLowerCase(),
    movement.direction,
  ].join(":");
}

function avg(values: number[]) {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function newest(values: string[]) {
  return values.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? new Date().toISOString();
}

function oldest(values: string[]) {
  return values.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? new Date().toISOString();
}

export function buildConsensusMovement(input: {
  movements: OddsMovement[];
  monitoredSportsbookCountByEvent: Map<string, number>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const recentCutoff = now.getTime() - MLB_ODDS_MOVEMENT_THRESHOLDS.recentWindowMinutes * 60000;
  const groups = new Map<string, OddsMovement[]>();

  input.movements
    .filter((movement) => new Date(movement.detectedAt).getTime() >= recentCutoff)
    .forEach((movement) => {
      const key = movementKey(movement);
      groups.set(key, [...(groups.get(key) ?? []), movement]);
    });

  return [...groups.values()]
    .map((group): ConsensusMovement => {
      const primary = [...group].sort((a, b) => b.magnitudeScore - a.magnitudeScore)[0] ?? group[0];
      const sportsbookCount = new Set(group.map((movement) => movement.bookmaker)).size;
      const monitoredSportsbookCount =
        input.monitoredSportsbookCountByEvent.get(primary.eventId) ?? sportsbookCount;
      const pointDelta = avg(group.map((movement) => movement.pointDelta).filter(Number.isFinite) as number[]);
      const impliedProbabilityDelta = avg(
        group.map((movement) => movement.impliedProbabilityDelta).filter(Number.isFinite) as number[],
      );
      const movementStartedAt = oldest(group.map((movement) => movement.movementStartedAt));
      const detectedAt = newest(group.map((movement) => movement.detectedAt));
      const elapsedMinutes = Math.max(
        ...group.map((movement) => movement.elapsedMinutes),
        Math.round((new Date(detectedAt).getTime() - new Date(movementStartedAt).getTime()) / 60000),
        0,
      );
      const consensusPercent =
        monitoredSportsbookCount > 0 ? sportsbookCount / monitoredSportsbookCount : 0;
      const impact = calculateMovementImpact({
        marketKey: primary.marketKey,
        impliedProbabilityDelta,
        pointDelta,
        sportsbookCount,
        monitoredSportsbookCount,
        elapsedMinutes,
      });

      return {
        id: `consensus:${movementKey(primary)}:${detectedAt}`,
        sport: "MLB",
        eventId: primary.eventId,
        homeTeam: primary.homeTeam,
        awayTeam: primary.awayTeam,
        commenceTime: primary.commenceTime,
        marketKey: primary.marketKey,
        outcomeName: primary.outcomeName,
        previousPoint: primary.previousPoint,
        currentPoint: primary.currentPoint,
        previousPrice: primary.previousPrice,
        currentPrice: primary.currentPrice,
        pointDelta,
        impliedProbabilityDelta,
        direction: primary.direction,
        sportsbookCount,
        monitoredSportsbookCount,
        consensusPercent,
        movementStartedAt,
        detectedAt,
        elapsedMinutes,
        magnitudeScore: impact.magnitudeScore,
        impact: sportsbookCount === 1 && impact.magnitudeScore < MLB_ODDS_MOVEMENT_THRESHOLDS.consensus.extremeMagnitudeScore
          ? "LOW"
          : impact.impact,
        status: sportsbookCount === 1 && impact.status === "VOLATILE" ? "MOVING" : impact.status,
      };
    })
    .filter((movement) => movement.magnitudeScore > 0)
    .sort((a, b) => b.magnitudeScore - a.magnitudeScore);
}
