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

function getMoneyline(game: OddsGame, teamName: string) {
  const bookmaker =
    game.bookmakers?.find((b) => b.key === "draftkings") ||
    game.bookmakers?.[0];

  const market = bookmaker?.markets?.find((m) => m.key === "h2h");
  const outcome = market?.outcomes?.find((o) => o.name === teamName);

  return outcome?.price ?? null;
}

function getTotal(game: OddsGame) {
  const bookmaker =
    game.bookmakers?.find((b) => b.key === "draftkings") ||
    game.bookmakers?.[0];

  const market = bookmaker?.markets?.find((m) => m.key === "totals");

  if (!market) return "N/A";

  const over = market.outcomes.find((o) => o.name === "Over");
  const under = market.outcomes.find((o) => o.name === "Under");

  if (!over || !under) return "N/A";

  return `O ${over.point} / U ${under.point}`;
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

function findPick(game: OddsGame, sport: string) {
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

const sportsMap = {
  NHL: "icehockey_nhl",
  NBA: "basketball_nba",
  MLB: "baseball_mlb",
  NFL: "americanfootball_nfl",
  SOCCER: "soccer_epl",
} as const;

const sportsTabs = ["TOP", "NHL", "NBA", "MLB", "NFL", "SOCCER"] as const;
type SportTab = (typeof sportsTabs)[number];
type SportsMapKey = keyof typeof sportsMap;

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

    const regularSportMap: Record<Exclude<SportTab, "TOP" | "SOCCER">, string> = {
      NHL: "icehockey_nhl",
      NBA: "basketball_nba",
      MLB: "baseball_mlb",
      NFL: "americanfootball_nfl",
    };

    const sport = regularSportMap[selectedSport as Exclude<SportTab, "TOP" | "SOCCER">];

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
              <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-400">
                Atlas Sportsbook
              </p>
              <h1 className="mt-1 text-3xl font-bold leading-none">Scores</h1>
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

          <div className="flex gap-2 overflow-x-auto pb-1">
            {sportsTabs.map((sport) => (
              <button
                key={sport}
                onClick={() => setSelectedSport(sport)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
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
                  className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="mb-2 text-xs font-bold text-yellow-400">
                    TOP SIGNAL {pick.sport}
                  </div>

                  <div className="text-sm font-medium text-white">
                    {pick.awayTeam} vs {pick.homeTeam}
                  </div>

                  <div className="mt-2 text-lg font-bold text-cyan-300">
                    {formatDisplayedPick(pick.pick, pick.sport)}
                  </div>

                  {pick.startTime && (
                    <div className="mt-1 text-xs text-white/60">
                      {formatTime(pick.startTime)}
                    </div>
                  )}
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
              const total = getTotal(game);
              const pickData = findPick(game, selectedSport);

              return (
                <article
                  key={game.id}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-white/80">
                        {selectedSport}
                      </p>
                      <p className="mt-1 text-[11px] text-white/45">
                        {formatTime(game.commence_time)}
                      </p>
                    </div>

                    <span className="rounded-full bg-cyan-500/15 px-3 py-1 text-[11px] font-semibold text-cyan-300">
                      {total}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        {game.away_team}
                      </p>
                      <span className="min-w-[64px] rounded-full bg-white/10 px-3 py-1 text-center text-sm font-semibold text-white">
                        {awayOdds ?? "N/A"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">
                        {game.home_team}
                      </p>
                      <span className="min-w-[64px] rounded-full bg-white/10 px-3 py-1 text-center text-sm font-semibold text-white">
                        {homeOdds ?? "N/A"}
                      </span>
                    </div>
                  </div>

                  {pickData && (
                    <div className="mt-3 space-y-2">
                      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-2">
                        <p className="text-xs font-semibold text-cyan-300">
                          SIGNAL DETECTED
                        </p>
                        <p className="text-sm text-white">
                          {formatDisplayedPick(pickData.pick, selectedSport)}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-white/60">
                          {pickData.status ?? "PENDING"}
                        </p>
                      </div>

                      {pickData.isTop5 && userPlan === "regular" && (
                        <span className="inline-block rounded-full bg-yellow-500/20 px-2 py-1 text-[10px] font-semibold text-yellow-300">
                          TOP 5
                        </span>
                      )}

                      {pickData.isTopSignal && userPlan === "premium" && (
                        <span className="inline-block rounded-full bg-purple-500/20 px-2 py-1 text-[10px] font-semibold text-purple-300">
                          TOP SIGNAL #{pickData.topRank ?? 1}
                        </span>
                      )}

                      {pickData.isTop5 &&
                        !pickData.isTopSignal &&
                        userPlan === "premium" && (
                          <span className="inline-block rounded-full bg-yellow-500/20 px-2 py-1 text-[10px] font-semibold text-yellow-300">
                            TOP 5 #{pickData.topRank ?? ""}
                          </span>
                        )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>

        <nav className="sticky bottom-0 border-t border-white/5 bg-[#050816]/95 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center justify-around px-4 py-3 text-xs">
            <button className="font-semibold text-cyan-400">Scores</button>
            <button className="text-white/50">News</button>
            <button className="text-white/50">Following</button>
            <button className="text-white/50">More</button>
          </div>
        </nav>
      </div>
    </main>
  );
}