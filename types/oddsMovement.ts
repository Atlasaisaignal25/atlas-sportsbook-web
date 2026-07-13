import type { PulseImpact } from "./marketImpact";

export type OddsMarketKey = "h2h" | "spreads" | "totals";

export type OddsSnapshot = {
  sport: "MLB";
  eventId: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  bookmaker: string;
  bookmakerKey?: string;
  bookmakerName?: string;
  marketKey: OddsMarketKey;
  outcomeName: string;
  point?: number;
  price?: number;
  capturedAt: string;
};

export type OddsMovementDirection =
  | "SHORTENING"
  | "DRIFTING"
  | "UP"
  | "DOWN"
  | "UNCHANGED";

export type OddsMovement = {
  id: string;
  sport: "MLB";
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string;
  marketKey: OddsMarketKey;
  outcomeName: string;
  previousPoint?: number;
  currentPoint?: number;
  previousPrice?: number;
  currentPrice?: number;
  pointDelta?: number;
  priceDelta?: number;
  impliedProbabilityDelta?: number;
  direction: OddsMovementDirection;
  movementStartedAt: string;
  detectedAt: string;
  elapsedMinutes: number;
  magnitudeScore: number;
  impact: PulseImpact;
};

export type MovementStatus = "STABLE" | "MOVING" | "VOLATILE";

export type ConsensusMovement = {
  id: string;
  sport: "MLB";
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  marketKey: OddsMarketKey;
  outcomeName: string;
  previousPoint?: number;
  currentPoint?: number;
  previousPrice?: number;
  currentPrice?: number;
  pointDelta?: number;
  impliedProbabilityDelta?: number;
  direction: OddsMovementDirection;
  sportsbookCount: number;
  monitoredSportsbookCount: number;
  consensusPercent: number;
  movementStartedAt: string;
  detectedAt: string;
  elapsedMinutes: number;
  magnitudeScore: number;
  impact: PulseImpact;
  status: MovementStatus;
};
