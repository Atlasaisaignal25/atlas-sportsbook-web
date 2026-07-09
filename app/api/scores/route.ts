import { NextResponse } from "next/server";
import {
  getSportsDataIoScores,
  isSportsDataIoSport,
} from "@/app/lib/sportsdataio";

const sportGroups = {
  NBA: ["basketball_nba"],
  NHL: ["icehockey_nhl"],
  MLB: ["baseball_mlb"],
  SOCCER: [
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
  "soccer_france_ligue_one",
  "soccer_portugal_primeira_liga",
  "soccer_netherlands_eredivisie",
  "soccer_england_championship",
  "soccer_fifa_world_cup",
  "soccer_usa_mls",
  "soccer_mexico_ligamx",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  "soccer_uefa_europa_conference_league",
],
} as const;

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

function getGameDayKey(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function isDateKey(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

async function fetchOddsApiScores(sport: string, date?: string | null) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];

  const selectedSports =
    sport in sportGroups
      ? sportGroups[sport as keyof typeof sportGroups]
      : sportGroups.NBA;

  const responses = await Promise.all(
    selectedSports.map(async (sportKey) => {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores?daysFrom=1&apiKey=${apiKey}`;

      const res = await fetch(url, {
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        console.log(`Scores API failed for ${sportKey}: ${text}`);
        return [];
      }

      const data = await res.json();
      const games = Array.isArray(data)
        ? data.map((game) => ({
            ...game,
            sport_key: sportKey,
          }))
        : [];

      return date && isDateKey(date)
        ? games.filter((game) => getGameDayKey(game.commence_time) === date)
        : games;
    })
  );

  return responses.flat();
}

function normalizeMlbStatsApiStatus(value: unknown) {
  const status = String(value ?? "").trim();
  return status || "Scheduled";
}

async function fetchMlbStatsApiSchedule(date?: string | null) {
  if (!date || !isDateKey(date)) return [];

  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(
    date
  )}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) return [];

  const data = await res.json();
  const games = Array.isArray(data?.dates?.[0]?.games)
    ? data.dates[0].games
    : [];

  return games.map((game: any) => {
    const awayTeam = String(game?.teams?.away?.team?.name ?? "Away Team");
    const homeTeam = String(game?.teams?.home?.team?.name ?? "Home Team");
    const awayScore = game?.teams?.away?.score;
    const homeScore = game?.teams?.home?.score;
    const rawStatus = normalizeMlbStatsApiStatus(game?.status?.detailedState);
    const completed = /final|completed/i.test(rawStatus);
    const scores =
      awayScore === undefined || homeScore === undefined
        ? []
        : [
            { name: awayTeam, score: String(awayScore) },
            { name: homeTeam, score: String(homeScore) },
          ];

    return {
      id: String(game?.gamePk ?? `${awayTeam}-${homeTeam}-${game?.gameDate ?? date}`),
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: String(game?.gameDate ?? `${date}T12:00:00Z`),
      away_team: awayTeam,
      home_team: homeTeam,
      completed,
      scores,
      provider: "mlb_statsapi",
      rawStatus,
    };
  });
}

function findMatchingOddsScore(game: any, oddsScores: any[]) {
  const away = normalizeName(game.away_team);
  const home = normalizeName(game.home_team);

  return (
    oddsScores.find((oddsGame) => {
      const oddsAway = normalizeName(oddsGame.away_team);
      const oddsHome = normalizeName(oddsGame.home_team);

      return (
        (away === oddsAway && home === oddsHome) ||
        (away === oddsHome && home === oddsAway)
      );
    }) ?? null
  );
}

function hasUsableScores(game: any) {
  return Array.isArray(game?.scores) && game.scores.length > 0;
}

function mergeAuthoritativeScores(games: any[], oddsScores: any[]) {
  if (oddsScores.length === 0) return games;

  const mergedGames = games.map((game) => {
    const oddsGame = findMatchingOddsScore(game, oddsScores);

    if (!oddsGame || !hasUsableScores(oddsGame)) {
      return game;
    }

    return {
      ...game,
      completed: Boolean(oddsGame.completed ?? game.completed),
      scores: oddsGame.scores,
      rawStatus: oddsGame.completed ? "Final" : game.rawStatus,
    };
  });

  const sportsDataOnlyKeys = new Set(
    mergedGames.map((game) => {
      const away = normalizeName(game.away_team);
      const home = normalizeName(game.home_team);
      return [away, home].sort().join("|");
    })
  );

  const oddsOnlyGames = oddsScores.filter((oddsGame) => {
    const away = normalizeName(oddsGame.away_team);
    const home = normalizeName(oddsGame.home_team);
    return !sportsDataOnlyKeys.has([away, home].sort().join("|"));
  });

  return [...mergedGames, ...oddsOnlyGames];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = (searchParams.get("sport") || "NBA").toUpperCase();
    const date = searchParams.get("date");
    const scoresDate = isDateKey(date) ? date : null;
    const oddsScoresPromise = fetchOddsApiScores(sport, scoresDate).catch(() => []);

    if (process.env.SPORTSDATAIO_API_KEY && isSportsDataIoSport(sport)) {
      try {
        const sportsDataIoGames = await getSportsDataIoScores(sport, scoresDate);

        if (sportsDataIoGames.length > 0) {
          const oddsScores = await oddsScoresPromise;
          return NextResponse.json(
            mergeAuthoritativeScores(sportsDataIoGames, oddsScores)
          );
        }
      } catch (error) {
        console.log(
          `SportsDataIO scores fallback for ${sport}:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    if (sport === "MLB" && scoresDate) {
      const mlbSchedule = await fetchMlbStatsApiSchedule(scoresDate).catch(() => []);

      if (mlbSchedule.length > 0) {
        return NextResponse.json(mlbSchedule);
      }
    }

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing ODDS_API_KEY in environment variables" },
        { status: 500 }
      );
    }

    return NextResponse.json(await oddsScoresPromise);
  } catch (error) {
    console.error("Scores route error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch live scores",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
