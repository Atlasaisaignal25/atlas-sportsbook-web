"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { teamBranding } from "@/app/lib/teamBranding";

type SportTab = "TOP" | "NHL" | "NBA" | "MLB" | "NFL" | "SOCCER";
type UserPlan = "free" | "exclusive" | "premium" | "elite" | "admin";

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

type ProGameDetail = {
  success?: boolean;
  provider?: "sportsdataio";
  sport?: SportTab;
  gameId?: string;
  boxScore?: any;
  playByPlay?: any;
  standings?: any[];
};

function isUserPlan(value: unknown): value is UserPlan {
  return (
    value === "free" ||
    value === "exclusive" ||
    value === "premium" ||
    value === "elite" ||
    value === "admin"
  );
}

function getTeamData(teamName: string) {
  return teamBranding[teamName] ?? null;
}

function getDisplayAbbr(teamName: string) {
  return getTeamData(teamName)?.abbr ?? teamName.slice(0, 3).toUpperCase();
}

function getLogoKey(teamName: string) {
  return String(teamName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

const soccerFlagLogoOverrides: Record<string, string> = {
  argentina: "/team-logos/soccer/flags/ar.svg",
  belgium: "/team-logos/soccer/flags/be.svg",
  brazil: "/team-logos/soccer/flags/br.svg",
  canada: "/team-logos/soccer/flags/ca.svg",
  chile: "/team-logos/soccer/flags/cl.svg",
  colombia: "/team-logos/soccer/flags/co.svg",
  costarica: "/team-logos/soccer/flags/cr.svg",
  croatia: "/team-logos/soccer/flags/hr.svg",
  denmark: "/team-logos/soccer/flags/dk.svg",
  ecuador: "/team-logos/soccer/flags/ec.svg",
  england: "/team-logos/soccer/flags/eng.svg",
  france: "/team-logos/soccer/flags/fr.svg",
  germany: "/team-logos/soccer/flags/de.svg",
  holland: "/team-logos/soccer/flags/nl.svg",
  japan: "/team-logos/soccer/flags/jp.svg",
  mexico: "/team-logos/soccer/flags/mx.svg",
  morocco: "/team-logos/soccer/flags/ma.svg",
  netherlands: "/team-logos/soccer/flags/nl.svg",
  poland: "/team-logos/soccer/flags/pl.svg",
  portugal: "/team-logos/soccer/flags/pt.svg",
  southkorea: "/team-logos/soccer/flags/kr.svg",
  spain: "/team-logos/soccer/flags/es.svg",
  switzerland: "/team-logos/soccer/flags/ch.svg",
  unitedstates: "/team-logos/soccer/flags/us.svg",
  unitedstatesofamerica: "/team-logos/soccer/flags/us.svg",
  uruguay: "/team-logos/soccer/flags/uy.svg",
  usa: "/team-logos/soccer/flags/us.svg",
};

const logoFileOverrides: Record<string, string> = {
  oaklandathletics: "athletics",
};

function getLogo(teamName: string, sport: SportTab) {
  const cleanName = getLogoKey(teamName);

  if (sport === "NBA") return `/team-logos/nba/${cleanName}.png`;
  if (sport === "NHL") return `/team-logos/nhl/${cleanName}.png`;
  if (sport === "MLB") {
    return `/team-logos/mlb/${logoFileOverrides[cleanName] ?? cleanName}.png`;
  }
  if (sport === "NFL") return `/team-logos/nfl/${cleanName}.png`;
  if (sport === "SOCCER" && soccerFlagLogoOverrides[cleanName]) {
    return soccerFlagLogoOverrides[cleanName];
  }
  if (sport === "SOCCER") return `/team-logos/soccer/${cleanName}.png`;

  return null;
}

function TeamBadge({
  teamName,
  sport,
  size = "md",
}: {
  teamName: string;
  sport: SportTab;
  size?: "md" | "lg";
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = logoFailed ? null : getLogo(teamName, sport);
  const sizeClass = size === "lg" ? "h-14 w-14" : "h-9 w-9";
  const isSoccerFlag = sport === "SOCCER" && logo?.includes("/team-logos/soccer/flags/");

  if (logo) {
    return (
      <span className={`inline-flex ${sizeClass} items-center justify-center`}>
        <img
          src={logo}
          alt={teamName}
          onError={() => setLogoFailed(true)}
          className={isSoccerFlag ? "h-full w-full rounded-full object-cover" : "h-full w-full object-contain"}
        />
      </span>
    );
  }

  return (
    <span className={`inline-flex ${sizeClass} items-center justify-center text-[10px] font-bold text-white/70`}>
      {getDisplayAbbr(teamName)}
    </span>
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
      timeZone: "America/New_York",
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

function formatMlbTeamName(value: unknown) {
  const abbr = String(value ?? "").trim();
  const team = Object.entries(teamBranding).find(([, data]) => data.abbr === abbr);
  return team?.[0] ?? abbr;
}

function cleanSportsDataValue(value: unknown, fallback = "N/A") {
  if (value === null || value === undefined || value === "") return fallback;
  if (String(value).toLowerCase() === "scrambled") return fallback;
  return String(value);
}

function displayNumber(value: unknown, fallback = "-") {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return String(Math.round(number));
}

function getMlbGameStatus(gameData: any) {
  if (!gameData) return null;
  if (gameData.IsClosed) return "Final";
  if (gameData.InningDescription) return String(gameData.InningDescription);
  if (gameData.Inning && gameData.InningHalf) {
    return `${gameData.InningHalf === "T" ? "Top" : "Bottom"} ${gameData.Inning}`;
  }
  return cleanSportsDataValue(gameData.Status, null as any);
}

function BaseDiamond({
  first,
  second,
  third,
}: {
  first?: boolean;
  second?: boolean;
  third?: boolean;
}) {
  const baseClass = (active?: boolean) =>
    `absolute h-4 w-4 rotate-45 rounded-[3px] border ${
      active
        ? "border-cyan-200 bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.45)]"
        : "border-white/20 bg-white/10"
    }`;

  return (
    <div className="relative mx-auto h-14 w-20">
      <span className={baseClass(second)} style={{ left: "32px", top: "2px" }} />
      <span className={baseClass(third)} style={{ left: "10px", top: "24px" }} />
      <span className={baseClass(first)} style={{ right: "10px", top: "24px" }} />
      <span className="absolute bottom-0 left-[32px] h-4 w-4 rotate-45 rounded-[3px] border border-white/25 bg-white/15" />
    </div>
  );
}

function CountDots({ value, total }: { value: unknown; total: number }) {
  const active = Number(value) || 0;
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          className={`h-2 w-2 rounded-full ${
            index < active ? "bg-cyan-300" : "bg-white/18"
          }`}
        />
      ))}
    </div>
  );
}

function MlbLineScore({ boxScore }: { boxScore: any }) {
  const gameData = boxScore?.Game;
  const innings = Array.isArray(boxScore?.Innings)
    ? boxScore.Innings
    : Array.isArray(gameData?.Innings)
    ? gameData.Innings
    : [];
  const inningNumbers = innings
    .map((inning: any) => Number(inning.InningNumber))
    .filter((inning: number) => Number.isFinite(inning));
  const columns = Array.from(
    { length: Math.max(9, inningNumbers.length || 0) },
    (_, index) => index + 1
  );

  if (!gameData) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-[13px] font-bold text-white">Scoreboard</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[12px]">
          <thead className="text-white/40">
            <tr>
              <th className="px-4 py-2 font-semibold">Team</th>
              {columns.map((inning) => (
                <th key={inning} className="px-2 py-2 text-center font-semibold">
                  {inning}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-semibold">R</th>
              <th className="px-2 py-2 text-center font-semibold">H</th>
              <th className="px-2 py-2 text-center font-semibold">E</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {[
              {
                label: formatMlbTeamName(gameData.AwayTeam),
                side: "Away",
                runs: gameData.AwayTeamRuns,
                hits: gameData.AwayTeamHits,
                errors: gameData.AwayTeamErrors,
              },
              {
                label: formatMlbTeamName(gameData.HomeTeam),
                side: "Home",
                runs: gameData.HomeTeamRuns,
                hits: gameData.HomeTeamHits,
                errors: gameData.HomeTeamErrors,
              },
            ].map((row) => (
              <tr key={row.side}>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-white">
                  {row.label}
                </td>
                {columns.map((inningNumber) => {
                  const inning = innings.find(
                    (item: any) => Number(item.InningNumber) === inningNumber
                  );
                  return (
                    <td key={inningNumber} className="px-2 py-3 text-center text-white/70">
                      {inning ? displayNumber(inning[`${row.side}TeamRuns`]) : "-"}
                    </td>
                  );
                })}
                <td className="px-2 py-3 text-center font-black text-white">
                  {displayNumber(row.runs)}
                </td>
                <td className="px-2 py-3 text-center text-white/70">
                  {displayNumber(row.hits)}
                </td>
                <td className="px-2 py-3 text-center text-white/70">
                  {displayNumber(row.errors)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MlbPlayerStats({ boxScore }: { boxScore: any }) {
  const players = Array.isArray(boxScore?.PlayerGames) ? boxScore.PlayerGames : [];
  const batting = players
    .filter((player: any) => Number(player.AtBats) > 0 || Number(player.PlateAppearances) > 0)
    .sort((a: any, b: any) => Number(a.BattingOrder ?? 99) - Number(b.BattingOrder ?? 99))
    .slice(0, 10);

  if (batting.length === 0) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-[13px] font-bold text-white">Player Stats</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[12px]">
          <thead className="text-white/40">
            <tr>
              <th className="px-4 py-2 font-semibold">Player</th>
              {["AB", "R", "H", "RBI", "BB", "K"].map((label) => (
                <th key={label} className="px-2 py-2 text-center font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {batting.map((player: any) => (
              <tr key={`${player.PlayerID}-${player.Team}`}>
                <td className="px-4 py-3">
                  <p className="font-bold text-white">{cleanSportsDataValue(player.Name, "Player")}</p>
                  <p className="text-[10px] text-white/45">
                    {formatMlbTeamName(player.Team)} · {cleanSportsDataValue(player.Position, "POS")}
                  </p>
                </td>
                <td className="px-2 py-3 text-center text-white/70">{displayNumber(player.AtBats)}</td>
                <td className="px-2 py-3 text-center text-white/70">{displayNumber(player.Runs)}</td>
                <td className="px-2 py-3 text-center text-white/70">{displayNumber(player.Hits)}</td>
                <td className="px-2 py-3 text-center text-white/70">{displayNumber(player.RunsBattedIn)}</td>
                <td className="px-2 py-3 text-center text-white/70">{displayNumber(player.Walks)}</td>
                <td className="px-2 py-3 text-center text-white/70">{displayNumber(player.Strikeouts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MlbStandingsPreview({
  standings,
  awayTeam,
  homeTeam,
}: {
  standings?: any[];
  awayTeam: string;
  homeTeam: string;
}) {
  const rows = Array.isArray(standings)
    ? standings.filter((row: any) => {
        const name = formatMlbTeamName(row.Team ?? row.Key);
        return name === awayTeam || name === homeTeam;
      })
    : [];

  if (rows.length === 0) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-[13px] font-bold text-white">Standings</p>
      </div>

      <div className="divide-y divide-white/10">
        {rows.map((row: any) => (
          <div
            key={row.TeamID ?? row.Team}
            className="grid grid-cols-[1fr_46px_46px_52px] items-center gap-2 px-4 py-3 text-[12px]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <TeamBadge teamName={formatMlbTeamName(row.Team ?? row.Key)} sport="MLB" />
              <p className="truncate font-bold text-white">
                {formatMlbTeamName(row.Team ?? row.Key)}
              </p>
            </div>
            <p className="text-center text-white/70">{displayNumber(row.Wins)}</p>
            <p className="text-center text-white/70">{displayNumber(row.Losses)}</p>
            <p className="text-center text-white/70">
              {Number.isFinite(Number(row.Percentage))
                ? Number(row.Percentage).toFixed(3).replace(/^0/, "")
                : "-"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MlbMatchTracker({ boxScore }: { boxScore: any }) {
  const gameData = boxScore?.Game;

  if (!gameData) return null;

  const lastPlay = cleanSportsDataValue(gameData.LastPlay, "Live state from SportsDataIO");
  const status = getMlbGameStatus(gameData);

  return (
    <section className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-[13px] font-bold text-white">Match Tracker</p>
      </div>

      <div className="bg-gradient-to-br from-emerald-950/55 via-slate-900 to-cyan-950/25 px-4 py-5">
        <div className="rounded-[20px] border border-white/10 bg-black/18 p-4">
          <p className="text-center text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-200">
            {status ?? "Live"}
          </p>

          <div className="mt-3 scale-125">
            <BaseDiamond
              first={Boolean(gameData.RunnerOnFirst)}
              second={Boolean(gameData.RunnerOnSecond)}
              third={Boolean(gameData.RunnerOnThird)}
            />
          </div>

          <div className="mt-5 flex items-center justify-center gap-4 text-[11px] font-bold text-white/70">
            <div className="flex items-center gap-1.5">
              <span>B</span>
              <CountDots value={gameData.Balls} total={4} />
            </div>
            <div className="flex items-center gap-1.5">
              <span>S</span>
              <CountDots value={gameData.Strikes} total={3} />
            </div>
            <div className="flex items-center gap-1.5">
              <span>O</span>
              <CountDots value={gameData.Outs} total={3} />
            </div>
          </div>

          <p className="mt-4 rounded-2xl bg-black/25 px-3 py-3 text-center text-[12px] leading-5 text-white/72">
            {lastPlay}
          </p>
        </div>
      </div>
    </section>
  );
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

const returnSectionParam = searchParams.get("returnSection");
const returnSection =
  returnSectionParam === "signals" ||
  returnSectionParam === "scores" ||
  returnSectionParam === "following" ||
  returnSectionParam === "alerts" ||
  returnSectionParam === "more"
    ? returnSectionParam
    : "scores";
const returnView = searchParams.get("returnView") || "live";
const returnDay = searchParams.get("returnDay") || "today";

function handleBack() {
  if (typeof window !== "undefined" && window.history.length > 1) {
    router.back();
    return;
  }

  router.push(
    `/?section=${encodeURIComponent(returnSection)}&sport=${encodeURIComponent(
      returnSport
    )}&view=${encodeURIComponent(returnView)}&day=${encodeURIComponent(returnDay)}`
  );
}

  const [game, setGame] = useState<OddsGame | null>(null);
  const [proDetail, setProDetail] = useState<ProGameDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [userPlan, setUserPlan] = useState<UserPlan>("free");

useEffect(() => {
  let mounted = true;

  async function loadSession() {
    try {
      const res = await fetch("/api/auth/session", {
        cache: "no-store",
      });
      const data = await res.json();

      if (!mounted) return;

      setUserPlan(isUserPlan(data.plan) ? data.plan : "free");
    } catch {
      if (!mounted) return;
      setUserPlan("free");
    }
  }

  loadSession();

  return () => {
    mounted = false;
  };
}, []);

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

useEffect(() => {
  let mounted = true;

  async function loadProDetail() {
    if (sport !== "MLB" || !gameId) {
      setProDetail(null);
      return;
    }

    try {
      const res = await fetch(
        `/api/pro/game-detail?sport=${encodeURIComponent(sport)}&gameId=${encodeURIComponent(gameId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();

      if (!mounted) return;

      setProDetail(data?.success ? data : null);
    } catch {
      if (!mounted) return;
      setProDetail(null);
    }
  }

  loadProDetail();

  return () => {
    mounted = false;
  };
}, [sport, gameId]);

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
  onClick={handleBack}
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
  const isPremiumPlan =
    userPlan === "premium" || userPlan === "elite" || userPlan === "admin";
  const canSeePremiumSignal = userPlan !== "free";
  const mlbBoxScore = sport === "MLB" ? proDetail?.boxScore : null;
  const mlbGameData = mlbBoxScore?.Game;
  const awayTeamName = mlbGameData ? formatMlbTeamName(mlbGameData.AwayTeam) : game.away_team;
  const homeTeamName = mlbGameData ? formatMlbTeamName(mlbGameData.HomeTeam) : game.home_team;
  const awayScore = mlbGameData ? displayNumber(mlbGameData.AwayTeamRuns, "0") : null;
  const homeScore = mlbGameData ? displayNumber(mlbGameData.HomeTeamRuns, "0") : null;
  const liveStatus = mlbGameData ? getMlbGameStatus(mlbGameData) : null;

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-5">
        <div className="mb-5 flex items-center justify-between">
          <button
  onClick={handleBack}
  className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/80"
>
  Back
</button>

          <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-400/90">
            Atlas Signals
          </p>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
          <div className="border-b border-white/10 bg-cyan-400/[0.06] px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                {sport === "MLB" ? "Estados Unidos, MLB" : `${sport} Matchup`}
              </p>
              <span className="rounded-full bg-black/25 px-3 py-1 text-[11px] font-bold text-white/70">
                {liveStatus ?? `${formatTime(game.commence_time)} ET`}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-[1fr_76px_1fr] items-center gap-3">
              <div className="min-w-0 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center">
                  <TeamBadge teamName={awayTeamName} sport={sport} size="lg" />
                </div>
                <p className="mt-3 truncate text-[17px] font-black tracking-tight text-white">
                  {getDisplayAbbr(awayTeamName)}
                </p>
                <p className="mt-1 truncate text-[11px] text-white/45">
                  Away
                </p>
              </div>

              <div className="text-center">
                {mlbGameData ? (
                  <>
                    <p className="text-[32px] font-black leading-none tracking-tight text-white">
                      {awayScore}-{homeScore}
                    </p>
                    <div className="mt-2 scale-75">
                      <BaseDiamond
                        first={Boolean(mlbGameData.RunnerOnFirst)}
                        second={Boolean(mlbGameData.RunnerOnSecond)}
                        third={Boolean(mlbGameData.RunnerOnThird)}
                      />
                    </div>
                    <div className="mt-1 flex flex-col items-center gap-1 text-[9px] font-bold text-white/60">
                      <div className="flex items-center gap-1.5">
                        <span>B</span>
                        <CountDots value={mlbGameData.Balls} total={4} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>S</span>
                        <CountDots value={mlbGameData.Strikes} total={3} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>O</span>
                        <CountDots value={mlbGameData.Outs} total={3} />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">
                    VS
                  </p>
                )}
              </div>

              <div className="min-w-0 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center">
                  <TeamBadge teamName={homeTeamName} sport={sport} size="lg" />
                </div>
                <p className="mt-3 truncate text-[17px] font-black tracking-tight text-white">
                  {getDisplayAbbr(homeTeamName)}
                </p>
                <p className="mt-1 truncate text-[11px] text-white/45">
                  Home
                </p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/45">
                Markets
              </p>

              <div className="mt-3 overflow-hidden rounded-[20px] border border-white/10">
                {[
                  {
                    label: "Moneyline",
                    away: awayOdds !== null ? formatAmericanOdds(awayOdds) : "N/A",
                    home: homeOdds !== null ? formatAmericanOdds(homeOdds) : "N/A",
                  },
                  {
                    label: "Spread",
                    away: `${awaySpread} ${awaySpreadPrice}`,
                    home: `${homeSpread} ${homeSpreadPrice}`,
                  },
                  {
                    label: "Total",
                    away: `${totalValues.overLabel} ${totalPrices.overPrice}`,
                    home: `${totalValues.underLabel} ${totalPrices.underPrice}`,
                  },
                ].map((market, idx) => (
                  <div
                    key={market.label}
                    className={`grid grid-cols-[1fr_82px_82px] items-center gap-2 px-3 py-3 ${
                      idx !== 2 ? "border-b border-white/10" : ""
                    }`}
                  >
                    <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/45">
                      {market.label}
                    </p>
                    <div className="rounded-full bg-black/35 px-2 py-1.5 text-center text-[12px] font-bold text-white">
                      {market.away}
                    </div>
                    <div className="rounded-full bg-black/35 px-2 py-1.5 text-center text-[12px] font-bold text-white">
                      {market.home}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          {mlbBoxScore ? (
            <>
              <MlbMatchTracker boxScore={mlbBoxScore} />
              <MlbLineScore boxScore={mlbBoxScore} />
              <MlbStandingsPreview
                standings={proDetail?.standings}
                awayTeam={awayTeamName}
                homeTeam={homeTeamName}
              />
              <MlbPlayerStats boxScore={mlbBoxScore} />
            </>
          ) : null}
          </div>
        </section>

        {!canSeePremiumSignal || !isPremiumPlan ? (
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
              Premium: Top 3 Ranked
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

          <button
            type="button"
            onClick={() => router.push(`/?sport=${encodeURIComponent(sport)}&view=odds&day=today`)}
            className="mt-5 w-full rounded-[18px] bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition-all"
          >
            View Subscription Options
          </button>
        </section>
        ) : null}
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
