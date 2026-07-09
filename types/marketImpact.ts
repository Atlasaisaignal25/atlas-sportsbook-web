export type PulseImpact = "HIGH" | "MEDIUM" | "LOW";

export type PulseMarket =
  | "Moneyline"
  | "Run Line"
  | "Total"
  | "Team Total"
  | "Player Props"
  | "First Five"
  | "Live Market";

export type PulseCategory =
  | "INJURY"
  | "LINEUP"
  | "STARTING_PITCHER"
  | "BULLPEN"
  | "WEATHER"
  | "ROSTER"
  | "TRANSACTION"
  | "SUSPENSION"
  | "MARKET"
  | "GENERAL";

export type PulseSport =
  | "MLB"
  | "NFL"
  | "NBA"
  | "NHL"
  | "SOCCER"
  | "TENNIS"
  | "UFC"
  | "NCAA";

export type AtlasPulseItem = {
  id: string;
  sport: PulseSport;
  title: string;
  summary: string;
  impact: PulseImpact;
  category: PulseCategory;
  markets: PulseMarket[];
  source: string;
  sourceUrl: string;
  publishedAt: string;
  timestampLabel: string;
  imageUrl?: string;
  team?: string;
  player?: string;
  isLiveData: boolean;
  sources?: AtlasPulseSource[];
  sourceCount?: number;
  whyItMatters?: string;
  primaryMarket?: PulseMarket;
  otherMarkets?: PulseMarket[];
  atlasImpactScore?: number;
  publisherReliability?: number;
  groupedEventKey?: string;
};

export type AtlasPulseSource = {
  name: string;
  url: string;
  publishedAt: string;
  reliability: number;
};
