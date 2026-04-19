"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import mlbSignals from "@/data/mlb-public-signals.json";
import nbaSignals from "@/data/nba-public-signals.json";
import nhlSignals from "@/data/nhl-public-signals.json";
import soccerSignals from "@/data/soccer-public-signals.json";
import mlbTop5 from "@/data/mlb-top5.json";
import nbaTop5 from "@/data/nba-top5.json";
import nhlTop5 from "@/data/nhl-top5.json";
import soccerTop5 from "@/data/soccer-top5.json";
import { teamBranding } from "./lib/teamBranding";
import { useRouter, useSearchParams } from "next/navigation";

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
  if (game.completed) return "Finalizado";

  const hasScores = Array.isArray(game.scores) && game.scores.length > 0;
  return hasScores ? "En vivo" : "";
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

function findLivePick(game: LiveScore, sport: SportTab): SignalGame | null {
  const signalSource =
    sport === "MLB"
      ? mlbSignalsData.games
      : sport === "NBA"
        ? nbaSignalsData.games
        : sport === "NHL"
          ? nhlSignalsData.games
          : sport === "SOCCER"
            ? soccerSignalsData.games
            : [];

  const liveAway = normalizeName(game.away_team);
  const liveHome = normalizeName(game.home_team);

  const normalizeSignal = (g: SignalGame) => ({
    signalAway: normalizeName(g.awayTeam ?? ""),
    signalHome: normalizeName(g.homeTeam ?? ""),
  });

  // 1. exacto normal
  const exactNormal =
    signalSource.find((g) => {
      const { signalAway, signalHome } = normalizeSignal(g);
      return liveAway === signalAway && liveHome === signalHome;
    }) || null;

  if (exactNormal) return exactNormal;

  // 2. exacto invertido
  const exactReversed =
    signalSource.find((g) => {
      const { signalAway, signalHome } = normalizeSignal(g);
      return liveAway === signalHome && liveHome === signalAway;
    }) || null;

  if (exactReversed) return exactReversed;

  // 3. flexible normal
  const flexibleNormal =
    signalSource.find((g) => {
      const { signalAway, signalHome } = normalizeSignal(g);

      const awayMatch =
        liveAway.includes(signalAway) || signalAway.includes(liveAway);

      const homeMatch =
        liveHome.includes(signalHome) || signalHome.includes(liveHome);

      return awayMatch && homeMatch;
    }) || null;

  if (flexibleNormal) return flexibleNormal;

  // 4. flexible invertido
  const flexibleReversed =
    signalSource.find((g) => {
      const { signalAway, signalHome } = normalizeSignal(g);

      const awayMatch =
        liveAway.includes(signalHome) || signalHome.includes(liveAway);

      const homeMatch =
        liveHome.includes(signalAway) || signalAway.includes(liveHome);

      return awayMatch && homeMatch;
    }) || null;

  return flexibleReversed;
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
  const pick = pickRaw.toLowerCase();
  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(game.away_team);
  const homeName = normalizeName(game.home_team);

  // MONEYLINE
  if (pick.includes("ml")) {
    const pickNorm = normalizeName(pickRaw);

    if (pickNorm.includes(awayName)) {
      return awayScore > homeScore ? "WON" : "LOST";
    }

    if (pickNorm.includes(homeName)) {
      return homeScore > awayScore ? "WON" : "LOST";
    }

    return "PENDING";
  }

  // TOTALS
  const totalMatch =
    pick.match(/over\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    pick.match(/under\s*([0-9]+(?:\.[0-9]+)?)/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);

    if (!Number.isFinite(line)) return "PENDING";

    if (pick.includes("over")) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (pick.includes("under")) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  // SPREADS
  const spreadMatch = pickRaw.match(/^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/);

  if (spreadMatch) {
    const teamPart = normalizeName(spreadMatch[1]);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    if (teamPart.includes(awayName) || awayName.includes(teamPart)) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (teamPart.includes(homeName) || homeName.includes(teamPart)) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
  }

  return "PENDING";
}

function findScoreGameForPick(
  pick: { awayTeam?: string; homeTeam?: string },
  scoreGames: LiveScore[]
) {
  const pickAway = normalizeName(pick.awayTeam ?? "");
  const pickHome = normalizeName(pick.homeTeam ?? "");

  // 1. match exacto normal o invertido
  const exactMatch =
    scoreGames.find((game) => {
      const gameAway = normalizeName(game.away_team);
      const gameHome = normalizeName(game.home_team);

      return (
        (pickAway === gameAway && pickHome === gameHome) ||
        (pickAway === gameHome && pickHome === gameAway)
      );
    }) || null;

  if (exactMatch) return exactMatch;

  // 2. match flexible normal o invertido
  const flexibleMatch =
    scoreGames.find((game) => {
      const gameAway = normalizeName(game.away_team);
      const gameHome = normalizeName(game.home_team);

      const normalAway =
        pickAway.includes(gameAway) || gameAway.includes(pickAway);
      const normalHome =
        pickHome.includes(gameHome) || gameHome.includes(pickHome);

      const reversedAway =
        pickAway.includes(gameHome) || gameHome.includes(pickAway);
      const reversedHome =
        pickHome.includes(gameAway) || gameAway.includes(pickHome);

      return (normalAway && normalHome) || (reversedAway && reversedHome);
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
  const pick = pickRaw.toLowerCase();
  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(game.away_team);
  const homeName = normalizeName(game.home_team);

  // MONEYLINE
  if (pick.includes("ml")) {
    const pickNorm = normalizeName(pickRaw);

    if (pickNorm.includes(awayName)) {
      return awayScore > homeScore ? "WON" : "LOST";
    }

    if (pickNorm.includes(homeName)) {
      return homeScore > awayScore ? "WON" : "LOST";
    }

    return "PENDING";
  }

  // TOTALS
  const totalMatch =
    pick.match(/over\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    pick.match(/under\s*([0-9]+(?:\.[0-9]+)?)/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);

    if (!Number.isFinite(line)) return "PENDING";

    if (pick.includes("over")) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (pick.includes("under")) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  // SPREADS
  const spreadMatch = pickRaw.match(
    /^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/
  );

  if (spreadMatch) {
    const teamPart = normalizeName(spreadMatch[1]);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    if (teamPart.includes(awayName) || awayName.includes(teamPart)) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (teamPart.includes(homeName) || homeName.includes(teamPart)) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
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

function getTop5BySport(sport: SportTab): Top5Entry[] {
  if (sport === "MLB") return mlbTop5Data.top5 ?? [];
  if (sport === "NBA") return nbaTop5Data.top5 ?? [];
  if (sport === "NHL") return nhlTop5Data.top5 ?? [];
  if (sport === "SOCCER") return soccerTop5Data.top5 ?? [];
  return [];
}

function getTopSignalBySport(sport: SportTab): Top5Entry | null {
  const top5 = getTop5BySport(sport);
  return top5.find((pick) => pick.isTopSignal) || top5[0] || null;
}

function getSubPicksForUser(userAccess: UserAccess, selectedSport: SportTab) {
  if (!hasSportAccess(userAccess, selectedSport)) return [];

  const top5 = getTop5BySport(selectedSport);

  if (userAccess.plan === "exclusive") {
    return top5.map((pick) => ({
      ...pick,
      label: "Top 5",
    }));
  }

  if (userAccess.plan === "premium") {
    return top5.map((pick) => ({
      ...pick,
      label: pick.isTopSignal
        ? `Top Signal #${pick.rank ?? 1}`
        : `Top 5 #${pick.rank ?? ""}`,
    }));
  }

  if (userAccess.plan === "elite" || userAccess.plan === "admin") {
    return top5.map((pick) => ({
      ...pick,
      label: pick.isTopSignal
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedSport, setSelectedSport] = useState<SportTab>("NHL");
  const [games, setGames] = useState<OddsGame[]>([]);
  const [loading, setLoading] = useState(true);

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
      return gameDayKey === todayKey;
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
  async function loadLiveGames() {
    if (viewMode !== "live") return;

    try {
      setLiveLoading(true);

      if (selectedSport === "TOP" || selectedSport === "NFL") {
  setLiveGames([]);
  setLiveLoading(false);
  return;
}

const sportForLive = selectedSport;

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

useEffect(() => {
  async function loadSubsScores() {
    if (viewMode !== "odds") return;

    try {
      setSubsScoresLoading(true);

      if (selectedSport === "TOP" || selectedSport === "NFL") {
        setSubsScoreGames([]);
        return;
      }

      const sportForScores = selectedSport;

      const res = await fetch(`/api/scores?sport=${sportForScores}`, {
        cache: "no-store",
      });

      const data = await res.json();
      setSubsScoreGames(Array.isArray(data) ? data : []);
    } catch (error) {
      setSubsScoreGames([]);
    } finally {
      setSubsScoresLoading(false);
    }
  }

  loadSubsScores();
}, [viewMode, selectedSport]);

const subsPicks = useMemo(() => {
  return getSubPicksForUser(userAccess, selectedSport);
}, [userAccess, selectedSport]);

const topSignalPicks = useMemo(() => {
  return subsPicks.filter((pick) => pick.isTopSignal);
}, [subsPicks]);

const top5RecordStats = useMemo(() => {
  return buildRecordStats(subsPicks, subsScoreGames);
}, [subsPicks, subsScoreGames]);

const topSignalRecordStats = useMemo(() => {
  return buildRecordStats(topSignalPicks, subsScoreGames);
}, [topSignalPicks, subsScoreGames]);

const eliteTopSignals = useMemo(() => {
  return topSignals;
}, [topSignals]);

const isTopTab = selectedSport === "TOP";



  return (
  <main className="min-h-screen bg-[#050816] text-white">
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#050816]/95 px-4 pb-3 pt-5 backdrop-blur">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-400/90">
              Atlas Signals
            </p>
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
                        const livePickData = findLivePick(game, group.sport);
                        const isTop5 = (() => {
                          const top5 = getTop5BySport(group.sport);
                          return top5.some((p) => {
                            const away = normalizeName(p.awayTeam ?? "");
                            const home = normalizeName(p.homeTeam ?? "");

                            const liveAway = normalizeName(game.away_team);
                            const liveHome = normalizeName(game.home_team);

                            return (
                              (away === liveAway && home === liveHome) ||
                              (away === liveHome && home === liveAway)
                            );
                          });
                        })();
                        const result = getLivePickResult(game, livePickData);

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
                                -203
                              </div>

                              <div className="min-w-[68px] rounded-full bg-black/60 px-2.5 py-1 text-center text-[11px]">
                                O/U 6
                              </div>

                              <div className="min-w-[68px] rounded-full bg-black/60 px-2.5 py-1 text-center text-[11px]">
                                +164
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
                      <div className="mb-3 inline-flex rounded-full bg-cyan-300/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                        Signal Detected
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
                  {topSignalRecordStats.wins}-{topSignalRecordStats.losses}
                </p>
                <p className="mt-1 text-[11px] text-white/55">
                  Push: {topSignalRecordStats.pushes}
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
                  {topSignalRecordStats.winRate}%
                </p>
                <p className="mt-1 text-[11px] text-white/55">
                  Global
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
              const showPending = finalResult === "PENDING";

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
                    <div className="mb-3 inline-flex rounded-full bg-cyan-300/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-cyan-300">
                        {finalResult === "WON"
                          ? "Signal Won"
                          : finalResult === "LOST"
                          ? "Signal Lost"
                          : finalResult === "PUSH"
                          ? "Signal Push"
                          : "Signal Detected"}
                      </p>
                    </div>

                    <p className="text-[20px] font-semibold leading-tight tracking-tight text-white">
                      {formatDisplayedPick(pick.pick, selectedSport)}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {showPending ? (
                        <div
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${getStatusStyles(
                            pick.status
                          )}`}
                        >
                          {String(pick.status ?? "PENDING")}
                        </div>
                      ) : finalResult === "WON" ? (
                        <div className="inline-flex items-center rounded-full border border-green-400/20 bg-green-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-green-300">
                          Won
                        </div>
                      ) : finalResult === "LOST" ? (
                        <div className="inline-flex items-center rounded-full border border-red-400/20 bg-red-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-300">
                          Lost
                        </div>
                      ) : finalResult === "PUSH" ? (
                        <div className="inline-flex items-center rounded-full border border-yellow-400/20 bg-yellow-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-yellow-300">
                          Push
                        </div>
                      ) : null}
                    </div>

                    <p className="mt-2 text-[11px] text-white/40">
                      {pick.status === "CONFIRMED" && "Validated by system"}
                      {pick.status === "REMOVED" && "Signal removed due to market shift"}
                      {pick.status === "DOWNGRADED" &&
                        "Confidence reduced before game time"}
                      {!pick.status && "Monitoring market conditions"}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
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
                </article>
              );
            })}
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