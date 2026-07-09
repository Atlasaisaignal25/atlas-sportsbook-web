export type SportsDataIoSport = "MLB" | "NBA" | "NHL" | "NFL" | "SOCCER";

type SportsDataIoGame = Record<string, any>;

type NormalizedSportsDataIoGame = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores: Array<{
    name: string;
    score: string;
  }>;
  provider: "sportsdataio";
  rawStatus?: string;
  period?: string | number | null;
  inningHalf?: string | null;
  statusDetail?: string | null;
  timeRemaining?: string | null;
};

const sportConfig: Record<
  SportsDataIoSport,
  {
    basePath: string;
    sportKey: string;
    title: string;
  }
> = {
  MLB: {
    basePath: "v3/mlb/scores/json",
    sportKey: "baseball_mlb",
    title: "MLB",
  },
  NBA: {
    basePath: "v3/nba/scores/json",
    sportKey: "basketball_nba",
    title: "NBA",
  },
  NHL: {
    basePath: "v3/nhl/scores/json",
    sportKey: "icehockey_nhl",
    title: "NHL",
  },
  NFL: {
    basePath: "v3/nfl/scores/json",
    sportKey: "americanfootball_nfl",
    title: "NFL",
  },
  SOCCER: {
    basePath: "v4/soccer/scores/json",
    sportKey: "sportsdataio_soccer",
    title: "SOCCER",
  },
};

const apiBaseUrl = "https://api.sportsdata.io";

const teamNameBySport: Partial<Record<SportsDataIoSport, Record<string, string>>> = {
  MLB: {
    ARI: "Arizona Diamondbacks",
    ATL: "Atlanta Braves",
    BAL: "Baltimore Orioles",
    BOS: "Boston Red Sox",
    CHC: "Chicago Cubs",
    CHW: "Chicago White Sox",
    CIN: "Cincinnati Reds",
    CLE: "Cleveland Guardians",
    COL: "Colorado Rockies",
    DET: "Detroit Tigers",
    HOU: "Houston Astros",
    KC: "Kansas City Royals",
    LAA: "Los Angeles Angels",
    LAD: "Los Angeles Dodgers",
    MIA: "Miami Marlins",
    MIL: "Milwaukee Brewers",
    MIN: "Minnesota Twins",
    NYM: "New York Mets",
    NYY: "New York Yankees",
    OAK: "Athletics",
    ATH: "Athletics",
    PHI: "Philadelphia Phillies",
    PIT: "Pittsburgh Pirates",
    SD: "San Diego Padres",
    SEA: "Seattle Mariners",
    SF: "San Francisco Giants",
    STL: "St. Louis Cardinals",
    TB: "Tampa Bay Rays",
    TEX: "Texas Rangers",
    TOR: "Toronto Blue Jays",
    WSH: "Washington Nationals",
  },
};

function getSportsDataIoKey() {
  return process.env.SPORTSDATAIO_API_KEY?.trim() || null;
}

export function isSportsDataIoSport(value: string): value is SportsDataIoSport {
  return value === "MLB" || value === "NBA" || value === "NHL" || value === "NFL" || value === "SOCCER";
}

export function getSportsDataIoDate(value?: string | null) {
  const dateKeyMatch = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateKeyMatch
    ? new Date(
        Date.UTC(
          Number(dateKeyMatch[1]),
          Number(dateKeyMatch[2]) - 1,
          Number(dateKeyMatch[3]),
          12
        )
      )
    : value
    ? new Date(value)
    : new Date();

  if (Number.isNaN(date.getTime())) {
    return getSportsDataIoDate();
  }

  const month = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "America/New_York",
  }).toUpperCase();
  const day = String(
    Number(
      date.toLocaleString("en-US", {
        day: "numeric",
        timeZone: "America/New_York",
      })
    )
  ).padStart(2, "0");
  const year = date.toLocaleString("en-US", {
    year: "numeric",
    timeZone: "America/New_York",
  });

  return `${year}-${month}-${day}`;
}

async function fetchSportsDataIo(path: string, init?: RequestInit) {
  const key = getSportsDataIoKey();

  if (!key) {
    throw new Error("Missing SPORTSDATAIO_API_KEY");
  }

  const separator = path.includes("?") ? "&" : "?";
  const url = `${apiBaseUrl}/${path}${separator}key=${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`SportsDataIO request failed: ${response.status} ${details}`);
  }

  return response.json();
}

function normalizeTeamLabel(
  sport: SportsDataIoSport,
  teamName: string | number | null | undefined
) {
  const value = String(teamName ?? "").trim();
  return teamNameBySport[sport]?.[value] ?? value;
}

function getTeamLabel(
  sport: SportsDataIoSport,
  game: SportsDataIoGame,
  side: "Away" | "Home"
) {
  const teamName =
    game[`${side}TeamName`] ??
    game[`${side}Team`] ??
    game[`${side}TeamKey`] ??
    game[`${side}TeamID`] ??
    `${side} Team`;

  return normalizeTeamLabel(sport, teamName);
}

function getScore(game: SportsDataIoGame, side: "Away" | "Home") {
  const value =
    game[`${side}TeamScore`] ??
    game[`${side}Score`] ??
    game[`${side}TeamRuns`] ??
    game[`${side}Runs`] ??
    game[`${side}Goals`] ??
    game[`${side}Points`];

  return value === null || value === undefined ? "" : String(value);
}

function getNewYorkOffsetMinutes(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });
  const timeZoneName =
    formatter
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = timeZoneName.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);

  if (!match) return -300;

  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + Math.sign(hours) * minutes;
}

function parseSportsDataIoDateTime(value: unknown, source: "utc" | "new-york") {
  if (!value) return null;

  const text = String(value);
  if (!text || text.startsWith("0001-01-01")) return null;

  if (source === "utc") {
    return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`).toISOString();
  }

  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );

  if (!match) return new Date(text).toISOString();

  const [, year, month, day, hour, minute, second = "0"] = match;
  const utcGuess = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );
  const offsetMinutes = getNewYorkOffsetMinutes(utcGuess);

  return new Date(utcGuess.getTime() - offsetMinutes * 60000).toISOString();
}

