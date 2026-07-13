import type { PulseImpact, PulseSport } from "./marketImpact";

export type AtlasIntelligenceSport = Extract<PulseSport, "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER">;

export type AtlasIntelligenceInsightType = "TEAM_IMPACT_TO_MARKET_IMPACT";

export type AtlasIntelligenceEvent = {
  id?: string;
  sport: AtlasIntelligenceSport;
  eventId: string;
  relatedTeamEventId: string;
  relatedMarketEventId: string;
  insightType: AtlasIntelligenceInsightType;
  confidence: PulseImpact;
  summary: string;
  details: {
    awayTeam: string | null;
    homeTeam: string | null;
    teamEventType: string;
    teamEventTime: string;
    market: string;
    marketMovementType: string;
    marketTime: string;
    movementSize: number;
    minutesBetween: number;
  };
  publishedAt: string;
  createdAt?: string;
  updatedAt?: string;
};
