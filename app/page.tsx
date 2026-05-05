"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
// import mlbSignals from "@/data/mlb-public-signals.json";
import nbaSignals from "@/data/nba-public-signals.json";
import nhlSignals from "@/data/nhl-public-signals.json";
import soccerSignals from "@/data/soccer-public-signals.json";
import mlbTop5 from "@/data/mlb-top5.json";
import nbaTop5 from "@/data/nba-top5.json";
import nhlTop5 from "@/data/nhl-top5.json";
import soccerTop5 from "@/data/soccer-top5.json";
import { teamBranding } from "./lib/teamBranding";
import { useRouter, useSearchParams } from "next/navigation";
import {getMlbPublicSignals,getMlbTop5Live,} from "@/app/lib/supabase/mlbLiveSignals";
import { getNbaPublicSignals, getNbaTop5Live } from "@/app/lib/supabase/nbaLiveSignals";
import { getNhlPublicSignals, getNhlTop5Live } from "@/app/lib/supabase/nhlLiveSignals";
import {getSoccerPublicSignals,getSoccerTop5Live,} from "@/app/lib/supabase/soccerLiveSignals";




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

type UserPlan = "free" | "exclusive" | "premium" | "elite" | "admin";

type UserAccess = {
  plan: UserPlan;
  sports: SportTab[];
};

const nbaSignalsData = nbaSignals as { games: SignalGame[] };
const nhlSignalsData = nhlSignals as { games: SignalGame[] };
const soccerSignalsData = soccerSignals as { games: SignalGame[] };

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
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/8 p-1">
        <img
          src={logo}
          alt={teamName}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/8 text-[10px] font-bold text-white/70">
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

function getDrawOdds(game: OddsGame) {
  const market = getMarket(game, "h2h");
  const outcome = market?.outcomes?.find((o) => normalizeName(o.name) === "draw");
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
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  .replace(" AM", " am")
  .replace(" PM", " pm");
}

function getGameMinute(game: LiveScore) {
  if (game.completed) return "Final";

  const hasScores = Array.isArray(game.scores) && game.scores.length > 0;
  if (!hasScores) return "";

  const sportKey = String(game.sport_key ?? "").toLowerCase();

  const clock =
    (game as any)?.clock ??
    (game as any)?.time_remaining ??
    (game as any)?.timer ??
    (game as any)?.display_clock ??
    null;

  const period =
    (game as any)?.period ??
    (game as any)?.current_period ??
    (game as any)?.quarter ??
    null;

  const inning =
    (game as any)?.inning ??
    (game as any)?.current_inning ??
    (game as any)?.inning_number ??
    null;

  const inningHalf =
    (game as any)?.inning_half ??
    (game as any)?.half_inning ??
    (game as any)?.inning_state ??
    null;

  const minute =
    (game as any)?.minute ??
    (game as any)?.match_minute ??
    (game as any)?.elapsed ??
    null;

  const status =
    (game as any)?.status ??
    (game as any)?.game_status ??
    (game as any)?.status_detail ??
    null;

  if (sportKey.includes("baseball")) {
    if (inning && inningHalf) {
      const half = String(inningHalf).toLowerCase().includes("top")
        ? "Top"
        : String(inningHalf).toLowerCase().includes("bottom")
        ? "Bot"
        : String(inningHalf);

      return `${half} ${inning}`;
    }

    if (inning) return `Inning ${inning}`;
    if (status) return String(status);
    return "Live";
  }

  if (sportKey.includes("soccer")) {
    if (minute) return `${minute}'`;
    if (status) return String(status);
    return "Live";
  }

  if (sportKey.includes("basketball")) {
    if (clock && period) return `${clock} • Q${period}`;
    if (period) return `Q${period}`;
    if (clock) return String(clock);
    return "Live";
  }

  if (sportKey.includes("icehockey")) {
    if (clock && period) return `${clock} • P${period}`;
    if (period) return `P${period}`;
    if (clock) return String(clock);
    return "Live";
  }

  if (clock && period) return `${clock} • ${period}`;
  if (clock) return String(clock);
  if (period) return String(period);

  return "Live";
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
    soccer_england_championship: "Championship (Inglaterra)",
    soccer_portugal_primeira_liga: "Primeira Liga (Portugal)",
    soccer_netherlands_eredivisie: "Eredivisie (Países Bajos)",
  };

  return (
    leagueMap[sportKey] ??
    sportKey.replace(/^soccer_/, "").replace(/_/g, " ").toUpperCase()
  );
}

