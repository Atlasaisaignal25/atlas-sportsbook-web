"use client";

import { useEffect, useMemo, useState } from "react";
import mlbSignals from "@/data/mlb-public-signals.json";
import nbaSignals from "@/data/nba-public-signals.json";
import nhlSignals from "@/data/nhl-public-signals.json";
import soccerSignals from "@/data/soccer-public-signals.json";
import mlbTop5 from "@/data/mlb-top5.json";
import nbaTop5 from "@/data/nba-top5.json";
import nhlTop5 from "@/data/nhl-top5.json";
import soccerTop5 from "@/data/soccer-top5.json";

type Outcome = {
  name: string;
  price: number;
  point?: number;
};

type Market = {
  key: string;
  outcomes: Outcome[];
};

type Bookmaker = {
  key: string;
  title: string;
  markets: Market[];
};

type OddsGame = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: Bookmaker[];
};

type SignalGame = {
  gameId: string | number;
  awayTeam?: string;
  homeTeam?: string;
  pick: string;
  status?: string;
  isTop5?: boolean;
  isTopSignal?: boolean;
  topRank?: number | null;
};

type Top5Entry = {
  rank?: number;
  awayTeam?: string;
  homeTeam?: string;
  pick: string;
  startTime?: string | null;
  status?: string;
  isTopSignal?: boolean;
};

type TopSignalCard = Top5Entry & {
  sport: "MLB" | "NBA" | "NHL" | "SOCCER";
};

const sportsTabs = ["TOP", "NHL", "NBA", "MLB", "NFL", "SOCCER"] as const;
type SportTab = (typeof sportsTabs)[number];

function getPreferredBookmaker(game: OddsGame) {
  return (
    game.bookmakers?.find((b) => b.key === "draftkings") ||
    game.bookmakers?.[0] ||
    null
  );
}

function getMarket(game: OddsGame, marketKey: string) {
  const bookmaker = getPreferredBookmaker(game);
  return bookmaker?.markets?.find((m) => m.key === marketKey) || null;
}

function getMoneyline(game: OddsGame, teamName: string) {
  const market = getMarket(game, "h2h");
  const outcome = market?.outcomes?.find((o) => o.name === teamName);
  return outcome?.price ?? null;
}

function getSpreadValue(game: OddsGame, teamName: string) {
  const market = getMarket(game, "spreads");
  const outcome = market?.outcomes?.find((o) => o.name === teamName);

  if (!outcome) return "N/A";
  if (outcome.point === undefined || outcome.price === undefined) {
    return "N/A";
  }

  const point =
    outcome.point > 0 ? `+${outcome.point}` : `${outcome.point}`;

  return `${point}`;
}

