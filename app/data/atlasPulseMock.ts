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
    title: "Blake Snell Confirmed Starter Change For Los Angeles Dodgers vs San Francisco Giants",
    summary: "Blake Snell is now listed in a confirmed starter change for Los Angeles Dodgers vs San Francisco Giants. Moneyline, First Five and Total markets may adjust.",
    impact: "HIGH",
    category: "STARTING_PITCHER",
    markets: ["Moneyline", "Run Line", "Total", "First Five", "Player Props"],
    source: "Atlas Monitor",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "12 min ago",
    player: "Blake Snell",
    team: "Los Angeles Dodgers",
    isLiveData: false,
  },
  {
    id: "mlb-batter-scratched",
    sport: "MLB",
    title: "Aaron Judge Late Scratch For New York Yankees vs Boston Red Sox",
    summary: "Aaron Judge was scratched from the confirmed lineup for New York Yankees vs Boston Red Sox. Team total projection may decrease.",
    impact: "HIGH",
    category: "LINEUP",
    markets: ["Moneyline", "Team Total", "Player Props"],
    source: "Atlas Monitor",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "18 min ago",
    player: "Aaron Judge",
    team: "New York Yankees",
    isLiveData: false,
  },
  {
    id: "mlb-wrigley-wind",
    sport: "MLB",
    title: "Wind Blowing Out For Chicago Cubs vs San Diego Padres",
    summary: "Wind is blowing out at Wrigley for Chicago Cubs vs San Diego Padres. Conditions may favor hitters and increase total market volatility.",
    impact: "MEDIUM",
    category: "WEATHER",
    markets: ["Total", "Team Total", "First Five"],
    source: "Atlas Weather Scan",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "25 min ago",
    team: "Chicago Cubs",
    isLiveData: false,
  },
  {
    id: "nfl-qb-limited",
    sport: "NFL",
    title: "Josh Allen Day-To-Day Before Buffalo Bills vs Miami Dolphins",
    summary: "Josh Allen is day-to-day ahead of Buffalo Bills vs Miami Dolphins. Availability could influence moneyline and team total markets.",
    impact: "MEDIUM",
    category: "INJURY",
    markets: ["Moneyline", "Run Line", "Team Total", "Player Props"],
    source: "Atlas Monitor",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "40 min ago",
    player: "Josh Allen",
    team: "Buffalo Bills",
    isLiveData: false,
  },
  {
    id: "nba-player-probable",
    sport: "NBA",
    title: "Stephen Curry Upgraded To Probable For Golden State Warriors vs Los Angeles Lakers",
    summary: "Stephen Curry has been upgraded to probable for Golden State Warriors vs Los Angeles Lakers. Availability may improve offensive projection.",
    impact: "LOW",
    category: "INJURY",
    markets: ["Run Line", "Player Props"],
    source: "Atlas Monitor",
    sourceUrl: "",
    publishedAt: fallbackPublishedAt,
    timestampLabel: "1 hr ago",
    player: "Stephen Curry",
    team: "Golden State Warriors",
    isLiveData: false,
  },
];

export const atlasPulseMock: AtlasPulseItem[] = atlasPulseBaseItems.map(enrichMockItem);