function getDayKey(date: Date) {
  return date.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getRelativeDayKey(offset: -1 | 0 | 1) {
  const now = new Date();

  const nyNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );

  nyNow.setHours(0, 0, 0, 0);
  nyNow.setDate(nyNow.getDate() + offset);

  return nyNow.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getGameDayKey(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
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

function findPick(
  game: OddsGame,
  sport: string,
  mlbSignalsDataParam: { games: SignalGame[] }
): SignalGame | null {
  if (sport === "MLB") {
    const direct = mlbSignalsDataParam.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    const baseMatch =
      direct ||
      mlbSignalsDataParam.games.find((g) => isSameMatch(game, g)) ||
      null;

    if (!baseMatch) return null;

    // 🔴 IMPORTANTE: ya NO usamos top5 aquí para evitar errores
    return {
      ...baseMatch,
      isTop5: false,
      isTopSignal: false,
      topRank: null,
    };
  }

  if (sport === "NBA") {
    const direct = nbaSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    const baseMatch =
      direct ||
      nbaSignalsData.games.find((g) => isSameMatch(game, g)) ||
      null;

    if (!baseMatch) return null;

    return {
      ...baseMatch,
      isTop5: false,
      isTopSignal: false,
      topRank: null,
    };
  }

  if (sport === "NHL") {
    const direct = nhlSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    const baseMatch =
      direct ||
      nhlSignalsData.games.find((g) => isSameMatch(game, g)) ||
      null;

    if (!baseMatch) return null;

    return {
      ...baseMatch,
      isTop5: false,
      isTopSignal: false,
      topRank: null,
    };
  }

  if (sport === "SOCCER") {
    const direct = soccerSignalsData.games.find(
      (g) => String(g.gameId) === String(game.id)
    );

    const baseMatch =
      direct ||
      soccerSignalsData.games.find((g) => isSameMatch(game, g)) ||
      null;

    if (!baseMatch) return null;

    return {
      ...baseMatch,
      isTop5: false,
      isTopSignal: false,
      topRank: null,
    };
  }

  return null;
}

function findLivePick(
  game: LiveScore,
  sport: SportTab,
  signalsDataParam: { games: SignalGame[] }
): SignalGame | null {
  const signalSource = signalsDataParam?.games ?? [];

  const direct = signalSource.find(
    (g) => String(g.gameId) === String(game.id)
  );

  if (direct) return direct;

  const liveAway = normalizeName(game.away_team ?? "");
  const liveHome = normalizeName(game.home_team ?? "");

  const byExactName = signalSource.find((g) => {
    const signalAway = normalizeName(g.awayTeam ?? "");
    const signalHome = normalizeName(g.homeTeam ?? "");

    return liveAway === signalAway && liveHome === signalHome;
  });

  if (byExactName) return byExactName;

  const byFlexibleName = signalSource.find((g) => {
    const signalAway = normalizeName(g.awayTeam ?? "");
    const signalHome = normalizeName(g.homeTeam ?? "");

    const sameAway =
      liveAway.includes(signalAway) ||
      signalAway.includes(liveAway);

    const sameHome =
      liveHome.includes(signalHome) ||
      signalHome.includes(liveHome);

    return sameAway && sameHome;
  });

  if (byFlexibleName) return byFlexibleName;

  const byReversedName = signalSource.find((g) => {
    const signalAway = normalizeName(g.awayTeam ?? "");
    const signalHome = normalizeName(g.homeTeam ?? "");

    return liveAway === signalHome && liveHome === signalAway;
  });

  return byReversedName ?? null;
}

function getLivePickResult(game: LiveScore, pickData: SignalGame | null) {
  if (!pickData) return null;
  if (!game.completed) return "PENDING";

  const awayScore = Number(
    game.scores?.find((s) => s.name === game.away_team)?.score ?? NaN
  );

  const homeScore = Number(
    game.scores?.find((s) => s.name === game.home_team)?.score ?? NaN
  );

  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return "PENDING";
  }

  const pickRaw = String(pickData.pick ?? "").trim();
  if (!pickRaw) return "PENDING";

  const pick = pickRaw.toLowerCase();
  const pickNorm = normalizeName(pickRaw);

  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(game.away_team);
  const homeName = normalizeName(game.home_team);

  const awayLast = getLastWord(game.away_team);
  const homeLast = getLastWord(game.home_team);

  // TOTALS: Over 8.5 / Under 6 / O 8.5 / U 6
  const totalMatch =
    pick.match(/\bover\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bunder\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bo\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bu\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);
    if (!Number.isFinite(line)) return "PENDING";

    const isOver = /\bover\b|\bo\b/i.test(pick);
    const isUnder = /\bunder\b|\bu\b/i.test(pick);

    if (isOver) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (isUnder) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  // SPREADS: Team +1.5 / Team (-1.5)
  const spreadMatch = pickRaw.match(
    /^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/
  );

  if (spreadMatch) {
    const teamPartRaw = spreadMatch[1].trim();
    const teamPart = normalizeName(teamPartRaw);
    const teamLast = getLastWord(teamPartRaw);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    const isAwayTeam =
      teamPart.includes(awayName) ||
      awayName.includes(teamPart) ||
      (teamLast && teamLast === awayLast);

    const isHomeTeam =
      teamPart.includes(homeName) ||
      homeName.includes(teamPart) ||
      (teamLast && teamLast === homeLast);

    if (isAwayTeam) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (isHomeTeam) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
  }

  // MONEYLINE: Team ML / Team solo / último nombre
  const looksLikeAwayML =
    pickNorm.includes(awayName) ||
    awayName.includes(pickNorm) ||
    (awayLast && pickNorm.includes(awayLast));

  const looksLikeHomeML =
    pickNorm.includes(homeName) ||
    homeName.includes(pickNorm) ||
    (homeLast && pickNorm.includes(homeLast));

  if (looksLikeAwayML && !looksLikeHomeML) {
    if (awayScore > homeScore) return "WON";
    if (awayScore < homeScore) return "LOST";
    return "PUSH";
  }

  if (looksLikeHomeML && !looksLikeAwayML) {
    if (homeScore > awayScore) return "WON";
    if (homeScore < awayScore) return "LOST";
    return "PUSH";
  }

  return "PENDING";
}

function getLastWord(value: string) {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function isNameClose(a: string, b: string) {
  const na = normalizeName(a);
  const nb = normalizeName(b);

  if (!na || !nb) return false;

  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const lastA = getLastWord(a);
  const lastB = getLastWord(b);

  if (lastA && lastB && lastA === lastB) return true;

  return false;
}

function findScoreGameForPick(
  pick: { awayTeam?: string; homeTeam?: string },
  scoreGames: LiveScore[]
) {
  const pickAway = pick.awayTeam ?? "";
  const pickHome = pick.homeTeam ?? "";

  // 1. match exacto o invertido
  const exactMatch =
    scoreGames.find((game) => {
      return (
        (normalizeName(pickAway) === normalizeName(game.away_team) &&
          normalizeName(pickHome) === normalizeName(game.home_team)) ||
        (normalizeName(pickAway) === normalizeName(game.home_team) &&
          normalizeName(pickHome) === normalizeName(game.away_team))
      );
    }) || null;

  if (exactMatch) return exactMatch;

  // 2. match flexible o invertido
  const flexibleMatch =
    scoreGames.find((game) => {
      const normalMatch =
        isNameClose(pickAway, game.away_team) &&
        isNameClose(pickHome, game.home_team);

      const reversedMatch =
        isNameClose(pickAway, game.home_team) &&
        isNameClose(pickHome, game.away_team);

      return normalMatch || reversedMatch;
    }) || null;

  return flexibleMatch;
}

function gradePickFromScoreGame(
  game: LiveScore | null,
  rawPick: string
): "WON" | "LOST" | "PUSH" | "PENDING" {
  if (!game) return "PENDING";
  if (!game.completed) return "PENDING";

  const awayScore = Number(
    game.scores?.find((s) => s.name === game.away_team)?.score ?? NaN
  );
  const homeScore = Number(
    game.scores?.find((s) => s.name === game.home_team)?.score ?? NaN
  );

  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return "PENDING";
  }

  const pickRaw = String(rawPick ?? "").trim();
  if (!pickRaw) return "PENDING";

  const pick = pickRaw.toLowerCase();
  const pickNorm = normalizeName(pickRaw);
  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(game.away_team);
  const homeName = normalizeName(game.home_team);
  const awayLast = getLastWord(game.away_team);
  const homeLast = getLastWord(game.home_team);

  // =========================
  // 1. TOTALS
  // Soporta:
  // Over 5.5
  // Under 219
  // O 5.5
  // U 219
  // Over (5.5)
  // Under (219)
  // =========================
  const totalMatch =
    pick.match(/\bover\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bunder\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bo\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bu\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);

    if (!Number.isFinite(line)) return "PENDING";

    const isOver = /\bover\b|\bo\b/i.test(pick);
    const isUnder = /\bunder\b|\bu\b/i.test(pick);

    if (isOver) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (isUnder) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  // =========================
  // 2. SPREADS
  // Soporta:
  // Team +1.5
  // Team -3
  // Team (+1.5)
  // Team (-3)
  // =========================
  const spreadMatch = pickRaw.match(
    /^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/
  );

  if (spreadMatch) {
    const teamPartRaw = spreadMatch[1].trim();
    const teamPart = normalizeName(teamPartRaw);
    const teamLast = getLastWord(teamPartRaw);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    const isAwayTeam =
      teamPart.includes(awayName) ||
      awayName.includes(teamPart) ||
      (teamLast && teamLast === awayLast);

    const isHomeTeam =
      teamPart.includes(homeName) ||
      homeName.includes(teamPart) ||
      (teamLast && teamLast === homeLast);

    if (isAwayTeam) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (isHomeTeam) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
  }

  // =========================
  // 3. MONEYLINE
  // Soporta:
  // Team ML
  // Team
  // solo apellido / último nombre del equipo
  // =========================
  const looksLikeAwayML =
    pickNorm.includes(awayName) ||
    awayName.includes(pickNorm) ||
    (awayLast && pickNorm.includes(awayLast));

  const looksLikeHomeML =
    pickNorm.includes(homeName) ||
    homeName.includes(pickNorm) ||
    (homeLast && pickNorm.includes(homeLast));

  if (looksLikeAwayML && !looksLikeHomeML) {
    if (awayScore > homeScore) return "WON";
    if (awayScore < homeScore) return "LOST";
    return "PUSH";
  }

  if (looksLikeHomeML && !looksLikeAwayML) {
    if (homeScore > awayScore) return "WON";
    if (homeScore < awayScore) return "LOST";
    return "PUSH";
  }

  return "PENDING";
}

function getSubsPickResult(
  pick: { awayTeam?: string; homeTeam?: string; pick: string },
  scoreGames: LiveScore[]
) {
  const game = findScoreGameForPick(pick, scoreGames);
  return gradePickFromScoreGame(game, pick.pick);
}

function buildRecordStats(
  picks: Array<{ awayTeam?: string; homeTeam?: string; pick: string; isTopSignal?: boolean }>,
  scoreGames: LiveScore[]
) {
  const graded = picks.map((pick) => getSubsPickResult(pick, scoreGames));

  const wins = graded.filter((r) => r === "WON").length;
  const losses = graded.filter((r) => r === "LOST").length;
  const pushes = graded.filter((r) => r === "PUSH").length;
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

  return {
    wins,
    losses,
    pushes,
    decided,
    winRate,
  };
}

function buildHistoryRecordStats(history: any[]) {
  const wins = history.filter((item) => item.result === "WON").length;
  const losses = history.filter((item) => item.result === "LOST").length;
  const pushes = history.filter((item) => item.result === "PUSH").length;

  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

  return {
    wins,
    losses,
    pushes,
    decided,
    winRate,
  };
}

function getStatusStyles(status?: string) {
  const s = String(status ?? "PENDING").toUpperCase();

  if (s === "CONFIRMED") {
    return "bg-green-500/15 text-green-300 border-green-400/30";
  }

  if (s === "REMOVED") {
    return "bg-red-500/15 text-red-300 border-red-400/30";
  }

  if (s === "DOWNGRADED") {
    return "bg-yellow-500/15 text-yellow-300 border-yellow-400/30";
  }

  return "bg-white/10 text-white/60 border-white/15";
}

function getTop5BySport(
  sport: SportTab,
  mlbTop5DataParam: { top5: Top5Entry[] },
  nbaTop5DataParam: { top5: Top5Entry[] },
  nhlTop5DataParam: { top5: Top5Entry[] },
  soccerTop5DataParam: { top5: Top5Entry[] }
): Top5Entry[] {
  if (sport === "MLB") return mlbTop5DataParam.top5 ?? [];
  if (sport === "NBA") return nbaTop5DataParam.top5 ?? [];
  if (sport === "NHL") return nhlTop5DataParam.top5 ?? [];
  if (sport === "SOCCER") return soccerTop5DataParam.top5 ?? [];

  return [];
}

function getSubPicksForUser(
  userAccess: UserAccess,
  selectedSport: SportTab,
  mlbTop5DataParam: { top5: Top5Entry[] },
  nbaTop5DataParam: { top5: Top5Entry[] },
  nhlTop5DataParam: { top5: Top5Entry[] },
  soccerTop5DataParam: { top5: Top5Entry[] }
) {
  if (!hasSportAccess(userAccess, selectedSport)) return [];

  const top5 = getTop5BySport(
    selectedSport,
    mlbTop5DataParam,
    nbaTop5DataParam,
    nhlTop5DataParam,
    soccerTop5DataParam
  );

  if (userAccess.plan === "exclusive") {
    return top5.map((pick) => ({
      ...pick,
      label: "Top 5",
    }));
  }

  if (
    userAccess.plan === "premium" ||
    userAccess.plan === "elite" ||
    userAccess.plan === "admin"
  ) {
    return top5.map((pick) => ({
      ...pick,
      label:
  pick.isTopSignal === true || pick.rank === 1
    ? `Top Signal #${pick.rank ?? 1}`
    : `Top 5 #${pick.rank ?? ""}`,
    }));
  }

  return [];
}

function hasSportAccess(userAccess: UserAccess, sport: SportTab) {
  if (userAccess.plan === "elite" || userAccess.plan === "admin") return true;
  return userAccess.sports.includes(sport);
}

function canViewTopTab(userAccess: UserAccess) {
  return userAccess.plan === "elite" || userAccess.plan === "admin";
}

function canViewPickInSubs(
  userAccess: UserAccess,
  sport: SportTab,
  pickData: SignalGame | null
) {
  if (!pickData) return false;
  if (!hasSportAccess(userAccess, sport)) return false;

  if (userAccess.plan === "exclusive") {
    return !!pickData.isTop5;
  }

  if (userAccess.plan === "premium") {
    return !!pickData.isTop5 || !!pickData.isTopSignal;
  }

  if (userAccess.plan === "elite" || userAccess.plan === "admin") {
    return true;
  }

  return false;
}

function getSubsBadgeLabel(
  userAccess: UserAccess,
  pickData: SignalGame
) {
  if (userAccess.plan === "exclusive" && pickData.isTop5) {
    return "Top 5";
  }

  if (userAccess.plan === "premium") {
    if (pickData.isTopSignal) {
      return `Top Signal #${pickData.topRank ?? 1}`;
    }

    if (pickData.isTop5) {
      return `Top 5 #${pickData.topRank ?? ""}`;
    }
  }

  return null;
}

function HomeContent() {

const [mlbRecord, setMlbRecord] = useState({
  wins: 0,
  losses: 0,
  pushes: 0,
  winRate: 0,
});

const [nbaRecord, setNbaRecord] = useState({ wins: 0, losses: 0, pushes: 0, winRate: 0 });
const [nhlRecord, setNhlRecord] = useState({ wins: 0, losses: 0, pushes: 0, winRate: 0 });
const [soccerRecord, setSoccerRecord] = useState({ wins: 0, losses: 0, pushes: 0, winRate: 0 });

  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedSport, setSelectedSport] = useState<SportTab>("NHL");
  const [games, setGames] = useState<OddsGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveOddsGames, setLiveOddsGames] = useState<OddsGame[]>([]);