function getStartTime(game: SportsDataIoGame) {
  return (
    parseSportsDataIoDateTime(game.DateTimeUTC, "utc") ??
    parseSportsDataIoDateTime(game.DateTime, "new-york") ??
    parseSportsDataIoDateTime(game.Date, "new-york") ??
    String(game.Day ?? new Date().toISOString())
  );
}

function isCompleted(game: SportsDataIoGame) {
  const status = String(game.Status ?? game.StatusDescription ?? "").toLowerCase();
  return Boolean(game.IsClosed) || status === "final" || status === "f/final" || status.includes("final");
}

function isSportsDataIoLiveStatus(status: unknown) {
  const normalized = String(status ?? "").toLowerCase();
  return (
    normalized === "inprogress" ||
    normalized === "in_progress" ||
    normalized === "live" ||
    normalized.includes("in progress")
  );
}

function isHiddenGame(game: SportsDataIoGame) {
  const status = String(game.Status ?? game.StatusDescription ?? "").toLowerCase();
  return status === "canceled" || status === "cancelled" || status === "postponed";
}

function normalizeSportsDataIoGame(
  sport: SportsDataIoSport,
  game: SportsDataIoGame
): NormalizedSportsDataIoGame {
  const config = sportConfig[sport];
  const awayTeam = String(getTeamLabel(sport, game, "Away"));
  const homeTeam = String(getTeamLabel(sport, game, "Home"));
  const gameId = game.GameID ?? game.GlobalGameID ?? game.GameId ?? game.Id ?? `${awayTeam}-${homeTeam}-${getStartTime(game)}`;
  const completed = isCompleted(game);
  const live = isSportsDataIoLiveStatus(game.Status ?? game.StatusDescription);
  const scores = [
    {
      name: awayTeam,
      score: getScore(game, "Away"),
    },
    {
      name: homeTeam,
      score: getScore(game, "Home"),
    },
  ].filter((score) => score.score !== "");

  return {
    id: String(gameId),
    sport_key: config.sportKey,
    sport_title: config.title,
    commence_time: String(getStartTime(game)),
    away_team: awayTeam,
    home_team: homeTeam,
    completed,
    scores: sport === "MLB" && !completed && !live ? [] : scores,
    provider: "sportsdataio",
    rawStatus: game.Status ?? game.StatusDescription,
    period: game.Period ?? game.Quarter ?? game.Inning ?? null,
    inningHalf: game.InningHalf ?? null,
    statusDetail: game.InningDescription ?? game.StatusDescription ?? null,
    timeRemaining: game.TimeRemaining ?? game.Clock ?? null,
  };
}

export async function getSportsDataIoScores(
  sport: SportsDataIoSport,
  date?: string | null
) {
  const config = sportConfig[sport];
  const sportsDataDate = getSportsDataIoDate(date);
  const data = await fetchSportsDataIo(`${config.basePath}/GamesByDate/${sportsDataDate}`);

  if (!Array.isArray(data)) {
    return [];
  }

  const normalizedGames = data
    .filter((game) => !isHiddenGame(game))
    .map((game) => normalizeSportsDataIoGame(sport, game));

  if (sport !== "MLB") {
    return normalizedGames;
  }

  return Promise.all(
    normalizedGames.map(async (game) => {
      if (
        !game.completed &&
        !isSportsDataIoLiveStatus(game.rawStatus)
      ) {
        return game;
      }

      const boxScore = await fetchSportsDataIo(
        `v3/mlb/stats/json/BoxScore/${encodeURIComponent(game.id)}`
      ).catch(() => null);
      const boxGame = boxScore?.Game;

      if (!boxGame) return game;

      return {
        ...game,
        completed: isCompleted(boxGame),
        scores: [
          {
            name: game.away_team,
            score: getScore(boxGame, "Away"),
          },
          {
            name: game.home_team,
            score: getScore(boxGame, "Home"),
          },
        ].filter((score) => score.score !== ""),
        rawStatus: boxGame.Status ?? game.rawStatus,
        period: boxGame.Inning ?? game.period,
        inningHalf: boxGame.InningHalf ?? game.inningHalf,
        statusDetail: boxGame.InningDescription ?? game.statusDetail,
      };
    })
  );
}

export async function getSportsDataIoGameDetail(
  sport: SportsDataIoSport,
  gameId: string
) {
  const config = sportConfig[sport];
  const boxScorePath =
    sport === "MLB"
      ? `v3/mlb/stats/json/BoxScore/${encodeURIComponent(gameId)}`
      : `${config.basePath}/BoxScore/${encodeURIComponent(gameId)}`;
  const [boxScore, playByPlay, standings] = await Promise.all([
    fetchSportsDataIo(boxScorePath).catch(() => null),
    fetchSportsDataIo(`${config.basePath}/PlayByPlay/${encodeURIComponent(gameId)}`).catch(
      () => null
    ),
    sport === "MLB"
      ? fetchSportsDataIo("v3/mlb/scores/json/Standings/2026").catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    provider: "sportsdataio" as const,
    sport,
    gameId,
    boxScore,
    playByPlay,
    standings,
  };
}
