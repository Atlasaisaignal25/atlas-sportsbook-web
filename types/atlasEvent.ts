import type {
  AtlasPulseSource,
  PulseCategory,
  PulseImpact,
  PulseMarket,
  PulseSport,
} from "./marketImpact";

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
};