const [userAccess] = useState<UserAccess>({
  plan: "admin",
  sports: ["MLB", "NBA", "NHL", "SOCCER"],
});
console.log("USER PLAN:", userAccess.plan);

const [viewMode, setViewMode] = useState<"odds" | "live">("live");
const [liveGames, setLiveGames] = useState<LiveScore[]>([]);
const [liveLoading, setLiveLoading] = useState(false);
const [activeDay, setActiveDay] = useState<"yesterday" | "today" | "tomorrow">("today");
const [subsScoreGames, setSubsScoreGames] = useState<LiveScore[]>([]);
const [subsScoresLoading, setSubsScoresLoading] = useState(false);
const [topSignalHistory, setTopSignalHistory] = useState<any[]>([]);
const [top5History, setTop5History] = useState<any[]>([]);
const [mlbSignalsData, setMlbSignalsData] = useState<{ games: SignalGame[] }>({games: [],
});
const [mlbTop5Data, setMlbTop5Data] = useState<{ top5: Top5Entry[] }>({top5: [],
});
const [nbaSignalsData, setNbaSignalsData] = useState<{
  games: SignalGame[];
}>({
  games: [],
});
const [nbaTop5Data, setNbaTop5Data] = useState<{
  top5: Top5Entry[];
}>({
  top5: [],
});
const [nhlSignalsData, setNhlSignalsData] = useState<{ games: SignalGame[] }>({
  games: [],
});