function getTotalValues(game: OddsGame) {
  const market = getMarket(game, "totals");

  if (!market) {
    return {
      overLabel: "N/A",
      underLabel: "N/A",
      summary: "N/A",
    };
  }

  const over = market.outcomes.find((o) => o.name === "Over");
  const under = market.outcomes.find((o) => o.name === "Under");

  if (!over || !under) {
    return {
      overLabel: "N/A",
      underLabel: "N/A",
      summary: "N/A",
    };
  }

  const overPoint = over.point !== undefined ? over.point : "N/A";
  const underPoint = under.point !== undefined ? under.point : "N/A";

  return {
    overLabel: `O ${overPoint}`,
    underLabel: `U ${underPoint}`,
    summary: `O ${overPoint} / U ${underPoint}`,
  };
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDisplayedPick(rawPick: string, sport: string) {
  const pick = String(rawPick ?? "").trim();

  if (!pick) return "N/A";

  const totalMatch = pick.match(
    /^(over|under)\s*[\(\s]?([0-9]+(?:\.[0-9]+)?)\)?$/i
  );
  if (totalMatch) {
    const side = totalMatch[1].toLowerCase() === "over" ? "Over" : "Under";
    return `${side} ${totalMatch[2]}`;
  }

  const spreadPlain = pick.match(/^(.*?)(?:\s+)([+-]\d+(?:\.\d+)?)$/);
  if (spreadPlain) {
    const team = spreadPlain[1].trim();
    const line = spreadPlain[2];

    if (sport === "SOCCER" && (line === "-0.5" || line === "+0.5")) {
      return `${team} ML`;
    }

    return `${team} (${line})`;
  }

  const spreadParen = pick.match(/^(.*)\(\s*([+-]?\d+(?:\.\d+)?)\s*\)$/);
  if (spreadParen) {
    const team = spreadParen[1].trim();
    const line = spreadParen[2];

    if (sport === "SOCCER" && (line === "-0.5" || line === "+0.5")) {
      return `${team} ML`;
    }

    const formatted =
      line.startsWith("+") || line.startsWith("-")
        ? line
        : Number(line) > 0
        ? `+${line}`
        : line;

    return `${team} (${formatted})`;
  }

  if (/^(over|under)$/i.test(pick)) {
    return pick;
  }

  if (/\bml\b/i.test(pick)) {
    return pick;
  }

  return `${pick} ML`;
}

function normalizeName(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSameMatch(
  game: OddsGame,
  signal: { awayTeam?: string; homeTeam?: string }
) {
  const gameAway = normalizeName(game.away_team);
  const gameHome = normalizeName(game.home_team);
  const signalAway = normalizeName(signal.awayTeam ?? "");
  const signalHome = normalizeName(signal.homeTeam ?? "");

  return gameAway === signalAway && gameHome === signalHome;
}

function findPick(game: OddsGame, sport: string): SignalGame | null {
  if (sport === "MLB") {
    const direct = mlbSignals.games.find(
      (g) => String(g.gameId) === String(game.id)
    );
    const baseMatch =
      direct || mlbSignals.games.find((g) => isSameMatch(game, g)) || null;
    if (!baseMatch) return null;

    const top5Match = mlbTop5.top5.find((g) => isSameMatch(game, g)) || null;

    return {
      ...baseMatch,
      isTop5: !!top5Match,
      isTopSignal: !!top5Match?.isTopSignal,
      topRank: top5Match?.rank ?? null,
    };
  }

  if (sport === "NBA") {
    const direct = nbaSignals.games.find(
      (g) => String(g.gameId) === String(game.id)
    );
    const baseMatch =
      direct || nbaSignals.games.find((g) => isSameMatch(game, g)) || null;
    if (!baseMatch) return null;

    const top5Match = nbaTop5.top5.find((g) => isSameMatch(game, g)) || null;

    return {
      ...baseMatch,
      isTop5: !!top5Match,
      isTopSignal: !!top5Match?.isTopSignal,
      topRank: top5Match?.rank ?? null,
    };
  }

  if (sport === "NHL") {
    const direct = nhlSignals.games.find(
      (g) => String(g.gameId) === String(game.id)
    );
    const baseMatch =
      direct || nhlSignals.games.find((g) => isSameMatch(game, g)) || null;
    if (!baseMatch) return null;

    const top5Match = nhlTop5.top5.find((g) => isSameMatch(game, g)) || null;

    return {
      ...baseMatch,
      isTop5: !!top5Match,
      isTopSignal: !!top5Match?.isTopSignal,
      topRank: top5Match?.rank ?? null,
    };
  }

  if (sport === "SOCCER") {
    const direct = soccerSignals.games.find(
      (g) => String(g.gameId) === String(game.id)
    );
    const baseMatch =
      direct || soccerSignals.games.find((g) => isSameMatch(game, g)) || null;
    if (!baseMatch) return null;

    const top5Match =
      soccerTop5.top5.find((g) => isSameMatch(game, g)) || null;

    return {
      ...baseMatch,
      isTop5: !!top5Match,
      isTopSignal: !!top5Match?.isTopSignal,
      topRank: top5Match?.rank ?? null,
    };
  }

  return null;
}

function getShortTeamName(teamName: string) {
  const nicknameMap: Record<string, string> = {
    // NBA
    "Atlanta Hawks": "Hawks",
    "Boston Celtics": "Celtics",
    "Brooklyn Nets": "Nets",
    "Charlotte Hornets": "Hornets",
    "Chicago Bulls": "Bulls",
    "Cleveland Cavaliers": "Cavaliers",
    "Dallas Mavericks": "Mavericks",
    "Denver Nuggets": "Nuggets",
    "Detroit Pistons": "Pistons",
    "Golden State Warriors": "Warriors",
    "Houston Rockets": "Rockets",
    "Indiana Pacers": "Pacers",
    "LA Clippers": "Clippers",
    "Los Angeles Clippers": "Clippers",
    "Los Angeles Lakers": "Lakers",
    "Memphis Grizzlies": "Grizzlies",
    "Miami Heat": "Heat",
    "Milwaukee Bucks": "Bucks",
    "Minnesota Timberwolves": "Timberwolves",
    "New Orleans Pelicans": "Pelicans",
    "New York Knicks": "Knicks",
    "Oklahoma City Thunder": "Thunder",
    "Orlando Magic": "Magic",
    "Philadelphia 76ers": "76ers",
    "Phoenix Suns": "Suns",
    "Portland Trail Blazers": "Blazers",
    "Sacramento Kings": "Kings",
    "San Antonio Spurs": "Spurs",
    "Toronto Raptors": "Raptors",
    "Utah Jazz": "Jazz",
    "Washington Wizards": "Wizards",

    // NHL
    "Anaheim Ducks": "Ducks",
    "Boston Bruins": "Bruins",
    "Buffalo Sabres": "Sabres",
    "Calgary Flames": "Flames",
    "Carolina Hurricanes": "Hurricanes",
    "Chicago Blackhawks": "Blackhawks",
    "Colorado Avalanche": "Avalanche",
    "Columbus Blue Jackets": "Blue Jackets",
    "Dallas Stars": "Stars",
    "Detroit Red Wings": "Red Wings",
    "Edmonton Oilers": "Oilers",
    "Florida Panthers": "Panthers",
    "Los Angeles Kings": "Kings",
    "Minnesota Wild": "Wild",
    "Montreal Canadiens": "Canadiens",
    "Nashville Predators": "Predators",
    "New Jersey Devils": "Devils",
    "New York Islanders": "Islanders",
    "New York Rangers": "Rangers",
    "Ottawa Senators": "Senators",
    "Philadelphia Flyers": "Flyers",
    "Pittsburgh Penguins": "Penguins",
    "San Jose Sharks": "Sharks",
    "Seattle Kraken": "Kraken",
    "St. Louis Blues": "Blues",
    "Tampa Bay Lightning": "Lightning",
    "Toronto Maple Leafs": "Maple Leafs",
    "Utah Hockey Club": "Utah",
    "Vancouver Canucks": "Canucks",
    "Vegas Golden Knights": "Golden Knights",
    "Washington Capitals": "Capitals",
    "Winnipeg Jets": "Jets",

    // MLB
    "Arizona Diamondbacks": "Diamondbacks",
    "Atlanta Braves": "Braves",
    "Baltimore Orioles": "Orioles",
    "Boston Red Sox": "Red Sox",
    "Chicago Cubs": "Cubs",
    "Chicago White Sox": "White Sox",
    "Cincinnati Reds": "Reds",
    "Cleveland Guardians": "Guardians",
    "Colorado Rockies": "Rockies",
    "Detroit Tigers": "Tigers",
    "Houston Astros": "Astros",
    "Kansas City Royals": "Royals",
    "Los Angeles Angels": "Angels",
    "Los Angeles Dodgers": "Dodgers",
    "Miami Marlins": "Marlins",
    "Milwaukee Brewers": "Brewers",
    "Minnesota Twins": "Twins",
    "New York Mets": "Mets",
    "New York Yankees": "Yankees",
    "Oakland Athletics": "Athletics",
    "Philadelphia Phillies": "Phillies",
    "Pittsburgh Pirates": "Pirates",
    "San Diego Padres": "Padres",
    "San Francisco Giants": "Giants",
    "Seattle Mariners": "Mariners",
    "St. Louis Cardinals": "Cardinals",
    "Tampa Bay Rays": "Rays",
    "Texas Rangers": "Rangers",
    "Toronto Blue Jays": "Blue Jays",
    "Washington Nationals": "Nationals",

    // Soccer
    "Arsenal": "Arsenal",
    "Aston Villa": "Villa",
    "Atlético Madrid": "Atlético",
    "Atletico Madrid": "Atlético",
    "Barcelona": "Barcelona",
    "Bayern Munich": "Bayern",
    "Borussia Dortmund": "Dortmund",
    "Chelsea": "Chelsea",
    "Inter Miami CF": "Inter Miami",
    "Inter Miami": "Inter Miami",
    "Juventus": "Juventus",
    "Liverpool": "Liverpool",
    "Manchester City": "Man City",
    "Manchester United": "Man United",
    "Paris Saint-Germain": "PSG",
    "PSG": "PSG",
    "Real Madrid": "Real Madrid",
    "Tottenham Hotspur": "Tottenham",
  };

  return nicknameMap[teamName] ?? teamName;
}

function getTeamLogoUrl(teamName: string, sport: string) {
  const logoMap: Record<string, string> = {
    // NBA
    "Atlanta Hawks": "https://a.espncdn.com/i/teamlogos/nba/500/atl.png",
    "Boston Celtics": "https://a.espncdn.com/i/teamlogos/nba/500/bos.png",
    "Brooklyn Nets": "https://a.espncdn.com/i/teamlogos/nba/500/bkn.png",
    "Charlotte Hornets": "https://a.espncdn.com/i/teamlogos/nba/500/cha.png",
    "Chicago Bulls": "https://a.espncdn.com/i/teamlogos/nba/500/chi.png",
    "Cleveland Cavaliers": "https://a.espncdn.com/i/teamlogos/nba/500/cle.png",
    "Dallas Mavericks": "https://a.espncdn.com/i/teamlogos/nba/500/dal.png",
    "Denver Nuggets": "https://a.espncdn.com/i/teamlogos/nba/500/den.png",
    "Detroit Pistons": "https://a.espncdn.com/i/teamlogos/nba/500/det.png",
    "Golden State Warriors": "https://a.espncdn.com/i/teamlogos/nba/500/gs.png",
    "Houston Rockets": "https://a.espncdn.com/i/teamlogos/nba/500/hou.png",
    "Indiana Pacers": "https://a.espncdn.com/i/teamlogos/nba/500/ind.png",
    "LA Clippers": "https://a.espncdn.com/i/teamlogos/nba/500/lac.png",
    "Los Angeles Clippers": "https://a.espncdn.com/i/teamlogos/nba/500/lac.png",
    "Los Angeles Lakers": "https://a.espncdn.com/i/teamlogos/nba/500/lal.png",
    "Memphis Grizzlies": "https://a.espncdn.com/i/teamlogos/nba/500/mem.png",
    "Miami Heat": "https://a.espncdn.com/i/teamlogos/nba/500/mia.png",
    "Milwaukee Bucks": "https://a.espncdn.com/i/teamlogos/nba/500/mil.png",
    "Minnesota Timberwolves": "https://a.espncdn.com/i/teamlogos/nba/500/min.png",
    "New Orleans Pelicans": "https://a.espncdn.com/i/teamlogos/nba/500/no.png",
    "New York Knicks": "https://a.espncdn.com/i/teamlogos/nba/500/ny.png",
    "Oklahoma City Thunder": "https://a.espncdn.com/i/teamlogos/nba/500/okc.png",
    "Orlando Magic": "https://a.espncdn.com/i/teamlogos/nba/500/orl.png",
    "Philadelphia 76ers": "https://a.espncdn.com/i/teamlogos/nba/500/phi.png",
    "Phoenix Suns": "https://a.espncdn.com/i/teamlogos/nba/500/phx.png",
    "Portland Trail Blazers": "https://a.espncdn.com/i/teamlogos/nba/500/por.png",
    "Sacramento Kings": "https://a.espncdn.com/i/teamlogos/nba/500/sac.png",
    "San Antonio Spurs": "https://a.espncdn.com/i/teamlogos/nba/500/sa.png",
    "Toronto Raptors": "https://a.espncdn.com/i/teamlogos/nba/500/tor.png",
    "Utah Jazz": "https://a.espncdn.com/i/teamlogos/nba/500/utah.png",
    "Washington Wizards": "https://a.espncdn.com/i/teamlogos/nba/500/wsh.png",

    // NHL
    "Anaheim Ducks": "https://a.espncdn.com/i/teamlogos/nhl/500/ana.png",
    "Boston Bruins": "https://a.espncdn.com/i/teamlogos/nhl/500/bos.png",
    "Buffalo Sabres": "https://a.espncdn.com/i/teamlogos/nhl/500/buf.png",
    "Calgary Flames": "https://a.espncdn.com/i/teamlogos/nhl/500/cgy.png",
    "Carolina Hurricanes": "https://a.espncdn.com/i/teamlogos/nhl/500/car.png",
    "Chicago Blackhawks": "https://a.espncdn.com/i/teamlogos/nhl/500/chi.png",
    "Colorado Avalanche": "https://a.espncdn.com/i/teamlogos/nhl/500/col.png",
    "Columbus Blue Jackets": "https://a.espncdn.com/i/teamlogos/nhl/500/cbj.png",
    "Dallas Stars": "https://a.espncdn.com/i/teamlogos/nhl/500/dal.png",
    "Detroit Red Wings": "https://a.espncdn.com/i/teamlogos/nhl/500/det.png",
    "Edmonton Oilers": "https://a.espncdn.com/i/teamlogos/nhl/500/edm.png",
    "Florida Panthers": "https://a.espncdn.com/i/teamlogos/nhl/500/fla.png",
    "Los Angeles Kings": "https://a.espncdn.com/i/teamlogos/nhl/500/la.png",
    "Minnesota Wild": "https://a.espncdn.com/i/teamlogos/nhl/500/min.png",
    "Montreal Canadiens": "https://a.espncdn.com/i/teamlogos/nhl/500/mtl.png",
    "Nashville Predators": "https://a.espncdn.com/i/teamlogos/nhl/500/nsh.png",
    "New Jersey Devils": "https://a.espncdn.com/i/teamlogos/nhl/500/nj.png",
    "New York Islanders": "https://a.espncdn.com/i/teamlogos/nhl/500/nyi.png",
    "New York Rangers": "https://a.espncdn.com/i/teamlogos/nhl/500/nyr.png",
    "Ottawa Senators": "https://a.espncdn.com/i/teamlogos/nhl/500/ott.png",
    "Philadelphia Flyers": "https://a.espncdn.com/i/teamlogos/nhl/500/phi.png",
    "Pittsburgh Penguins": "https://a.espncdn.com/i/teamlogos/nhl/500/pit.png",
    "San Jose Sharks": "https://a.espncdn.com/i/teamlogos/nhl/500/sj.png",
    "Seattle Kraken": "https://a.espncdn.com/i/teamlogos/nhl/500/sea.png",
    "St. Louis Blues": "https://a.espncdn.com/i/teamlogos/nhl/500/stl.png",
    "Tampa Bay Lightning": "https://a.espncdn.com/i/teamlogos/nhl/500/tb.png",
    "Toronto Maple Leafs": "https://a.espncdn.com/i/teamlogos/nhl/500/tor.png",
    "Utah Hockey Club": "https://a.espncdn.com/i/teamlogos/nhl/500/uta.png",
    "Vancouver Canucks": "https://a.espncdn.com/i/teamlogos/nhl/500/van.png",
    "Vegas Golden Knights": "https://a.espncdn.com/i/teamlogos/nhl/500/vgk.png",
    "Washington Capitals": "https://a.espncdn.com/i/teamlogos/nhl/500/wsh.png",
    "Winnipeg Jets": "https://a.espncdn.com/i/teamlogos/nhl/500/wpg.png",

    // MLB
    "Arizona Diamondbacks": "https://a.espncdn.com/i/teamlogos/mlb/500/ari.png",
    "Atlanta Braves": "https://a.espncdn.com/i/teamlogos/mlb/500/atl.png",
    "Baltimore Orioles": "https://a.espncdn.com/i/teamlogos/mlb/500/bal.png",
    "Boston Red Sox": "https://a.espncdn.com/i/teamlogos/mlb/500/bos.png",
    "Chicago Cubs": "https://a.espncdn.com/i/teamlogos/mlb/500/chc.png",
    "Chicago White Sox": "https://a.espncdn.com/i/teamlogos/mlb/500/chw.png",
    "Cincinnati Reds": "https://a.espncdn.com/i/teamlogos/mlb/500/cin.png",
    "Cleveland Guardians": "https://a.espncdn.com/i/teamlogos/mlb/500/cle.png",
    "Colorado Rockies": "https://a.espncdn.com/i/teamlogos/mlb/500/col.png",
    "Detroit Tigers": "https://a.espncdn.com/i/teamlogos/mlb/500/det.png",
    "Houston Astros": "https://a.espncdn.com/i/teamlogos/mlb/500/hou.png",
    "Kansas City Royals": "https://a.espncdn.com/i/teamlogos/mlb/500/kc.png",
    "Los Angeles Angels": "https://a.espncdn.com/i/teamlogos/mlb/500/laa.png",
    "Los Angeles Dodgers": "https://a.espncdn.com/i/teamlogos/mlb/500/lad.png",
    "Miami Marlins": "https://a.espncdn.com/i/teamlogos/mlb/500/mia.png",
    "Milwaukee Brewers": "https://a.espncdn.com/i/teamlogos/mlb/500/mil.png",
    "Minnesota Twins": "https://a.espncdn.com/i/teamlogos/mlb/500/min.png",
    "New York Mets": "https://a.espncdn.com/i/teamlogos/mlb/500/nym.png",
    "New York Yankees": "https://a.espncdn.com/i/teamlogos/mlb/500/nyy.png",
    "Oakland Athletics": "https://a.espncdn.com/i/teamlogos/mlb/500/oak.png",
    "Philadelphia Phillies": "https://a.espncdn.com/i/teamlogos/mlb/500/phi.png",
    "Pittsburgh Pirates": "https://a.espncdn.com/i/teamlogos/mlb/500/pit.png",
    "San Diego Padres": "https://a.espncdn.com/i/teamlogos/mlb/500/sd.png",
    "San Francisco Giants": "https://a.espncdn.com/i/teamlogos/mlb/500/sf.png",
    "Seattle Mariners": "https://a.espncdn.com/i/teamlogos/mlb/500/sea.png",
    "St. Louis Cardinals": "https://a.espncdn.com/i/teamlogos/mlb/500/stl.png",
    "Tampa Bay Rays": "https://a.espncdn.com/i/teamlogos/mlb/500/tb.png",
    "Texas Rangers": "https://a.espncdn.com/i/teamlogos/mlb/500/tex.png",
    "Toronto Blue Jays": "https://a.espncdn.com/i/teamlogos/mlb/500/tor.png",
    "Washington Nationals": "https://a.espncdn.com/i/teamlogos/mlb/500/wsh.png",
  };

  return logoMap[teamName] ?? null;
}

  const lastTwo = words.slice(-2).join(" ");
  if (twoWordNicknames.has(lastTwo)) return lastTwo;

  return words[words.length - 1];
}

function getTeamAbbreviation(teamName: string) {
  const words = String(teamName ?? "")
    .replace(/[.'’-]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "TM";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function TeamBadge({
  teamName,
  sport,
}: {
  teamName: string;
  sport: string;
}) {
  const logoUrl = getTeamLogoUrl(teamName, sport);

  if (logoUrl) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 p-1.5">
        <img
          src={logoUrl}
          alt={teamName}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[11px] font-bold tracking-[0.12em] text-white/75">
      {getTeamAbbreviation(teamName)}
    </div>
  );
}

export default function Home() {
  const [selectedSport, setSelectedSport] = useState<SportTab>("NHL");
  const [games, setGames] = useState<OddsGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPlan] = useState<"free" | "regular" | "premium">("premium");

  const topSignals: TopSignalCard[] = useMemo(
    () =>
      [
        mlbTop5.top5?.[0]
          ? { ...(mlbTop5.top5[0] as Top5Entry), sport: "MLB" as const }
          : null,
        nbaTop5.top5?.[0]
          ? { ...(nbaTop5.top5[0] as Top5Entry), sport: "NBA" as const }
          : null,
        nhlTop5.top5?.[0]
          ? { ...(nhlTop5.top5[0] as Top5Entry), sport: "NHL" as const }
          : null,
        soccerTop5.top5?.[0]
          ? { ...(soccerTop5.top5[0] as Top5Entry), sport: "SOCCER" as const }
          : null,
      ].filter((pick): pick is TopSignalCard => Boolean(pick)),
    []
  );

  useEffect(() => {
    async function loadGames() {
      try {
        setLoading(true);

        if (selectedSport === "TOP") {
          setGames([]);
          return;
        }

        if (selectedSport === "SOCCER") {
          const soccerLeagues = [
            "soccer_epl",
            "soccer_spain_la_liga",
            "soccer_italy_serie_a",
            "soccer_germany_bundesliga",
            "soccer_france_ligue_one",
            "soccer_uefa_champs_league",
            "soccer_uefa_europa_league",
            "soccer_uefa_europa_conference_league",
            "soccer_usa_mls",
            "soccer_mexico_ligamx",
            "soccer_fa_cup",
            "soccer_spain_copa_del_rey",
          ];

          const responses = await Promise.all(
            soccerLeagues.map(async (league) => {
              const res = await fetch(`/api/odds?sport=${league}`, {
                cache: "no-store",
              });

              const data = await res.json();
              return Array.isArray(data) ? (data as OddsGame[]) : [];
            })
          );

          const allSoccerGames = responses.flat();
          const now = new Date();

          const filteredSoccerGames = allSoccerGames.filter((game) => {
            const gameDate = new Date(game.commence_time);
            const diffHours =
              (gameDate.getTime() - now.getTime()) / (1000 * 60 * 60);

            return diffHours >= -6 && diffHours <= 18;
          });

          setGames(filteredSoccerGames);
          return;
        }

        const regularSportMap: Record<
          Exclude<SportTab, "TOP" | "SOCCER">,
          string
        > = {
          NHL: "icehockey_nhl",
          NBA: "basketball_nba",
          MLB: "baseball_mlb",
          NFL: "americanfootball_nfl",
        };

        const sport =
          regularSportMap[
            selectedSport as Exclude<SportTab, "TOP" | "SOCCER">
          ];

        const res = await fetch(`/api/odds?sport=${sport}`, {
          cache: "no-store",
        });

        const data = await res.json();
        setGames(Array.isArray(data) ? (data as OddsGame[]) : []);
      } catch (error) {
        setGames([]);
      } finally {
        setLoading(false);
      }
    }

    loadGames();
  }, [selectedSport]);

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
        <header className="sticky top-0 z-20 border-b border-white/5 bg-[#050816]/95 px-4 pb-4 pt-5 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-400/90">
                Atlas Sportsbook
              </p>
              <h1 className="mt-1 text-[40px] font-bold leading-none tracking-tight">
                Signals
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-black">
                Odds
              </button>
              <button className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/70">
                Live
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {sportsTabs.map((sport) => (
              <button
                key={sport}
                onClick={() => setSelectedSport(sport)}
                className={`min-w-[88px] whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  selectedSport === sport
                    ? "bg-cyan-500 text-black"
                    : "bg-white/10 text-white/70"
                }`}
              >
                {sport}
              </button>
            ))}
          </div>
        </header>

        <section className="flex-1 space-y-3 px-4 py-4">
          {loading ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
              Loading {selectedSport} games...
            </div>
          ) : selectedSport === "TOP" ? (
            <div className="space-y-3">
              {topSignals.map((pick, idx) => (
  <div
    key={`top-${idx}`}
    className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
  >
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-yellow-400/95">
        Top Signal {pick.sport}
      </p>
      {pick.startTime && (
        <p className="mt-2 text-[13px] font-medium text-white/55">
          {formatTime(pick.startTime)}
        </p>
      )}
    </div>

    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[11px] font-bold tracking-[0.12em] text-white/75">
        {String(pick.awayTeam ?? "").slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[16px] font-semibold tracking-tight text-white">
          {pick.awayTeam}
        </p>
      </div>
    </div>

    <div className="mt-4 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[11px] font-bold tracking-[0.12em] text-white/75">
        {String(pick.homeTeam ?? "").slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[16px] font-semibold tracking-tight text-white">
          {pick.homeTeam}
        </p>
      </div>
    </div>

    <div className="mt-5 rounded-[20px] border border-cyan-400/25 bg-cyan-400/10 p-3">
      <div className="mb-2 inline-flex rounded-full bg-cyan-300/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
        Signal Detected
      </div>

      <p className="text-[20px] font-semibold leading-tight tracking-tight text-cyan-300">
        {formatDisplayedPick(pick.pick, pick.sport)}
      </p>

      <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">
        {pick.status ?? "PENDING"}
      </p>
    </div>
  </div>
))}
            </div>
          ) : games.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
              No games available for {selectedSport}.
            </div>
          ) : (
            games.map((game) => {
              const homeOdds = getMoneyline(game, game.home_team);
              const awayOdds = getMoneyline(game, game.away_team);
              const awaySpread = getSpreadValue(game, game.away_team);
              const homeSpread = getSpreadValue(game, game.home_team);
              const totalValues = getTotalValues(game);
              const pickData = findPick(game, selectedSport);

              return (
                <article
                  key={game.id}
                  className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
                >
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
                      {selectedSport}
                    </p>
                    <p className="mt-2 text-[13px] font-medium text-white/55">
                      {formatTime(game.commence_time)}
                    </p>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-4">
                      <div className="flex items-center gap-3">
                        <TeamBadge teamName={game.away_team} sport={selectedSport} />
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                            {getShortTeamName(game.away_team)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <TeamBadge teamName={game.home_team} sport={selectedSport} />
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                            {getShortTeamName(game.home_team)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid shrink-0 grid-cols-3 gap-1.5">
                      <div className="flex flex-col gap-2">
                        <div className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
                          Spread
                        </div>
                        <div className="w-[64px] rounded-xl border border-white/8 bg-white/10 px-2 py-2 text-center text-[13px] font-semibold text-white">
                          {awaySpread}
                        </div>
                        <div className="w-[64px] rounded-xl border border-white/8 bg-white/10 px-2 py-2 text-center text-[13px] font-semibold text-white">
                          {homeSpread}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300/70">
                          Total
                        </div>
                        <div className="w-[64px] rounded-xl border border-white/8 bg-white/10 px-2 py-2 text-center text-[13px] font-semibold text-white">
                          {totalValues.overLabel}
                        </div>
                        <div className="w-[64px] rounded-xl border border-white/8 bg-white/10 px-2 py-2 text-center text-[13px] font-semibold text-white">
                          {totalValues.underLabel}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
                          ML
                        </div>
                        <div className="w-[72px] rounded-xl border border-white/8 bg-white/10 px-3 py-2 text-center text-[14px] font-semibold text-white">
                          {awayOdds ?? "N/A"}
                        </div>
                        <div className="w-[72px] rounded-xl border border-white/8 bg-white/10 px-3 py-2 text-center text-[14px] font-semibold text-white">
                          {homeOdds ?? "N/A"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {pickData ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-[20px] border border-cyan-400/25 bg-cyan-400/10 p-3">
                        <div className="mb-2 inline-flex rounded-full bg-cyan-300/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                          Signal Detected
                        </div>

                        <p className="text-[17px] font-semibold leading-tight tracking-tight text-white">
                          {formatDisplayedPick(pickData.pick, selectedSport)}
                        </p>

                        <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">
                          {pickData.status ?? "PENDING"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {pickData.isTop5 && userPlan === "regular" && (
                          <span className="inline-flex rounded-full bg-yellow-500/18 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-yellow-300">
                            Top 5
                          </span>
                        )}

                        {pickData.isTopSignal && userPlan === "premium" && (
                          <span className="inline-flex rounded-full bg-purple-500/18 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-purple-300">
                            Top Signal #{pickData.topRank ?? 1}
                          </span>
                        )}

                        {pickData.isTop5 &&
                          !pickData.isTopSignal &&
                          userPlan === "premium" && (
                            <span className="inline-flex rounded-full bg-yellow-500/18 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-yellow-300">
                              Top 5 #{pickData.topRank ?? ""}
                            </span>
                          )}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>

        <nav className="sticky bottom-0 border-t border-white/10 bg-[#050816]/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-md items-center justify-around px-4 py-4 text-xs">
            <button className="font-semibold text-cyan-400">Signals</button>
            <button className="text-white/50">News</button>
            <button className="text-white/50">Following</button>
            <button className="text-white/50">More</button>
          </div>
        </nav>
      </div>
    </main>
  );
}