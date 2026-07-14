import type { AtlasPackageSources } from "../app/lib/bankroll";

const start = "2026-07-14T19:00:00.000Z";

export const validationAtlasSources: AtlasPackageSources = {
  signals: [
    source("signals-mlb-1", "MLB", "Dodgers ML", "Moneyline", -135, 1),
    source("signals-mlb-2", "MLB", "Yankees ML", "Moneyline", -120, 2),
    source("signals-mlb-3", "MLB", "Mets ML", "Moneyline", -112, 3),
    source("signals-nba-1", "NBA", "Celtics ML", "Moneyline", -130, 1),
    source("signals-nba-2", "NBA", "Knicks ML", "Moneyline", -118, 2),
    source("signals-nba-3", "NBA", "Lakers ML", "Moneyline", -110, 3),
    source("signals-nfl-1", "NFL", "Chiefs ML", "Moneyline", -125, 1),
    source("signals-nfl-2", "NFL", "Eagles ML", "Moneyline", -115, 2),
    source("signals-nfl-3", "NFL", "Bills ML", "Moneyline", -105, 3),
    source("signals-nhl-1", "NHL", "Rangers ML", "Moneyline", -118, 1),
    source("signals-nhl-2", "NHL", "Bruins ML", "Moneyline", -112, 2),
    source("signals-nhl-3", "NHL", "Stars ML", "Moneyline", -108, 3),
  ],
  top3: [
    source("top3-mlb-1", "MLB", "Dodgers ML", "Moneyline", -135, 1),
    source("top3-mlb-2", "MLB", "Braves ML", "Moneyline", -122, 2),
    source("top3-mlb-3", "MLB", "Phillies ML", "Moneyline", -118, 3),
    source("top3-nba-1", "NBA", "Celtics ML", "Moneyline", -140, 1),
    source("top3-nba-2", "NBA", "Nuggets ML", "Moneyline", -130, 2),
    source("top3-nba-3", "NBA", "Knicks ML", "Moneyline", -120, 3),
    source("top3-nfl-1", "NFL", "Chiefs ML", "Moneyline", -135, 1),
    source("top3-nfl-2", "NFL", "Eagles ML", "Moneyline", -128, 2),
    source("top3-nfl-3", "NFL", "Bills ML", "Moneyline", -116, 3),
    source("top3-nhl-1", "NHL", "Rangers ML", "Moneyline", -125, 1),
    source("top3-nhl-2", "NHL", "Bruins ML", "Moneyline", -120, 2),
    source("top3-nhl-3", "NHL", "Stars ML", "Moneyline", -112, 3),
  ],
  top5: [
    source("top5-mlb-1", "MLB", "Dodgers ML", "Moneyline", -135, 1),
    source("top5-mlb-2", "MLB", "Braves ML", "Moneyline", -122, 2),
    source("top5-mlb-3", "MLB", "Phillies ML", "Moneyline", -118, 3),
    source("top5-mlb-4", "MLB", "Padres ML", "Moneyline", -108, 4),
    source("top5-mlb-5", "MLB", "Orioles ML", "Moneyline", 102, 5),
    source("top5-nba-1", "NBA", "Celtics ML", "Moneyline", -140, 1),
    source("top5-nba-2", "NBA", "Nuggets ML", "Moneyline", -130, 2),
    source("top5-nba-3", "NBA", "Knicks ML", "Moneyline", -120, 3),
    source("top5-nba-4", "NBA", "Lakers ML", "Moneyline", -112, 4),
    source("top5-nba-5", "NBA", "Suns ML", "Moneyline", 105, 5),
    source("top5-nfl-1", "NFL", "Chiefs ML", "Moneyline", -135, 1),
    source("top5-nfl-2", "NFL", "Eagles ML", "Moneyline", -128, 2),
    source("top5-nfl-3", "NFL", "Bills ML", "Moneyline", -116, 3),
    source("top5-nfl-4", "NFL", "Ravens ML", "Moneyline", -110, 4),
    source("top5-nfl-5", "NFL", "Lions ML", "Moneyline", 100, 5),
    source("top5-nhl-1", "NHL", "Rangers ML", "Moneyline", -125, 1),
    source("top5-nhl-2", "NHL", "Bruins ML", "Moneyline", -120, 2),
    source("top5-nhl-3", "NHL", "Stars ML", "Moneyline", -112, 3),
    source("top5-nhl-4", "NHL", "Avalanche ML", "Moneyline", -106, 4),
    source("top5-nhl-5", "NHL", "Panthers ML", "Moneyline", 104, 5),
  ],
};

function source(id: string, sport: "MLB" | "NBA" | "NFL" | "NHL", selection: string, market: string, odds: number, rank: number) {
  return {
    id,
    sport,
    league: sport,
    eventId: id,
    homeTeam: `${sport} Home`,
    awayTeam: `${sport} Away`,
    selection,
    market,
    odds,
    status: "pending" as const,
    rank,
    startTime: start,
  };
}
