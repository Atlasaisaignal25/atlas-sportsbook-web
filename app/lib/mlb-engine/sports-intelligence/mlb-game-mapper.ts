import type { MlbGameContext } from "./types";

export type MlbGameMappingMatchMethod =
  | "TEAM_AND_TIME_EXACT"
  | "TEAM_AND_TIME_TOLERANCE"
  | "TEAM_ONLY"
  | "UNMATCHED";

export type MlbGameMappingResult = {
  oddsEventId: string;
  officialGameId?: string;
  homeTeam: string;
  awayTeam: string;
  officialHomeTeamId?: string;
  officialAwayTeamId?: string;
  commenceTime: string;
  matched: boolean;
  confidence: number;
  matchMethod?: MlbGameMappingMatchMethod;
  warnings: string[];
};

export type MlbOfficialScheduleTeam = {
  id?: number;
  name?: string;
};

export type MlbOfficialSchedulePitcher = {
  id?: number;
  fullName?: string;
};

export type MlbOfficialScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  gameNumber?: number;
  doubleHeader?: string;
  status?: {
    detailedState?: string;
    abstractGameState?: string;
    statusCode?: string;
    startTimeTBD?: boolean;
  };
  teams?: {
    home?: {
      team?: MlbOfficialScheduleTeam;
      probablePitcher?: MlbOfficialSchedulePitcher;
    };
    away?: {
      team?: MlbOfficialScheduleTeam;
      probablePitcher?: MlbOfficialSchedulePitcher;
    };
  };
};

export type MlbResolvedGame = {
  mapping: MlbGameMappingResult;
  game?: MlbOfficialScheduleGame;
};

const TEAM_ALIASES: Record<string, string> = {
  "arizona diamondbacks": "arizona diamondbacks",
  "atlanta braves": "atlanta braves",
  "baltimore orioles": "baltimore orioles",
  "boston red sox": "boston red sox",
  "chicago cubs": "chicago cubs",
  "chicago white sox": "chicago white sox",
  "cincinnati reds": "cincinnati reds",
  "cleveland guardians": "cleveland guardians",
  "colorado rockies": "colorado rockies",
  "detroit tigers": "detroit tigers",
  "houston astros": "houston astros",
  "kansas city royals": "kansas city royals",
  "los angeles angels": "los angeles angels",
  "la angels": "los angeles angels",
  "los angeles dodgers": "los angeles dodgers",
  "la dodgers": "los angeles dodgers",
  "miami marlins": "miami marlins",
  "milwaukee brewers": "milwaukee brewers",
  "minnesota twins": "minnesota twins",
  "new york mets": "new york mets",
  "ny mets": "new york mets",
  "new york yankees": "new york yankees",
  "ny yankees": "new york yankees",
  "athletics": "athletics",
  "oakland athletics": "athletics",
  "a's": "athletics",
  "philadelphia phillies": "philadelphia phillies",
  "pittsburgh pirates": "pittsburgh pirates",
  "san diego padres": "san diego padres",
  "seattle mariners": "seattle mariners",
  "san francisco giants": "san francisco giants",
  "st louis cardinals": "st louis cardinals",
  "st. louis cardinals": "st louis cardinals",
  "tampa bay rays": "tampa bay rays",
  "texas rangers": "texas rangers",
  "toronto blue jays": "toronto blue jays",
  "washington nationals": "washington nationals",
};

export function normalizeMlbTeamName(value: string) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’]/g, "'")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  return TEAM_ALIASES[normalized] ?? normalized;
}

function minutesBetween(first: string, second: string) {
  const firstMs = new Date(first).getTime();
  const secondMs = new Date(second).getTime();
  if (!Number.isFinite(firstMs) || !Number.isFinite(secondMs)) return Number.POSITIVE_INFINITY;
  return Math.abs(firstMs - secondMs) / 60000;
}

function sameTeams(context: MlbGameContext, game: MlbOfficialScheduleGame) {
  const contextHome = normalizeMlbTeamName(context.homeTeam);
  const contextAway = normalizeMlbTeamName(context.awayTeam);
  const officialHome = normalizeMlbTeamName(game.teams?.home?.team?.name ?? "");
  const officialAway = normalizeMlbTeamName(game.teams?.away?.team?.name ?? "");

  return Boolean(contextHome && contextAway && contextHome === officialHome && contextAway === officialAway);
}

