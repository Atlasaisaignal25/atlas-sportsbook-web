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
import { teamBranding } from "./lib/teamBranding";

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

type LiveScore = {
  id: string;
  sport_key: string;
  sport_title?: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  completed?: boolean;
  scores?: Array<{
    name: string;
    score: string;
  }>;
};

const mlbSignalsData = mlbSignals as { games: SignalGame[] };
const nbaSignalsData = nbaSignals as { games: SignalGame[] };
const nhlSignalsData = nhlSignals as { games: SignalGame[] };
const soccerSignalsData = soccerSignals as { games: SignalGame[] };

const mlbTop5Data = mlbTop5 as { top5: Top5Entry[] };
const nbaTop5Data = nbaTop5 as { top5: Top5Entry[] };
const nhlTop5Data = nhlTop5 as { top5: Top5Entry[] };
const soccerTop5Data = soccerTop5 as { top5: Top5Entry[] };

const sportsTabs = ["TOP", "NHL", "NBA", "MLB", "NFL", "SOCCER"] as const;
type SportTab = (typeof sportsTabs)[number];

function getTeamData(teamName: string) {
  return teamBranding[teamName] ?? null;
}

function getDisplayName(teamName: string) {
  return getTeamData(teamName)?.shortName ?? teamName;
}

function getDisplayAbbr(teamName: string) {
  return getTeamData(teamName)?.abbr ?? teamName.slice(0, 3).toUpperCase();
}

function getLogo(teamName: string, sport: SportTab) {
  const cleanName = String(teamName)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (sport === "NBA") {
    return `/team-logos/nba/${cleanName}.png`;
  }

  if (sport === "NHL") {
    return `/team-logos/nhl/${cleanName}.png`;
  }

  if (sport === "MLB") {
    return `/team-logos/mlb/${cleanName}.png`;
  }

  if (sport === "SOCCER") {
    return `/team-logos/soccer/${cleanName}.png`;
  }

  return null;
}

function TeamBadge({
  teamName,
  sport,
}: {
  teamName: string;
  sport: SportTab;
}) {
  const logo = getLogo(teamName, sport);

  if (logo) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 p-1">
        <img
          src={logo}
          alt={teamName}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[10px] font-bold text-white/70">
      {getDisplayAbbr(teamName)}
    </div>
  );
}

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

function formatAmericanOdds(value?: number | null) {
  if (value === null || value === undefined) return "N/A";
  return value > 0 ? `+${value}` : `${value}`;
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
  if (outcome.point === undefined) return "N/A";

  return outcome.point > 0 ? `+${outcome.point}` : `${outcome.point}`;
}

function getSpreadPrice(game: OddsGame, teamName: string) {
  const market = getMarket(game, "spreads");
  const outcome = market?.outcomes?.find((o) => o.name === teamName);
  return formatAmericanOdds(outcome?.price);
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

function getTotalPrices(game: OddsGame) {
  const market = getMarket(game, "totals");

  if (!market) {
    return {
      overPrice: "N/A",
      underPrice: "N/A",
    };
  }

  const over = market.outcomes.find((o) => o.name === "Over");
  const under = market.outcomes.find((o) => o.name === "Under");

  return {
    overPrice: formatAmericanOdds(over?.price),
    underPrice: formatAmericanOdds(under?.price),
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

function getLiveSportFromKey(sportKey: string): SportTab {
  if (sportKey.includes("basketball")) return "NBA";
  if (sportKey.includes("icehockey")) return "NHL";
  if (sportKey.includes("baseball")) return "MLB";
  return "SOCCER";
}

function getLeagueDisplayName(sportKey: string) {
  const leagueMap: Record<string, string> = {
    basketball_nba: "NBA (Estados Unidos)",
    icehockey_nhl: "NHL (Estados Unidos)",
    baseball_mlb: "MLB (Estados Unidos)",
    soccer_epl: "Premier League (Inglaterra)",
    soccer_spain_la_liga: "La Liga (España)",
    soccer_italy_serie_a: "Serie A (Italia)",
    soccer_germany_bundesliga: "Bundesliga (Alemania)",
    soccer_france_ligue_one: "Ligue 1 (Francia)",
    soccer_usa_mls: "MLS (Estados Unidos)",
    soccer_mexico_ligamx: "Liga MX (México)",
    soccer_uefa_champs_league: "Champions League",
    soccer_uefa_europa_league: "Europa League",
    soccer_uefa_europa_conference_league: "Conference League",
  };

  return (
    leagueMap[sportKey] ??
    sportKey.replace(/^soccer_/, "").replace(/_/g, " ").toUpperCase()
  );
}

function getDayKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelativeDayKey(offset: -1 | 0 | 1) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return getDayKey(d);
}

function getGameDayKey(dateString: string) {
  const d = new Date(dateString);
  return getDayKey(d);
}

function isGameLive(game: LiveScore) {
  return !game.completed && Array.isArray(game.scores) && game.scores.length > 0;
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
    const direct = mlbSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );
    const baseMatch =
      direct || mlbSignalsData.games.find((g) => isSameMatch(game, g)) || null;
    if (!baseMatch) return null;

    const top5Match =
      mlbTop5Data.top5.find((g) => isSameMatch(game, g)) || null;

    return {
      ...baseMatch,
      isTop5: !!top5Match,
      isTopSignal: !!top5Match?.isTopSignal,
      topRank: top5Match?.rank ?? null,
    };
  }

  if (sport === "NBA") {
    const direct = nbaSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );
    const baseMatch =
      direct || nbaSignalsData.games.find((g) => isSameMatch(game, g)) || null;
    if (!baseMatch) return null;

    const top5Match =
      nbaTop5Data.top5.find((g) => isSameMatch(game, g)) || null;

    return {
      ...baseMatch,
      isTop5: !!top5Match,
      isTopSignal: !!top5Match?.isTopSignal,
      topRank: top5Match?.rank ?? null,
    };
  }

  if (sport === "NHL") {
    const direct = nhlSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );
    const baseMatch =
      direct || nhlSignalsData.games.find((g) => isSameMatch(game, g)) || null;
    if (!baseMatch) return null;

    const top5Match =
      nhlTop5Data.top5.find((g) => isSameMatch(game, g)) || null;

    return {
      ...baseMatch,
      isTop5: !!top5Match,
      isTopSignal: !!top5Match?.isTopSignal,
      topRank: top5Match?.rank ?? null,
    };
  }

  if (sport === "SOCCER") {
    const direct = soccerSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );
    const baseMatch =
      direct || soccerSignalsData.games.find((g) => isSameMatch(game, g)) || null;
    if (!baseMatch) return null;

    const top5Match =
      soccerTop5Data.top5.find((g) => isSameMatch(game, g)) || null;

    return {
      ...baseMatch,
      isTop5: !!top5Match,
      isTopSignal: !!top5Match?.isTopSignal,
      topRank: top5Match?.rank ?? null,
    };
  }

  return null;
}

