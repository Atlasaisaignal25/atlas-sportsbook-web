import type { AtlasPulseItem } from "@/types/marketImpact";
import { calculateAtlasImpactScore } from "@/lib/market-impact/impactScore";
import { getOtherMarkets, getPrimaryMarket } from "@/lib/market-impact/primaryMarket";
import { scorePublisher } from "@/lib/market-impact/sourceQuality";
import { buildWhyItMatters } from "@/lib/market-impact/whyItMatters";

const fallbackPublishedAt = new Date().toISOString();

function enrichMockItem(item: AtlasPulseItem): AtlasPulseItem {
  const publisherReliability = scorePublisher(item.source);
  const primaryMarket = getPrimaryMarket(item.category, item.markets);

  return {
    ...item,
    sourceCount: 1,
    sources: item.sourceUrl
      ? [
          {
            name: item.source,
            url: item.sourceUrl,
            publishedAt: item.publishedAt,
            reliability: publisherReliability,
          },
        ]
      : [],
    whyItMatters: buildWhyItMatters({ category: item.category, markets: item.markets }),
    primaryMarket,
    otherMarkets: getOtherMarkets(primaryMarket, item.markets),
    atlasImpactScore: calculateAtlasImpactScore({
      category: item.category,
      impact: item.impact,
      sourceCount: 1,
      topPublisherReliability: publisherReliability,
    }),
    publisherReliability,
  };
}

const atlasPulseBaseItems: AtlasPulseItem[] = [
  {
    id: "mlb-pitcher-change",
    sport: "MLB",
    title: "Starting Pitcher Changed",
    summary: "The listed starter has changed, which may affect moneyline and total markets.",
    impact: "HIGH",
    category: "STARTING_PITCHER",
    markets: ["Moneyline", "Run Line", "Total", "First Five", "Player Props"],
    source: "Atlas Monitor",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "12 min ago",
    team: "MLB Slate",
    isLiveData: false,
  },
  {
    id: "mlb-batter-scratched",
    sport: "MLB",
    title: "Key Batter Scratched From Lineup",
    summary: "A major offensive player is out of the confirmed lineup. Team total projection may decrease.",
    impact: "HIGH",
    category: "LINEUP",
    markets: ["Moneyline", "Team Total", "Player Props"],
    source: "Atlas Monitor",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "18 min ago",
    player: "Key Batter",
    isLiveData: false,
  },
  {
    id: "mlb-wrigley-wind",
    sport: "MLB",
    title: "Wind Blowing Out at Wrigley",
    summary: "Weather conditions may favor hitters and increase total market volatility.",
    impact: "MEDIUM",
    category: "WEATHER",
    markets: ["Total", "Team Total", "First Five"],
    source: "Atlas Weather Scan",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "25 min ago",
    team: "Cubs",
    isLiveData: false,
  },
  {
    id: "nfl-qb-limited",
    sport: "NFL",
    title: "Star QB Limited in Practice",
    summary: "Injury status may affect early-week spread and moneyline movement.",
    impact: "MEDIUM",
    category: "INJURY",
    markets: ["Moneyline", "Run Line", "Team Total", "Player Props"],
    source: "Atlas Monitor",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "40 min ago",
    player: "Starting QB",
    isLiveData: false,
  },
  {
    id: "nba-player-probable",
    sport: "NBA",
    title: "Player Upgraded to Probable",
    summary: "Player availability improves team projection but may already be priced into the market.",
    impact: "LOW",
    category: "INJURY",
    markets: ["Run Line", "Player Props"],
    source: "Atlas Monitor",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "1 hr ago",
    player: "Rotation Player",
    isLiveData: false,
  },
];

export const atlasPulseMock: AtlasPulseItem[] = atlasPulseBaseItems.map(enrichMockItem);