function mappingFor(params: {
  context: MlbGameContext;
  game?: MlbOfficialScheduleGame;
  matched: boolean;
  confidence: number;
  matchMethod: MlbGameMappingMatchMethod;
  warnings?: string[];
}): MlbGameMappingResult {
  return {
    oddsEventId: params.context.eventId,
    officialGameId: params.game?.gamePk ? String(params.game.gamePk) : undefined,
    homeTeam: params.context.homeTeam,
    awayTeam: params.context.awayTeam,
    officialHomeTeamId: params.game?.teams?.home?.team?.id ? String(params.game.teams.home.team.id) : undefined,
    officialAwayTeamId: params.game?.teams?.away?.team?.id ? String(params.game.teams.away.team.id) : undefined,
    commenceTime: params.context.commenceTime,
    matched: params.matched,
    confidence: params.confidence,
    matchMethod: params.matchMethod,
    warnings: params.warnings ?? [],
  };
}

export function mapOddsEventToOfficialMlbGame(input: {
  context: MlbGameContext;
  officialGames: MlbOfficialScheduleGame[];
  toleranceMinutes?: number;
}): MlbResolvedGame {
  const toleranceMinutes = input.toleranceMinutes ?? 120;
  const context = input.context;

  if (!context.homeTeam || !context.awayTeam) {
    return {
      mapping: mappingFor({
        context,
        matched: false,
        confidence: 0,
        matchMethod: "UNMATCHED",
        warnings: ["Both teams are required for MLB official game mapping."],
      }),
    };
  }

  const teamMatches = input.officialGames
    .filter((game) => game.gamePk && game.gameDate && sameTeams(context, game))
    .map((game) => ({
      game,
      diffMinutes: minutesBetween(context.commenceTime, game.gameDate ?? ""),
    }))
    .sort((a, b) => a.diffMinutes - b.diffMinutes);

  if (teamMatches.length === 0) {
    return {
      mapping: mappingFor({
        context,
        matched: false,
        confidence: 0,
        matchMethod: "UNMATCHED",
        warnings: ["No official MLB game matched both home and away teams."],
      }),
    };
  }

  const inTolerance = teamMatches.filter((match) => match.diffMinutes <= toleranceMinutes);
  if (inTolerance.length > 1) {
    const closestDiff = inTolerance[0]?.diffMinutes;
    const closest = inTolerance.filter((match) => match.diffMinutes === closestDiff);

    if (closest.length > 1) {
      return {
        mapping: mappingFor({
          context,
          matched: false,
          confidence: 0,
          matchMethod: "UNMATCHED",
          warnings: ["Official MLB mapping is ambiguous; possible doubleheader or duplicate schedule match."],
        }),
      };
    }
  }

  const best = inTolerance[0];
  if (best) {
    const exact = best.diffMinutes <= 5;
    return {
      mapping: mappingFor({
        context,
        game: best.game,
        matched: true,
        confidence: exact ? 0.98 : Math.max(0.7, 0.95 - best.diffMinutes / toleranceMinutes / 4),
        matchMethod: exact ? "TEAM_AND_TIME_EXACT" : "TEAM_AND_TIME_TOLERANCE",
        warnings: best.game.doubleHeader && best.game.doubleHeader !== "N"
          ? [`Doubleheader game number ${best.game.gameNumber ?? "unknown"} matched by scheduled time.`]
          : [],
      }),
      game: best.game,
    };
  }

  if (teamMatches.length === 1) {
    return {
      mapping: mappingFor({
        context,
        game: teamMatches[0].game,
        matched: true,
        confidence: 0.55,
        matchMethod: "TEAM_ONLY",
        warnings: [
          "Matched by both teams only because scheduled time was outside tolerance; verify postponed or rescheduled game.",
        ],
      }),
      game: teamMatches[0].game,
    };
  }

  return {
    mapping: mappingFor({
      context,
      matched: false,
      confidence: 0,
      matchMethod: "UNMATCHED",
      warnings: ["Multiple same-team official games exist outside tolerance; refusing to guess official game ID."],
    }),
  };
}