export default function Home() {
  const [selectedSport, setSelectedSport] = useState<SportTab>("NHL");
  const [games, setGames] = useState<OddsGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPlan] = useState<"free" | "regular" | "premium">("premium");

const [viewMode, setViewMode] = useState<"odds" | "live">("odds");
const [liveGames, setLiveGames] = useState<LiveScore[]>([]);
const [liveLoading, setLiveLoading] = useState(false);
const [activeDay, setActiveDay] = useState<"yesterday" | "today" | "tomorrow">("today");

  const topSignals: TopSignalCard[] = useMemo(
  () =>
    [
      mlbTop5Data.top5?.[0]
        ? { ...(mlbTop5Data.top5[0] as Top5Entry), sport: "MLB" as const }
        : null,
      nbaTop5Data.top5?.[0]
        ? { ...(nbaTop5Data.top5[0] as Top5Entry), sport: "NBA" as const }
        : null,
      nhlTop5Data.top5?.[0]
        ? { ...(nhlTop5Data.top5[0] as Top5Entry), sport: "NHL" as const }
        : null,
      soccerTop5Data.top5?.[0]
        ? { ...(soccerTop5Data.top5[0] as Top5Entry), sport: "SOCCER" as const }
        : null,
    ].filter((pick): pick is TopSignalCard => Boolean(pick)),
  []
);

const groupedLiveGames = useMemo(() => {
  const groups: Record<string, LiveScore[]> = {};

  liveGames.forEach((game) => {
    const key = game.sport_key || "unknown";

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(game);
  });

  return Object.entries(groups).map(([leagueKey, games]) => ({
    leagueKey,
    title: getLeagueDisplayName(leagueKey),
    sport: getLiveSportFromKey(leagueKey),
    games,
  }));
}, [liveGames]);

const filteredLiveGames = useMemo(() => {
  const todayKey = getRelativeDayKey(0);
  const yesterdayKey = getRelativeDayKey(-1);
  const tomorrowKey = getRelativeDayKey(1);

  const targetDayKey =
    activeDay === "today"
      ? todayKey
      : activeDay === "yesterday"
        ? yesterdayKey
        : tomorrowKey;

  return liveGames.filter((game) => {
    const gameDayKey = getGameDayKey(game.commence_time);
    const live = isGameLive(game);

    if (activeDay === "today") {
      return gameDayKey === todayKey || live;
    }

    return gameDayKey === targetDayKey;
  });
}, [liveGames, activeDay]);

