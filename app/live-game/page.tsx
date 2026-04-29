"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import nbaSignals from "@/data/nba-public-signals.json";
import nhlSignals from "@/data/nhl-public-signals.json";
import soccerSignals from "@/data/soccer-public-signals.json";
import { teamBranding } from "@/app/lib/teamBranding";
import { supabase } from "@/app/lib/supabase/client";

type SportTab = "TOP" | "NHL" | "NBA" | "MLB" | "NFL" | "SOCCER";

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
};

const nbaSignalsData = nbaSignals as { games: SignalGame[] };
const nhlSignalsData = nhlSignals as { games: SignalGame[] };
const soccerSignalsData = soccerSignals as { games: SignalGame[] };

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

function getTeamData(teamName: string) {
  return teamBranding[teamName] ?? null;
}

function getDisplayAbbr(teamName: string) {
  return getTeamData(teamName)?.abbr ?? teamName.slice(0, 3).toUpperCase();
}

function getLogo(teamName: string, sport: SportTab) {
  const cleanName = String(teamName)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (sport === "NBA") return `/team-logos/nba/${cleanName}.png`;
  if (sport === "NHL") return `/team-logos/nhl/${cleanName}.png`;
  if (sport === "MLB") return `/team-logos/mlb/${cleanName}.png`;
  if (sport === "SOCCER") return `/team-logos/soccer/${cleanName}.png`;

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
    };
  }

  const over = market.outcomes.find((o) => o.name === "Over");
  const under = market.outcomes.find((o) => o.name === "Under");

  if (!over || !under) {
    return {
      overLabel: "N/A",
      underLabel: "N/A",
    };
  }

  const overPoint = over.point !== undefined ? over.point : "N/A";
  const underPoint = under.point !== undefined ? under.point : "N/A";

  return {
    overLabel: `O ${overPoint}`,
    underLabel: `U ${underPoint}`,
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
  return new Date(dateString)
    .toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" AM", " am")
    .replace(" PM", " pm");
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

  if (/^(over|under)$/i.test(pick)) return pick;
  if (/\bml\b/i.test(pick)) return pick;

  return `${pick} ML`;
}

function findPickForGame(game: OddsGame, sport: SportTab): SignalGame | null {
  const source =
    sport === "MLB"
      ? []
      : sport === "NBA"
        ? nbaSignalsData.games
        : sport === "NHL"
          ? nhlSignalsData.games
          : sport === "SOCCER"
            ? soccerSignalsData.games
            : [];

  // 1. intenta por gameId
  const direct = source.find(
    (g) => String(g.gameId) === String(game.id)
  );

  if (direct) return direct;

  // 2. intenta por nombre exacto
  const byName = source.find((g) => isSameMatch(game, g));
  if (byName) return byName;

  // 3. fallback agresivo (por palabras clave)
  const gameAway = normalizeName(game.away_team);
  const gameHome = normalizeName(game.home_team);

  const fallback = source.find((g) => {
    const signalAway = normalizeName(g.awayTeam ?? "");
    const signalHome = normalizeName(g.homeTeam ?? "");

    return (
      gameAway.includes(signalAway) ||
      signalAway.includes(gameAway) ||
      gameHome.includes(signalHome) ||
      signalHome.includes(gameHome)
    );
  });

  return fallback || null;
}

function getSportApiValue(sport: SportTab) {
  if (sport === "MLB") return "baseball_mlb";
  if (sport === "NBA") return "basketball_nba";
  if (sport === "NHL") return "icehockey_nhl";
  if (sport === "NFL") return "americanfootball_nfl";
  return "";
}

function LiveGameContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sportParam = searchParams.get("sport");
const sport: SportTab =
  sportParam === "TOP" ||
  sportParam === "NHL" ||
  sportParam === "NBA" ||
  sportParam === "MLB" ||
  sportParam === "NFL" ||
  sportParam === "SOCCER"
    ? sportParam
    : "MLB";

const gameId = searchParams.get("gameId") || "";
const awayTeamParam = searchParams.get("awayTeam") || "";
const homeTeamParam = searchParams.get("homeTeam") || "";
const commenceTimeParam = searchParams.get("commenceTime") || "";

const returnSportParam = searchParams.get("returnSport");
const returnSport: SportTab =
  returnSportParam === "TOP" ||
  returnSportParam === "NHL" ||
  returnSportParam === "NBA" ||
  returnSportParam === "MLB" ||
  returnSportParam === "NFL" ||
  returnSportParam === "SOCCER"
    ? returnSportParam
    : sport;
    
    const returnView = searchParams.get("returnView") || "live";
const returnDay = searchParams.get("returnDay") || "today";

  const [game, setGame] = useState<OddsGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [userPlan] = useState<"free" | "regular" | "premium">("premium");
  const [mlbSignalsData, setMlbSignalsData] = useState<{ games: SignalGame[] }>({
  games: [],
});