const [nhlTop5Data, setNhlTop5Data] = useState<{
  top5: Top5Entry[];
}>({
  top5: [],
});

const [soccerSignalsLiveData, setSoccerSignalsLiveData] = useState<{ games: SignalGame[] }>({
  games: [],
});

const [soccerTop5LiveData, setSoccerTop5LiveData] = useState<{
  top5: Top5Entry[];
}>({
  top5: [],
});

  useEffect(() => {
  async function loadAllSupabaseSignals() {
    const [
      mlbPublic,
      mlbTop5,
      nbaPublic,
      nbaTop5,
      nhlPublic,
      nhlTop5,
      soccerPublic,
      soccerTop5,
    ] = await Promise.all([
      getMlbPublicSignals(),
      getMlbTop5Live(),
      getNbaPublicSignals(),
      getNbaTop5Live(),
      getNhlPublicSignals(),
      getNhlTop5Live(),
      getSoccerPublicSignals(),
      getSoccerTop5Live(),
    ]);

    setMlbSignalsData({
      games: (mlbPublic || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        startTime: g.start_time,
      })),
    });

    setMlbTop5Data({
  top5: (mlbTop5 || []).map((g: any) => ({
    gameId: g.gameId ?? g.game_id,
    awayTeam: g.awayTeam ?? g.away_team,
    homeTeam: g.homeTeam ?? g.home_team,
    pick: g.pick,
    market: g.market,
    line: g.line,
    odds: g.odds,
    status: g.status,
    rank: g.rank,
    isTopSignal: g.isTopSignal ?? g.is_top_signal ?? g.rank === 1,
    confidence: g.confidence,
    internalScore: g.internalScore ?? g.internal_score,
    edge: g.edge,
    startTime: g.startTime ?? g.start_time,
  })),
});

    setNbaSignalsData({
      games: (nbaPublic || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        startTime: g.start_time,
      })),
    });

    setNbaTop5Data({
      top5: (nbaTop5 || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        rank: g.rank,
        isTopSignal: g.is_top_signal,
        confidence: g.confidence,
        internalScore: g.internal_score,
        edge: g.edge,
        startTime: g.start_time,
      })),
    });

    setNhlSignalsData({
      games: (nhlPublic || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        startTime: g.start_time,
      })),
    });

    setNhlTop5Data({
      top5: (nhlTop5 || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        rank: g.rank,
        isTopSignal: g.is_top_signal,
        confidence: g.confidence,
        internalScore: g.internal_score,
        edge: g.edge,
        startTime: g.start_time,
      })),
    });

    setSoccerSignalsLiveData({
      games: (soccerPublic || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        startTime: g.start_time,
      })),
    });

    setSoccerTop5LiveData({
      top5: (soccerTop5 || []).map((g: any) => ({
        gameId: g.game_id,
        awayTeam: g.away_team,
        homeTeam: g.home_team,
        pick: g.pick,
        market: g.market,
        line: g.line,
        odds: g.odds,
        status: g.status,
        rank: g.rank,
        isTopSignal: g.is_top_signal,
        confidence: g.confidence,
        internalScore: g.internal_score,
        edge: g.edge,
        startTime: g.start_time,
      })),
    });
  }

  loadAllSupabaseSignals();

  const interval = setInterval(() => {
    loadAllSupabaseSignals();
  }, 30000);

  return () => clearInterval(interval);
}, []);

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
  [mlbTop5Data, nbaTop5Data, nhlTop5Data]
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

  return liveGames.filter((game) => {
    const gameDayKey = getGameDayKey(game.commence_time);
    const live = isGameLive(game);

    if (activeDay === "today") {
      return gameDayKey === todayKey || live;
    }

    if (activeDay === "yesterday") {
      return gameDayKey === yesterdayKey;
    }

    return gameDayKey === tomorrowKey;
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

function getLiveDisplayName(teamName: string) {
  return getTeamData(teamName)?.shortName ?? teamName;
}

function handleLiveGameClick(game: LiveScore, sport: SportTab) {
  router.push(
    `/live-game?sport=${encodeURIComponent(sport)}&gameId=${encodeURIComponent(
      game.id
    )}&awayTeam=${encodeURIComponent(game.away_team)}&homeTeam=${encodeURIComponent(
      game.home_team
    )}&commenceTime=${encodeURIComponent(
      game.commence_time
    )}&returnSport=${encodeURIComponent(sport)}&returnView=live&returnDay=${encodeURIComponent(
      activeDay
    )}`
  );
}

function findOddsGameForLive(
  liveGame: LiveScore,
  oddsGames: OddsGame[]
) {
  const liveAway = normalizeName(liveGame.away_team);
  const liveHome = normalizeName(liveGame.home_team);

  return (
    oddsGames.find((game) => {
      const away = normalizeName(game.away_team);
      const home = normalizeName(game.home_team);

      return (
        (liveAway === away && liveHome === home) ||
        (liveAway === home && liveHome === away)
      );
    }) || null
  );
}

useEffect(() => {
  const sportFromUrl = searchParams.get("sport") as SportTab | null;
  const viewFromUrl = searchParams.get("view") as "odds" | "live" | null;
  const dayFromUrl = searchParams.get("day") as
    | "yesterday"
    | "today"
    | "tomorrow"
    | null;

  if (sportFromUrl && sportsTabs.includes(sportFromUrl)) {
    setSelectedSport(sportFromUrl);
  }

  if (viewFromUrl === "live" || viewFromUrl === "odds") {
    setViewMode(viewFromUrl);
  }

  if (dayFromUrl === "yesterday" || dayFromUrl === "today" || dayFromUrl === "tomorrow") {
    setActiveDay(dayFromUrl);
  }
}, [searchParams]);

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
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  function hasLiveGames(games: LiveScore[]) {
    return games.some(
      (game) =>
        !game.completed &&
        Array.isArray(game.scores) &&
        game.scores.length > 0
    );
  }

  function hasUpcomingGames(games: LiveScore[]) {
    const now = Date.now();

    return games.some((game) => {
      const start = new Date(game.commence_time).getTime();
      const diffMinutes = (start - now) / (1000 * 60);

      return diffMinutes >= 0 && diffMinutes <= 120;
    });
  }

  function getRefreshDelay(games: LiveScore[]) {
    if (document.visibilityState === "hidden") {
      return 120000; // background: 2 min
    }

    if (hasLiveGames(games)) {
      return 15000; // live games: 15 sec
    }

    if (hasUpcomingGames(games)) {
      return 30000; // games within 2h: 30 sec
    }

    return 180000; // quiet period: 3 min
  }

  async function loadLiveGames() {
    if (viewMode !== "live") return;

    try {
      setLiveLoading(true);

      if (selectedSport === "TOP" || selectedSport === "NFL") {
        setLiveGames([]);
        setLiveOddsGames([]);
        return;
      }

      const scoresRes = await fetch(`/api/scores?sport=${selectedSport}`, {
        cache: "no-store",
      });

      const scoresData = await scoresRes.json();
      const nextLiveGames = Array.isArray(scoresData)
        ? (scoresData as LiveScore[])
        : [];

      if (cancelled) return;

      setLiveGames(nextLiveGames);

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

        const oddsResponses = await Promise.all(
          soccerLeagues.map(async (league) => {
            try {
              const res = await fetch(`/api/odds?sport=${league}`, {
                cache: "no-store",
              });

              const data = await res.json();
              return Array.isArray(data) ? (data as OddsGame[]) : [];
            } catch {
              return [];
            }
          })
        );

        if (!cancelled) {
          setLiveOddsGames(oddsResponses.flat());
        }
      } else {
        const sportMap: Record<"NHL" | "NBA" | "MLB", string> = {
          NHL: "icehockey_nhl",
          NBA: "basketball_nba",
          MLB: "baseball_mlb",
        };

        const apiSport = sportMap[selectedSport as "NHL" | "NBA" | "MLB"];

        const oddsRes = await fetch(`/api/odds?sport=${apiSport}`, {
          cache: "no-store",
        });

        const oddsData = await oddsRes.json();

        if (!cancelled) {
          setLiveOddsGames(
            Array.isArray(oddsData) ? (oddsData as OddsGame[]) : []
          );
        }
      }

      const delay = getRefreshDelay(nextLiveGames);

      if (!cancelled) {
        timeoutId = setTimeout(loadLiveGames, delay);
      }
    } catch (error) {
      if (!cancelled) {
        setLiveGames([]);
        setLiveOddsGames([]);
        timeoutId = setTimeout(loadLiveGames, 60000);
      }
    } finally {
      if (!cancelled) {
        setLiveLoading(false);
      }
    }
  }

  function handleVisibilityChange() {
    if (timeoutId) clearTimeout(timeoutId);

    if (document.visibilityState === "visible") {
      loadLiveGames();
    } else {
      timeoutId = setTimeout(loadLiveGames, 120000);
    }
  }

  loadLiveGames();

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    cancelled = true;

    if (timeoutId) clearTimeout(timeoutId);

    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, [viewMode, selectedSport]);

