import type { PulseImpact, PulseSport } from "./marketImpact";

export type MarketImpactSport = Extract<PulseSport, "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER">;

export type MarketImpactMarket = "Moneyline" | "Spread" | "Totals";

export type MarketImpactMovementType = "LINE_MOVEMENT" | "ODDS_MOVEMENT";

export type MarketImpactDirection = "UP" | "DOWN" | "NO_CHANGE";

export type MarketImpactEvent = {
  id?: string;
  sport: MarketImpactSport;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  market: MarketImpactMarket;
  selection: string;
  movementType: MarketImpactMovementType;
  oldLine: number | null;
  newLine: number | null;
  oldOdds: number | null;
  newOdds: number | null;
  direction: MarketImpactDirection;
  movementSize: number;
  confidence: PulseImpact;
  why: string;
  impact: string;
  publishedAt: string;
  createdAt?: string;
  updatedAt?: string;
};
