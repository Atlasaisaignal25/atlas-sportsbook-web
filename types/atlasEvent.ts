import type {
  AtlasPulseSource,
  PulseCategory,
  PulseImpact,
  PulseMarket,
  PulseSport,
} from "./marketImpact";
import type { MovementStatus, OddsMarketKey } from "./oddsMovement";

export type AtlasProvider = "GNews" | "SportsDataIO" | "OddsAPI" | "Weather" | "Atlas";

export type AtlasSource = AtlasPulseSource & {
  provider: AtlasProvider;
};

export type AtlasTimelineItem = {
  timestamp: string;
  provider: AtlasProvider;
  eventType: string;
  summary: string;
};

export type AtlasEvent = {
  id: string;
  title: string;
  sport: PulseSport;
  category: PulseCategory;
  impact: PulseImpact;
  atlasImpactScore: number;
  primaryMarket: PulseMarket;
  secondaryMarkets: PulseMarket[];
  whyItMatters: string;
  sources: AtlasSource[];
  timeline: AtlasTimelineItem[];
  firstDetected: string;
  lastUpdated: string;
  confidence: number;
  providerCount: number;
  isResolved: boolean;
  summary: string;
  player?: string;
  team?: string;
  imageUrl?: string;
  isLiveData: boolean;

  // Backwards-compatible card fields while Market Impact moves from articles to events.
  markets: PulseMarket[];
  otherMarkets: PulseMarket[];
  source: string;
  sourceUrl: string;
  publishedAt: string;
  timestampLabel: string;
  sourceCount: number;
  publisherReliability?: number;
  groupedEventKey?: string;
  marketMovement?: AtlasMarketMovement;
};

export type AtlasMarketMovement = {
  marketKey: OddsMarketKey;
  marketLabel: "Moneyline" | "Run Line" | "Total";
  outcomeName: string;
  previousPoint?: number;
  currentPoint?: number;
  previousPrice?: number;
  currentPrice?: number;
  pointDelta?: number;
  impliedProbabilityDelta?: number;
  sportsbookCount: number;
  monitoredSportsbookCount: number;
  consensusPercent: number;
  movementStartedAt: string;
  detectedAt: string;
  elapsedMinutes: number;
  status: MovementStatus;
};