useEffect(() => {
  if (!mlbTop5Data.top5 || mlbTop5Data.top5.length === 0) return;

  const mlbTopSignal =
    mlbTop5Data.top5.find((pick) => pick.isTopSignal) ||
    mlbTop5Data.top5[0];

  if (!mlbTopSignal) return;

console.log("MLB TOP SIGNAL:", mlbTopSignal);

  fetch("/api/save-top-signal/mlb", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
  mlbTop5Data.top5?.[0]?.startTime
    ? new Date(mlbTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      })
    : new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }),
      sport: "MLB",
      awayTeam: mlbTopSignal.awayTeam ?? "",
      homeTeam: mlbTopSignal.homeTeam ?? "",
      pick: mlbTopSignal.pick ?? "",
      market:
        String(mlbTopSignal.pick ?? "").toLowerCase().includes("over") ||
        String(mlbTopSignal.pick ?? "").toLowerCase().includes("under")
          ? "totals"
          : /[+-]\d+(\.\d+)?/.test(String(mlbTopSignal.pick ?? ""))
          ? "spread"
          : "ml",
      line: null,
      odds: null,
      result: "PENDING",
      gradedAt: null,
      home_score: null,
      away_score: null,
      isTopSignal: true,
      startTime: mlbTopSignal.startTime ?? null,
    }),
  })
    .then((res) => res.json())
    .then((data) => console.log("MLB saved:", data))
    .catch((err) => console.log("MLB error:", err));
}, []);

useEffect(() => {
  if (!mlbTop5Data.top5 || mlbTop5Data.top5.length === 0) return;

  fetch("/api/save-top5/mlb", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        mlbTop5Data.top5?.[0]?.startTime
          ? new Date(mlbTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      picks: mlbTop5Data.top5,
    }),
  });
}, [mlbTop5Data]);

useEffect(() => {
  if (!nbaTop5Data.top5 || nbaTop5Data.top5.length === 0) return;

  fetch("/api/save-top5/nba", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        nbaTop5Data.top5?.[0]?.startTime
          ? new Date(nbaTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      picks: nbaTop5Data.top5,
    }),
  });
}, [nbaTop5Data]);

useEffect(() => {
  if (!nhlTop5Data.top5 || nhlTop5Data.top5.length === 0) return;

  fetch("/api/save-top5/nhl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        nhlTop5Data.top5?.[0]?.startTime
          ? new Date(nhlTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      picks: nhlTop5Data.top5,
    }),
  });
}, [nhlTop5Data]);

useEffect(() => {
  if (!soccerTop5Data.top5 || soccerTop5Data.top5.length === 0) return;

  fetch("/api/save-top5/soccer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        soccerTop5Data.top5?.[0]?.startTime
          ? new Date(soccerTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      picks: soccerTop5Data.top5,
    }),
  });
}, [soccerTop5Data]);

useEffect(() => {
  const nbaTopSignal =
    nbaTop5Data.top5?.find((pick) => pick.isTopSignal) ||
    nbaTop5Data.top5?.[0];

  if (!nbaTopSignal) return;

  fetch("/api/save-top-signal/nba", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date:
        nbaTop5Data.top5?.[0]?.startTime
          ? new Date(nbaTop5Data.top5[0].startTime).toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            })
          : new Date().toLocaleDateString("en-CA", {
              timeZone: "America/New_York",
            }),
      sport: "NBA",
      awayTeam: nbaTopSignal.awayTeam ?? "",
      homeTeam: nbaTopSignal.homeTeam ?? "",
      pick: nbaTopSignal.pick ?? "",
      market:
        String(nbaTopSignal.pick ?? "").toLowerCase().includes("over") ||
        String(nbaTopSignal.pick ?? "").toLowerCase().includes("under")
          ? "totals"
          : /[+-]\d+(\.\d+)?/.test(String(nbaTopSignal.pick ?? ""))
          ? "spread"
          : "ml",
      line: null,
      odds: null,
      result: "PENDING",
      gradedAt: null,
      home_score: null,
      away_score: null,
      isTopSignal: true,
      startTime: nbaTopSignal.startTime ?? null,
    }),
  });
}, [nbaTop5Data]);

useEffect(() => {
  const nhlTopSignal =
    nhlTop5Data.top5?.find((pick) => pick.isTopSignal) ||
    nhlTop5Data.top5?.[0];

  if (!nhlTopSignal) return;

  fetch("/api/save-top-signal/nhl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date: new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }),
      sport: "NHL",
      awayTeam: nhlTopSignal.awayTeam ?? "",
      homeTeam: nhlTopSignal.homeTeam ?? "",
      pick: nhlTopSignal.pick ?? "",
      market:
        String(nhlTopSignal.pick ?? "").toLowerCase().includes("over") ||
        String(nhlTopSignal.pick ?? "").toLowerCase().includes("under")
          ? "totals"
          : /[+-]\d+(\.\d+)?/.test(String(nhlTopSignal.pick ?? ""))
          ? "spread"
          : "ml",
      line: null,
      odds: null,
      result: "PENDING",
      gradedAt: null,
      home_score: null,
      away_score: null,
      isTopSignal: true,
      startTime: nhlTopSignal.startTime ?? null,
    }),
  });
}, [nhlTop5Data]);

