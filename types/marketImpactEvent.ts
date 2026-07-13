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
  booksObserved: number;
  booksMoved: number;
  consensusPercent: number;
  consensusLevel: "LOW CONSENSUS" | "MEDIUM CONSENSUS" | "HIGH CONSENSUS";
  sportsbookKeysMoved: string[];
  sportsbookNamesMoved: string[];
  firstBookToMove: string | null;
  firstMoveAt: string | null;
  latestBookToMove: string | null;
  latestMoveAt: string | null;
  movementWindowMinutes: number | null;
  sportsbookDetails: Array<{
    key: string;
    name: string;
    oldLine: number | null;
    newLine: number | null;
    oldOdds: number | null;
    newOdds: number | null;
    movedAt: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};
