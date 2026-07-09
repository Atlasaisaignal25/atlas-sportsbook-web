export type PulseImpact = "HIGH" | "MEDIUM" | "LOW";

export type PulseMarket =
  | "Moneyline"
  | "Spread"
  | "Total"
  | "Team Total"
  | "Props"
  | "Live Market";

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
  markets: PulseMarket[];
  source: string;
  timestamp: string;
  team?: string;
  player?: string;
  url?: string;
};

const highImpactKeywords = [
  "out",
  "scratched",
  "ruled out",
  "starting pitcher change",
  "injury",
  "suspended",
  "questionable",
  "lineup change",
  "severe weather",
  "line moved",
  "odds movement",
];

const mediumImpactKeywords = [
  "probable",
  "limited",
  "wind",
  "bullpen",
  "roster move",
  "travel",
  "rest",
  "practice report",
];

const lowImpactKeywords = ["expected", "minor", "available", "no limitation"];

export function classifyPulseImpact(text: string): PulseImpact {
  const normalized = text.toLowerCase();

  if (highImpactKeywords.some((keyword) => normalized.includes(keyword))) {
    return "HIGH";
  }

  if (mediumImpactKeywords.some((keyword) => normalized.includes(keyword))) {
    return "MEDIUM";
  }

  if (lowImpactKeywords.some((keyword) => normalized.includes(keyword))) {
    return "LOW";
  }

  return "LOW";
}

export const atlasPulseMock: AtlasPulseItem[] = [
  {
    id: "mlb-pitcher-change",
    sport: "MLB",
    title: "Starting Pitcher Changed",
    summary: "The listed starter has changed, which may affect moneyline and total markets.",
    impact: "HIGH",
    markets: ["Moneyline", "Total", "Live Market"],
    source: "Atlas Monitor",
    timestamp: "12 min ago",
    team: "MLB Slate",
  },
  {
    id: "mlb-batter-scratched",
    sport: "MLB",
    title: "Key Batter Scratched From Lineup",
    summary: "A major offensive player is out of the confirmed lineup. Team total projection may decrease.",
    impact: "HIGH",
    markets: ["Team Total", "Moneyline", "Props"],
    source: "Atlas Monitor",
    timestamp: "18 min ago",
    player: "Key Batter",
  },
  {
    id: "mlb-wrigley-wind",
    sport: "MLB",
    title: "Wind Blowing Out at Wrigley",
    summary: "Weather conditions may favor hitters and increase total market volatility.",
    impact: "MEDIUM",
    markets: ["Total", "Team Total"],
    source: "Atlas Weather Scan",
    timestamp: "25 min ago",
    team: "Cubs",
  },
  {
    id: "nfl-qb-limited",
    sport: "NFL",
    title: "Star QB Limited in Practice",
    summary: "Injury status may affect early-week spread and moneyline movement.",
    impact: "MEDIUM",
    markets: ["Spread", "Moneyline", "Props"],
    source: "Atlas Monitor",
    timestamp: "40 min ago",
    player: "Starting QB",
  },
  {
    id: "nba-player-probable",
    sport: "NBA",
    title: "Player Upgraded to Probable",
    summary: "Player availability improves team projection but may already be priced into the market.",
    impact: "LOW",
    markets: ["Spread", "Props"],
    source: "Atlas Monitor",
    timestamp: "1 hr ago",
    player: "Rotation Player",
  },
];