useEffect(() => {
  const soccerTopSignal =
    soccerTop5Data.top5?.find((pick) => pick.isTopSignal) ||
    soccerTop5Data.top5?.[0];

  if (!soccerTopSignal) return;

  fetch("/api/save-top-signal/soccer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date: new Date().toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      }),
      sport: "SOCCER",
      awayTeam: soccerTopSignal.awayTeam ?? "",
      homeTeam: soccerTopSignal.homeTeam ?? "",
      pick: soccerTopSignal.pick ?? "",
      market:
        String(soccerTopSignal.pick ?? "").toLowerCase().includes("over") ||
        String(soccerTopSignal.pick ?? "").toLowerCase().includes("under")
          ? "totals"
          : /[+-]\d+(\.\d+)?/.test(String(soccerTopSignal.pick ?? ""))
          ? "spread"
          : "ml",
      line: null,
      odds: null,
      result: "PENDING",
      gradedAt: null,
      home_score: null,
      away_score: null,
      isTopSignal: true,
      startTime: soccerTopSignal.startTime ?? null,
    }),
  });
}, [soccerTop5Data]);

const isTopTab = selectedSport === "TOP";

useEffect(() => {
  async function loadRecord() {
    try {
      let endpoint = "";

      setMlbRecord({ wins: 0, losses: 0, pushes: 0, winRate: 0 });
setNbaRecord({ wins: 0, losses: 0, pushes: 0, winRate: 0 });
setNhlRecord({ wins: 0, losses: 0, pushes: 0, winRate: 0 });
setSoccerRecord({ wins: 0, losses: 0, pushes: 0, winRate: 0 });

      if (selectedSport === "MLB") {
        endpoint = "/api/top-signal-record/mlb";
      }

      if (selectedSport === "NBA") {
        endpoint = "/api/top-signal-record/nba";
      }

      if (selectedSport === "NHL") {
        endpoint = "/api/top-signal-record/nhl";
      }

      if (selectedSport === "SOCCER") {
        endpoint = "/api/top-signal-record/soccer";
      }

      if (!endpoint) return;

      const res = await fetch(endpoint, {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
  const recordData = {
    wins: data.wins,
    losses: data.losses,
    pushes: data.pushes,
    winRate: data.winRate,
  };

  if (selectedSport === "MLB") {
    setMlbRecord(recordData);
  }

  if (selectedSport === "NBA") {
    setNbaRecord(recordData);
  }

  if (selectedSport === "NHL") {
    setNhlRecord(recordData);
  }

  if (selectedSport === "SOCCER") {
    setSoccerRecord(recordData);
  }
}
    } catch (err) {
      console.log("Error loading record");
    }
  }

  loadRecord();
}, [selectedSport]);

useEffect(() => {
  async function loadHistory() {
    try {
      let endpoint = "";

      setTopSignalHistory([]);

      if (selectedSport === "MLB") {
        endpoint = "/api/top-signal-history/mlb";
      }

      if (selectedSport === "NHL") {
  endpoint = "/api/top-signal-history/nhl";
}

if (selectedSport === "NBA") {
  endpoint = "/api/top-signal-history/nba";
}

if (selectedSport === "SOCCER") {
  endpoint = "/api/top-signal-history/soccer";
}

      if (!endpoint) return;

      const res = await fetch(endpoint, {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
        setTopSignalHistory(data.history);
      }
    } catch (err) {
      console.log("Error loading history");
    }
  }

  loadHistory();
}, [selectedSport]);

useEffect(() => {
  async function loadTop5History() {
    try {
      let endpoint = "";

      if (selectedSport === "NHL") {
  endpoint = "/api/top5-history-live/nhl";
}

if (selectedSport === "MLB") {
  endpoint = "/api/top5-history-live/mlb";
}

if (selectedSport === "NBA") {
  endpoint = "/api/top5-history-live/nba";
}

if (selectedSport === "SOCCER") {
  endpoint = "/api/top5-history-live/soccer";
}

      if (!endpoint) {
        setTop5History([]);
        return;
      }

      const res = await fetch(endpoint, {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
        setTop5History(data.history);
      } else {
        setTop5History([]);
      }
    } catch (err) {
      console.log("Error loading top 5 history");
      setTop5History([]);
    }
  }

  loadTop5History();
}, [selectedSport, viewMode, activeDay]);

const subsPicks = useMemo(() => {
  return getSubPicksForUser(
    userAccess,
    selectedSport,
    mlbTop5Data,
    nbaTop5Data,
    nhlTop5Data,
    soccerTop5LiveData
  );
}, [
  userAccess,
  selectedSport,
  mlbTop5Data,
  nbaTop5Data,
  nhlTop5Data,
  soccerTop5LiveData,
]);

const top5RecordStats = useMemo(() => {
  return buildHistoryRecordStats(top5History);
}, [top5History]);

const eliteTopSignals = useMemo(() => {
  return topSignals ?? [];
}, [topSignals]);

  return (
  <main className="min-h-screen bg-[#050816] text-white">
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#050816]/95 px-4 pb-3 pt-5 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
  <img
    src="/atlas-logo.png"
    alt="Atlas Signals"
    className="h-8 w-8 object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]"
  />

  <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-400/90">
    Atlas Signals
  </p>
</div>
</div>
            <h1 className="mt-1 text-[40px] font-bold leading-none tracking-tight">
              Games
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
              Subs
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

      <section className="flex-1 space-y-3 px-4 py-3">
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
                Previous
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
                Upcoming
              </button>
            </div>

            {liveLoading ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
                Loading live games...
              </div>
              
            ) : groupedFilteredLiveGames.length === 0 ? (
              selectedSport === "TOP" ? (
                <div className="rounded-[28px] border border-cyan-400/20 bg-cyan-400/10 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                    TOP Live
                  </p>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
                    TOP is not available in Live
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/70">
                    Use the Subs section to unlock Top Signals and review the strongest plays available with an Elite subscription.
                  </p>
                </div>
              ) : selectedSport === "NFL" ? (
                <div className="rounded-[28px] border border-yellow-400/20 bg-yellow-500/10 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-yellow-300">
                    NFL
                  </p>

                  <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
                    NFL is not available yet
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/70">
                    NFL support is coming in a future update. This section will activate once the market and signal system are ready.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
                  No live games available.
                </div>
              )
            ) : (
              <div className="space-y-3">
                {groupedFilteredLiveGames.map((group) => (
                  <article
                    key={group.leagueKey}
                    className="overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.04]"
                  >
                    <div className="border-b border-white/10 px-3 py-2.5">
                      <p className="text-[14px] font-semibold tracking-tight text-white">
                        {group.title}
                      </p>
                    </div>

                    <div>
                      {group.games.map((game, idx) => {
                        const oddsGame = findOddsGameForLive(game, liveOddsGames);

const livePickData =
  group.sport === "MLB"
    ? findLivePick(game, group.sport, mlbSignalsData)
    : group.sport === "NBA"
    ? findLivePick(game, group.sport, nbaSignalsData)
    : group.sport === "NHL"
    ? findLivePick(game, group.sport, nhlSignalsData)
    : group.sport === "SOCCER"
    ? findLivePick(game, group.sport, soccerSignalsLiveData)
    : null;

const result = getLivePickResult(game, livePickData);

const top5 = getTop5BySport(
  group.sport,
  mlbTop5Data,
  nbaTop5Data,
  nhlTop5Data,
  soccerTop5LiveData
);

const isTop5 =
  !!livePickData &&
  top5.some((p) => {
    const sameGame =
      String((p as any).gameId) === String(livePickData.gameId) ||
      (
        normalizeName(p.awayTeam ?? "") === normalizeName(livePickData.awayTeam ?? "") &&
        normalizeName(p.homeTeam ?? "") === normalizeName(livePickData.homeTeam ?? "")
      );

    const samePick =
      normalizeName(p.pick ?? "") === normalizeName(livePickData.pick ?? "");

    return sameGame && samePick;
  });

                        const awayScore =
                          game.scores?.find((s) => s.name === game.away_team)
                            ?.score ?? "-";
                        const homeScore =
                          game.scores?.find((s) => s.name === game.home_team)
                            ?.score ?? "-";

                        return (
                          <button
                            key={`${game.id}-${idx}`}
                            type="button"
                            onClick={() => handleLiveGameClick(game, group.sport)}
                            className={`block w-full px-3 py-2.5 text-left transition-all active:scale-[0.995] ${
                              idx !== group.games.length - 1
                                ? "border-b border-white/10"
                                : ""
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex min-w-0 w-[38%] items-center justify-end">
                                <div className="flex min-w-0 items-center gap-2">
                                  <p className="truncate text-right text-[13px] font-medium text-white">
                                    {getLiveDisplayName(game.away_team)}
                                  </p>
                                  <div className="shrink-0">
                                    <TeamBadge
                                      teamName={game.away_team}
                                      sport={group.sport}
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex w-[24%] flex-col items-center justify-center">
                                {awayScore === "-" && homeScore === "-" ? (
                                  <span className="text-[14px] font-semibold text-white">
                                    {formatTime(game.commence_time)}
                                  </span>
                                ) : (
                                  <>
                                    <span
                                      className={`text-[10px] font-semibold ${
                                        game.completed
                                          ? "text-white/60"
                                          : "text-red-400"
                                      }`}
                                    >
                                      {getGameMinute(game)}
                                    </span>

                                    <div className="mt-0.5 flex items-center gap-1.5">
                                      <span className="text-[16px] font-bold text-white">
                                        {awayScore}
                                      </span>
                                      <span className="text-white/50">-</span>
                                      <span className="text-[16px] font-bold text-white">
                                        {homeScore}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="flex min-w-0 w-[38%] items-center">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="shrink-0">
                                    <TeamBadge
                                      teamName={game.home_team}
                                      sport={group.sport}
                                    />
                                  </div>
                                  <p className="truncate text-left text-[13px] font-medium text-white">
                                    {getLiveDisplayName(game.home_team)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="mt-2 flex justify-center gap-2">
  <div className="min-w-[68px] rounded-full bg-black/60 px-2.5 py-1 text-center text-[11px]">
    {oddsGame
      ? formatAmericanOdds(getMoneyline(oddsGame, oddsGame.away_team))
      : "N/A"}
  </div>

  <div className="min-w-[68px] rounded-full bg-black/60 px-2.5 py-1 text-center text-[11px]">
    {(() => {
      if (!oddsGame) return "N/A";

      if (selectedSport === "SOCCER") {
        const drawOdds = getDrawOdds(oddsGame);
        return drawOdds !== null ? formatAmericanOdds(drawOdds) : "DRAW";
      }

      const totalValues = getTotalValues(oddsGame);
      return totalValues.overLabel !== "N/A"
        ? totalValues.overLabel.replace("O ", "O/U ")
        : "N/A";
    })()}
  </div>

  <div className="min-w-[68px] rounded-full bg-black/60 px-2.5 py-1 text-center text-[11px]">
    {oddsGame
      ? formatAmericanOdds(getMoneyline(oddsGame, oddsGame.home_team))
      : "N/A"}
  </div>
</div>

                            {livePickData ? (
                              <div className="mt-2 flex justify-center">
                                {result === "WON" ? (
                                  <div className="inline-flex items-center rounded-full border border-green-400/20 bg-green-500/15 px-2.5 py-1">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-green-300">
                                      {isTop5 ? "Signal Won • Top 5" : "Signal Won"}
                                    </p>
                                  </div>
                                ) : result === "LOST" ? (
                                  <div className="inline-flex items-center rounded-full border border-red-400/20 bg-red-500/15 px-2.5 py-1">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-red-300">
                                      {isTop5 ? "Signal Lost • Top 5" : "Signal Lost"}
                                    </p>
                                  </div>
                                ) : result === "PUSH" ? (
                                  <div className="inline-flex items-center rounded-full border border-yellow-400/20 bg-yellow-500/15 px-2.5 py-1">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-yellow-300">
                                      {isTop5 ? "Signal Push • Top 5" : "Signal Push"}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-300">
                                      Signal Detected
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : loading ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
            Loading {selectedSport} games...
          </div>
        ) : isTopTab ? (
          canViewTopTab(userAccess) ? (
            eliteTopSignals.length === 0 ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
                No Top Signals available today.
              </div>
            ) : (
              <div className="space-y-3">
                {eliteTopSignals.map((pick, idx) => (
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
                      

<div
  className={`mb-3 inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]
    ${
      pick.status === "WON"
        ? "bg-green-500/15 text-green-300 border border-green-400/30"
        : pick.status === "LOST"
        ? "bg-red-500/15 text-red-300 border border-red-400/30"
        : pick.status === "PUSH"
        ? "bg-yellow-500/15 text-yellow-300 border border-yellow-400/30"
        : "bg-cyan-400/10 text-cyan-300 border border-cyan-400/25"
    }
  `}
>
  {pick.status === "WON"
    ? "Signal Won"
    : pick.status === "LOST"
    ? "Signal Lost"
    : pick.status === "PUSH"
    ? "Signal Push"
    : "Signal Detected"}
</div>

                      <p className="text-[20px] font-semibold leading-tight tracking-tight text-white">
                        {formatDisplayedPick(pick.pick, pick.sport)}
                      </p>

                      <div
                        className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${getStatusStyles(
                          pick.status
                        )}`}
                      >
                        {String(pick.status ?? "PENDING")}
                      </div>

                      <p className="mt-2 text-[11px] text-white/40">
                        {pick.status === "CONFIRMED" && "Validated by system"}
                        {pick.status === "REMOVED" && "Signal removed due to market shift"}
                        {pick.status === "DOWNGRADED" &&
                          "Confidence reduced before game time"}
                        {!pick.status && "Monitoring market conditions"}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )
          ) : (
            <div className="rounded-[28px] border border-cyan-400/20 bg-cyan-400/10 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                Unlock TOP
              </p>

              <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
                Access Top Signals across all sports
              </h2>

              <p className="mt-2 text-sm leading-6 text-white/70">
                The TOP section is reserved for Elite subscribers and includes the strongest
                signal detected in each available sport for the day.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                  Elite only
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                  Top signal by sport
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                  Daily strongest signals
                </span>
              </div>

              <div className="mt-5 space-y-2 text-[13px] text-white/65">
                <p>• NBA Top Signal</p>
                <p>• NHL Top Signal</p>
                <p>• MLB Top Signal</p>
                <p>• Soccer Top Signal</p>
              </div>

              <button className="mt-5 w-full rounded-[18px] bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition-all">
                Unlock TOP Access
              </button>
            </div>
          )
        ) : selectedSport === "NFL" ? (
          <div className="rounded-[28px] border border-yellow-400/20 bg-yellow-500/10 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-yellow-300">
              NFL
            </p>

            <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
              NFL is not available yet
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/70">
              NFL subscriptions are not active yet. This sport will be added once the
              signal engine and market workflow are ready.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                Coming soon
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                Signals in development
              </span>
            </div>
          </div>
        ) : !hasSportAccess(userAccess, selectedSport) ? (
          <div className="rounded-[28px] border border-cyan-400/20 bg-cyan-400/10 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
              Unlock {selectedSport}
            </p>

            <h2 className="mt-2 text-[20px] font-semibold tracking-tight text-white">
              Add {selectedSport} to your subscription
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/70">
              Access today’s signals for {selectedSport}, track the strongest opportunities
              and unlock premium validation before game time.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                Exclusive: Top 5
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75">
                Premium: Ranked + Top Signal
              </span>
            </div>

            <div className="mt-5 space-y-2 text-[13px] text-white/65">
              <p>• Access signals for {selectedSport}</p>
              <p>• View the daily Top 5 picks</p>
              <p>• Unlock stronger premium validation</p>
            </div>

            <button className="mt-5 w-full rounded-[18px] bg-cyan-500 px-4 py-3 text-sm font-bold text-black transition-all">
              Subscribe to {selectedSport}
            </button>
          </div>
        ) : subsPicks.length === 0 ? (
  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
    No subscription picks available for {selectedSport}.
  </div>
) : (
  <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Top Signal
        </p>
        <p className="mt-2 text-[16px] font-bold text-white">
          {mlbRecord.wins}-{mlbRecord.losses}
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Push: {mlbRecord.pushes}
        </p>
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Top 5
        </p>
        <p className="mt-2 text-[16px] font-bold text-white">
          {top5RecordStats.wins}-{top5RecordStats.losses}
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Push: {top5RecordStats.pushes}
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Today
        </p>
      </div>

      <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
          Win Rate
        </p>
        <p className="mt-2 text-[16px] font-bold text-white">
          {mlbRecord.winRate}%
        </p>
        <p className="mt-1 text-[11px] text-white/55">
          Top Signal
        </p>
      </div>
    </div>

    {subsScoresLoading ? (
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
        Loading results...
      </div>
    ) : null}

    {subsPicks.map((pick, idx) => {
      const finalResult = getSubsPickResult(pick, subsScoreGames);

      const resultLabel =
        finalResult === "WON"
          ? "Signal Won"
          : finalResult === "LOST"
          ? "Signal Lost"
          : finalResult === "PUSH"
          ? "Signal Push"
          : "Signal Detected";

      const resultClass =
        finalResult === "WON"
          ? "bg-green-500/15 text-green-300 border-green-400/30"
          : finalResult === "LOST"
          ? "bg-red-500/15 text-red-300 border-red-400/30"
          : finalResult === "PUSH"
          ? "bg-yellow-500/15 text-yellow-300 border-yellow-400/30"
          : "bg-cyan-400/10 text-cyan-300 border-cyan-400/25";

      return (
        <article
          key={`subs-pick-${selectedSport}-${idx}`}
          className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
        >
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
              {selectedSport}
            </p>

            {pick.startTime && (
              <p className="mt-2 text-[13px] font-medium text-white/55">
                {formatTime(pick.startTime)}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TeamBadge teamName={pick.awayTeam ?? ""} sport={selectedSport} />
              <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                {getDisplayAbbr(pick.awayTeam ?? "")}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <TeamBadge teamName={pick.homeTeam ?? ""} sport={selectedSport} />
              <p className="truncate text-[16px] font-semibold tracking-tight text-white">
                {getDisplayAbbr(pick.homeTeam ?? "")}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-cyan-400/25 bg-cyan-400/10 p-4">
            <div
              className={`mb-3 inline-flex rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${resultClass}`}
            >
              {resultLabel}
            </div>

            <p className="text-[20px] font-semibold leading-tight tracking-tight text-white">
              {formatDisplayedPick(pick.pick, selectedSport)}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <div
                className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${getStatusStyles(
                  pick.status
                )}`}
              >
                {String(pick.status ?? "PENDING")}
              </div>

              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  String(pick.label).includes("Top Signal")
                    ? "bg-purple-500/18 text-purple-300"
                    : "bg-yellow-500/18 text-yellow-300"
                }`}
              >
                {pick.label}
              </span>
            </div>

            <p className="mt-2 text-[11px] text-white/40">
              {pick.status === "CONFIRMED" && "Validated by system"}
              {pick.status === "REMOVED" && "Signal removed due to market shift"}
              {pick.status === "DOWNGRADED" &&
                "Confidence reduced before game time"}
              {!pick.status && "Monitoring market conditions"}
            </p>
          </div>
        </article>
      );
    })}
  </div>
)}

{viewMode === "odds" && (
  <div className="mt-6">
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
      Top Signal History
    </p>

    <div className="mt-3 space-y-2">
      {topSignalHistory.length === 0 ? (
        <div className="text-[12px] text-white/40">
          No history available
        </div>
      ) : (
        topSignalHistory.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2"
          >
            <div>
              <p className="text-[13px] font-medium text-white">
                {item.away_team} vs {item.home_team}
              </p>
              <p className="text-[11px] text-white/50">
                {item.pick}
              </p>
            </div>

            <div
              className={`text-[11px] font-semibold ${
                item.result === "WON"
                  ? "text-green-400"
                  : item.result === "LOST"
                  ? "text-red-400"
                  : item.result === "PUSH"
                  ? "text-yellow-400"
                  : "text-white/40"
              }`}
            >
              {item.result}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
)}

{viewMode === "live" && activeDay === "yesterday" && (
  <div className="mt-6">
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/50">
      Top 5 Signals History
    </p>

    <div className="mt-3 space-y-2">
      {top5History.length === 0 ? (
        <div className="text-[12px] text-white/40">
          No history available
        </div>
      ) : (
        top5History.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-[14px] border border-white/10 bg-white/[0.04] px-3 py-2"
          >
            <div>
              <p className="text-[13px] font-medium text-white">
                {item.away_team} vs {item.home_team}
              </p>
              <p className="text-[11px] text-white/50">
                {item.pick}
              </p>
            </div>

            <div
              className={`text-[11px] font-semibold ${
                item.result === "WON"
                  ? "text-green-400"
                  : item.result === "LOST"
                  ? "text-red-400"
                  : item.result === "PUSH"
                  ? "text-yellow-400"
                  : "text-white/40"
              }`}
            >
              {item.result}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
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
export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#050816] text-white">
          <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/60">
              Loading...
            </div>
          </div>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}