useEffect(() => {
  async function loadMlbSignals() {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    const { data, error } = await supabase
      .from("mlb_public_signals")
      .select("*")
      .eq("sport", "MLB")
      .eq("date", today);

    if (error) {
      console.error("MLB public signals error:", error);
      setMlbSignalsData({ games: [] });
      return;
    }

    setMlbSignalsData({
  games: (data ?? []).map((row: any) => {
    const market = String(row.market ?? "").toLowerCase();
    const pick = String(row.pick ?? "");
    const line = row.line;

    let formattedPick = pick;

    if (market === "spreads" && line !== null && line !== undefined) {
      const numberLine = Number(line);
      const lineText =
        Number.isFinite(numberLine) && numberLine > 0
          ? `+${numberLine}`
          : `${line}`;

      formattedPick = `${pick} (${lineText})`;
    }

    if (market === "totals" && line !== null && line !== undefined) {
      formattedPick = `${pick} ${line}`;
    }

    return {
      gameId: row.game_id,
      awayTeam: row.away_team,
      homeTeam: row.home_team,
      pick: formattedPick,
      status: row.status,
    };
  }),
});
  }

  if (sport === "MLB") {
    loadMlbSignals();
  }
}, [sport]);

  useEffect(() => {
  async function loadGame() {
    try {
      setLoading(true);

      if (sport === "SOCCER") {
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

        const allGames = responses.flat();
        const foundGame =
          allGames.find((g) => String(g.id) === String(gameId)) || null;

        if (foundGame) {
          setGame(foundGame);
          return;
        }

        if (awayTeamParam && homeTeamParam) {
          setGame({
            id: gameId,
            away_team: awayTeamParam,
            home_team: homeTeamParam,
            commence_time: commenceTimeParam || new Date().toISOString(),
            bookmakers: [],
          });
          return;
        }

        setGame(null);
        return;
      }

      const apiSport = getSportApiValue(sport);

      if (!apiSport) {
        setGame(null);
        return;
      }

      const res = await fetch(`/api/odds?sport=${apiSport}`, {
        cache: "no-store",
      });

      const data = await res.json();
      const games = Array.isArray(data) ? (data as OddsGame[]) : [];
      const foundGame =
        games.find((g) => String(g.id) === String(gameId)) || null;

      if (foundGame) {
        setGame(foundGame);
        return;
      }

      if (awayTeamParam && homeTeamParam) {
        setGame({
          id: gameId,
          away_team: awayTeamParam,
          home_team: homeTeamParam,
          commence_time: commenceTimeParam || new Date().toISOString(),
          bookmakers: [],
        });
        return;
      }

      setGame(null);
    } catch (error) {
      setGame(null);
    } finally {
      setLoading(false);
    }
  }

  loadGame();
}, [sport, gameId, awayTeamParam, homeTeamParam, commenceTimeParam]);

  const pickData = useMemo(() => {
  if (!game) return null;

  if (sport === "MLB") {
    const direct = mlbSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    if (direct) return direct;

    const byName = mlbSignalsData.games.find((g) => isSameMatch(game, g));

    return byName ?? null;
  }

  return findPickForGame(game, sport);
}, [game, sport, mlbSignalsData]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
            Loading game detail...
          </div>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="min-h-screen bg-[#050816] text-white">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5">
          <div className="mb-5 flex items-center justify-between">
            <button
  onClick={() =>
    router.push(
      `/?sport=${encodeURIComponent(returnSport)}&view=${encodeURIComponent(
        returnView
      )}&day=${encodeURIComponent(returnDay)}`
    )
  }
  className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/80"
>
  Back
</button>

            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/90">
              Atlas Signals
            </p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
            Game not found.
          </div>
        </div>
      </main>
    );
  }

  const awayOdds = getMoneyline(game, game.away_team);
  const homeOdds = getMoneyline(game, game.home_team);
  const awaySpread = getSpreadValue(game, game.away_team);
  const homeSpread = getSpreadValue(game, game.home_team);
  const awaySpreadPrice = getSpreadPrice(game, game.away_team);
  const homeSpreadPrice = getSpreadPrice(game, game.home_team);
  const totalValues = getTotalValues(game);
  const totalPrices = getTotalPrices(game);

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5">
        <div className="mb-5 flex items-center justify-between">
          <button
  onClick={() =>
    router.push(
      `/?sport=${encodeURIComponent(returnSport)}&view=${encodeURIComponent(
        returnView
      )}&day=${encodeURIComponent(returnDay)}`
    )
  }
  className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/80"
>
  Back
</button>

          <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/90">
            Atlas Signals
          </p>
        </div>

        <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
              {sport}
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
                <TeamBadge teamName={game.away_team} sport={sport} />
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
                <TeamBadge teamName={game.home_team} sport={sport} />
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

          <div className="mt-5 rounded-[22px] border border-cyan-400/25 bg-cyan-400/10 p-4">
            <div className="mb-3 inline-flex rounded-full bg-cyan-300/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Signal Detected
            </div>

            <p className="text-[17px] font-semibold leading-tight tracking-tight text-white">
  {pickData
    ? formatDisplayedPick(pickData.pick, sport)
    : "No signal detected yet"}
</p>

<div className="mt-3 flex items-center gap-2">
  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/70">
    Pending
  </span>

  <span className="rounded-full bg-cyan-400/20 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-cyan-300">
    Early Signal
  </span>
</div>

<p className="mt-2 text-[11px] text-white/45">
  Market activity detected • Monitoring for confirmation
</p>
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
            Unlock More
          </p>

          <h2 className="mt-2 text-[18px] font-semibold tracking-tight text-white">
            Unlock confirmed signal & premium validation
          </h2>

          <p className="mt-2 text-sm leading-6 text-white/70">
            This signal was detected early. Subscribers get access to confirmed signals, ranked top plays and stronger validation before game time.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Exclusive: Top 5
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Premium: Ranked + Top Signal
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
              Elite: Top by Sport
            </span>
          </div>

          <div className="mt-5 space-y-2 text-[13px] text-white/65">
            <p>• Confirmed signal access</p>
            <p>• Ranked top plays by sport</p>
            <p>• Premium signal visibility</p>
            <p>• Stronger daily decision support</p>
          </div>

          <button className="mt-5 w-full rounded-[18px] bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition-all">
            View Subscription Options
          </button>
        </section>
      </div>
    </main>
  );
}

export default function LiveGamePage() {
  return (
    <Suspense fallback={<div className="p-4 text-white">Loading...</div>}>
      <LiveGameContent />
    </Suspense>
  );
}