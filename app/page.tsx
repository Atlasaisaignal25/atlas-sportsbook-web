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
  const words = String(teamName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "TEAM";
  if (words.length === 1) return words[0];

  const twoWordNicknames = new Set([
    "Red Sox",
    "White Sox",
    "Blue Jays",
    "Trail Blazers",
    "Blue Jackets",
    "Golden Knights",
    "Maple Leafs",
    "Red Wings",
    "Timber Wolves",
    "FC Dallas",
    "Inter Miami",
    "Real Salt",
    "St Louis",
  ]);

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

function TeamBadge({ teamName }: { teamName: string }) {
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
                        <TeamBadge teamName={game.away_team} />
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                            {getShortTeamName(game.away_team)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <TeamBadge teamName={game.home_team} />
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