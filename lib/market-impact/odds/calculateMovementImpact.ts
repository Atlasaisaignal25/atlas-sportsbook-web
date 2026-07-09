import type { MovementStatus, OddsMarketKey } from "@/types/oddsMovement";
import type { PulseImpact } from "@/types/marketImpact";
import { MLB_ODDS_MOVEMENT_THRESHOLDS } from "./movementThresholds";

export function calculateMovementImpact(input: {
  marketKey: OddsMarketKey;
  impliedProbabilityDelta?: number;
  pointDelta?: number;
  sportsbookCount: number;
  monitoredSportsbookCount: number;
  elapsedMinutes: number;
}) {
  const impliedAbs = Math.abs(input.impliedProbabilityDelta ?? 0);
  const pointAbs = Math.abs(input.pointDelta ?? 0);
  const consensusPercent =
    input.monitoredSportsbookCount > 0 ? input.sportsbookCount / input.monitoredSportsbookCount : 0;
  const speedBoost = input.elapsedMinutes <= 10 ? 12 : input.elapsedMinutes <= 30 ? 6 : 0;
  const consensusBoost = Math.min(consensusPercent * 24, 24);

  let base = impliedAbs * 1000;
  if (input.marketKey === "spreads" || input.marketKey === "totals") {
    base = Math.max(base, pointAbs * 62);
  }

  const magnitudeScore = Math.min(Math.round(base + speedBoost + consensusBoost), 100);
  let impact: PulseImpact = "LOW";
  let status: MovementStatus = "STABLE";

  if (
    magnitudeScore >= 80 ||
    (input.sportsbookCount >= 2 && consensusPercent >= MLB_ODDS_MOVEMENT_THRESHOLDS.consensus.highConsensusPercent)
  ) {
    impact = "HIGH";
    status = "VOLATILE";
  } else if (magnitudeScore >= 45 || input.sportsbookCount >= MLB_ODDS_MOVEMENT_THRESHOLDS.consensus.mediumSportsbooks) {
    impact = "MEDIUM";
    status = "MOVING";
  } else if (magnitudeScore > 0) {
    impact = "LOW";
    status = "MOVING";
  }

  return { magnitudeScore, impact, status };
}