const groupedFilteredLiveGames = useMemo(() => {
  const groups: Record<string, LiveScore[]> = {};

  filteredLiveGames.forEach((game) => {
    const key = game.sport_key || "unknown";

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(game);
  });

  return Object.entries(groups).map(([leagueKey, games]) => ({
    leagueKey,
    title: getLeagueDisplayName(leagueKey),
    sport: getLiveSportFromKey(leagueKey),
    games,
  }));
}, [filteredLiveGames]);

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

  if (viewMode === "odds") {
    loadGames();
  }
}, [selectedSport, viewMode]);

useEffect(() => {
  async function loadLiveGames() {
    if (viewMode !== "live") return;

    try {
      setLiveLoading(true);

      const sportForLive =
        selectedSport === "TOP" || selectedSport === "NFL"
          ? "NBA"
          : selectedSport;

      const res = await fetch(`/api/scores?sport=${sportForLive}`, {
        cache: "no-store",
      });

      const data = await res.json();
      setLiveGames(Array.isArray(data) ? data : []);
    } catch (error) {
      setLiveGames([]);
    } finally {
      setLiveLoading(false);
    }
  }

  loadLiveGames();
}, [viewMode, selectedSport]);

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
            <button
              onClick={() => setViewMode("odds")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                viewMode === "odds"
                  ? "bg-cyan-500 text-black"
                  : "bg-white/10 text-white/70"
              }`}
            >
              Odds
            </button>

            <button
              onClick={() => setViewMode("live")}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                viewMode === "live"
                  ? "bg-cyan-500 text-black"
                  : "bg-white/10 text-white/70"
              }`}
            >
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
        {viewMode === "live" ? (
  <>
    <div className="mb-1 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <button
        onClick={() => setActiveDay("yesterday")}
        className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
          activeDay === "yesterday"
            ? "bg-cyan-500 text-black"
            : "bg-white/10 text-white/65"
        }`}
      >
        Yesterday
      </button>

      <button
        onClick={() => setActiveDay("today")}
        className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
          activeDay === "today"
            ? "bg-cyan-500 text-black"
            : "bg-white/10 text-white/65"
        }`}
      >
        Today
      </button>

      <button
        onClick={() => setActiveDay("tomorrow")}
        className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
          activeDay === "tomorrow"
            ? "bg-cyan-500 text-black"
            : "bg-white/10 text-white/65"
        }`}
      >
        Tomorrow
      </button>
    </div>

    {liveLoading ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
              Loading live games...
            </div>
          ) : groupedFilteredLiveGames.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
              No live games available.
            </div>
          ) : (
            <div className="space-y-4">
              {groupedFilteredLiveGames.map((group) => (
                <article
                  key={group.leagueKey}
                  className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]"
                >
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="text-[15px] font-semibold tracking-tight text-white">
                      {group.title}
                    </p>
                  </div>

                  <div>
                    {group.games.map((game, idx) => {
                      const awayScore =
                        game.scores?.find((s) => s.name === game.away_team)
                          ?.score ?? "-";
                      const homeScore =
                        game.scores?.find((s) => s.name === game.home_team)
                          ?.score ?? "-";

                      return (
  <div
    key={`${game.id}-${idx}`}
    className={`px-4 py-4 ${
      idx !== group.games.length - 1 ? "border-b border-white/10" : ""
    }`}
  >
    {/* FILA PRINCIPAL */}
    <div className="flex items-center justify-between">
      
      {/* EQUIPO IZQUIERDA */}
      <div className="flex items-center gap-2.5 min-w-0 w-[40%]">
        <TeamBadge teamName={game.away_team} sport={group.sport} />
        <p className="truncate text-[14px] font-medium text-white">
          {game.away_team}
        </p>
      </div>

      {/* CENTRO */}
      <div className="flex flex-col items-center justify-center w-[20%]">
        <span className="text-[12px] font-medium text-white/60">
          {game.completed ? "FINAL" : formatTime(game.commence_time)}
        </span>

        <div className="flex items-center gap-2 mt-1">
          <span className="text-[16px] font-bold">{awayScore}</span>
          <span className="text-white/50">-</span>
          <span className="text-[16px] font-bold">{homeScore}</span>
        </div>
      </div>

      {/* EQUIPO DERECHA */}
      <div className="flex items-center justify-end gap-2.5 min-w-0 w-[40%] text-right">
        <p className="truncate text-[14px] font-medium text-white">
          {game.home_team}
        </p>
        <TeamBadge teamName={game.home_team} sport={group.sport} />
      </div>
    </div>

    {/* ODDS / LIVE BET */}
    <div className="mt-3 flex justify-center gap-3">
      <div className="rounded-full bg-black/60 px-3 py-1.5 text-[12px]">
        -203
      </div>

      <div className="rounded-full bg-black/60 px-3 py-1.5 text-[12px]">
        O/U 6
      </div>

      <div className="rounded-full bg-black/60 px-3 py-1.5 text-[12px]">
        +164
      </div>
    </div>
  </div>
);
                    })}
                  </div>
                </article>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
            Loading {selectedSport} games...
          </div>
        ) : selectedSport === "TOP" ? (
          <div className="space-y-3">
            {topSignals.map((pick, idx) => (
              <article
                key={`top-${idx}`}
                className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
              >
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-yellow-400/95">
                    Top Signal {pick.sport}
                  </p>
                  {pick.startTime && (
                    <p className="mt-2 text-[13px] font-medium text-white/55">
                      {formatTime(pick.startTime)}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <TeamBadge
                      teamName={pick.awayTeam ?? ""}
                      sport={pick.sport}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                        {getDisplayAbbr(pick.awayTeam ?? "")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <TeamBadge
                      teamName={pick.homeTeam ?? ""}
                      sport={pick.sport}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                        {getDisplayAbbr(pick.homeTeam ?? "")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[20px] border border-cyan-400/25 bg-cyan-400/10 p-4">
                  <div className="mb-3 inline-flex rounded-full bg-cyan-300/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                    Signal Detected
                  </div>

                  <p className="text-[20px] font-semibold leading-tight tracking-tight text-white">
                    {formatDisplayedPick(pick.pick, pick.sport)}
                  </p>

                  <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.08em] text-white/55">
                    {pick.status ?? "PENDING"}
                  </p>
                </div>
              </article>
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
            const awaySpreadPrice = getSpreadPrice(game, game.away_team);
            const homeSpreadPrice = getSpreadPrice(game, game.home_team);
            const totalValues = getTotalValues(game);
            const totalPrices = getTotalPrices(game);
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

                <div className="mt-2">
                  <div className="mb-2 grid grid-cols-[128px_70px_70px_70px] gap-x-[6px]">
                    <div />
                    <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Spread
                    </div>
                    <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/75">
                      Total
                    </div>
                    <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      ML
                    </div>
                  </div>

                  <div className="grid grid-cols-[128px_70px_70px_70px] gap-x-[6px] gap-y-[8px] items-center">
                    <div className="flex items-center gap-2.5">
                      <TeamBadge teamName={game.away_team} sport={selectedSport} />
                      <p className="truncate text-[16px] font-medium tracking-tight text-white">
                        {getDisplayAbbr(game.away_team)}
                      </p>
                    </div>

                    <div className="flex h-[64px] w-[70px] flex-col items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                      <span className="text-[13px] font-semibold leading-none text-white">
                        {awaySpread}
                      </span>
                      <span className="mt-1 text-[10px] font-semibold leading-none text-[#8f7cff]">
                        {awaySpreadPrice}
                      </span>
                    </div>

                    <div className="flex h-[64px] w-[70px] flex-col items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                      <span className="text-[13px] font-semibold leading-none text-white">
                        {totalValues.overLabel}
                      </span>
                      <span className="mt-1 text-[10px] font-semibold leading-none text-[#8f7cff]">
                        {totalPrices.overPrice}
                      </span>
                    </div>

                    <div className="flex h-[64px] w-[70px] items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                      <span className="text-[13px] font-semibold leading-none text-[#8f7cff]">
                        {awayOdds !== null ? formatAmericanOdds(awayOdds) : "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <TeamBadge teamName={game.home_team} sport={selectedSport} />
                      <p className="truncate text-[16px] font-medium tracking-tight text-white">
                        {getDisplayAbbr(game.home_team)}
                      </p>
                    </div>

                    <div className="flex h-[64px] w-[70px] flex-col items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                      <span className="text-[13px] font-semibold leading-none text-white">
                        {homeSpread}
                      </span>
                      <span className="mt-1 text-[10px] font-semibold leading-none text-[#8f7cff]">
                        {homeSpreadPrice}
                      </span>
                    </div>

                    <div className="flex h-[64px] w-[70px] flex-col items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                      <span className="text-[13px] font-semibold leading-none text-white">
                        {totalValues.underLabel}
                      </span>
                      <span className="mt-1 text-[10px] font-semibold leading-none text-[#8f7cff]">
                        {totalPrices.underPrice}
                      </span>
                    </div>

                    <div className="flex h-[64px] w-[70px] items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.08] text-center">
                      <span className="text-[13px] font-semibold leading-none text-[#8f7cff]">
                        {homeOdds !== null ? formatAmericanOdds(homeOdds) : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {pickData ? (
                  <div className="mt-5 space-y-3">
                    <div className="rounded-[22px] border border-cyan-400/25 bg-cyan-400/10 p-4">
                      <div className="mb-3 inline-flex rounded-full bg-cyan-300/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                        Signal Detected
                      </div>

                      <p className="text-[17px] font-semibold leading-tight tracking-tight text-white">
                        {formatDisplayedPick(pickData.pick, selectedSport)}
                      </p>

                      <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">
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