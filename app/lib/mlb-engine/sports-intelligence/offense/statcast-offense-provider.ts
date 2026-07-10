import {
  buildOffensiveFormFeatures,
  buildUnavailableOffensiveFormFeatures,
  type VerifiedOffensiveRollingStats,
} from "./offensive-form-engine";
import { buildStatcastLeagueBaseline } from "./statcast-baseline";
import { cachedStatcastClient, type StatcastClient, type StatcastSearchRow } from "./statcast-client";
import { getMlbTeamIdentityByName, type MlbTeamIdentity } from "../mlb-team-mapping";
import type {
  MlbGameContext,
  OffensiveFormFeatures,
  OffensiveRollingWindow,
  OffensiveSampleQuality,
} from "../types";
import type { MlbOfficialScheduleGame } from "../mlb-game-mapper";
import type { MlbOfficialClient } from "../providers/mlb-official-client";

export type StatcastOffenseProviderHealth = {
  provider: "BASEBALL_SAVANT_STATCAST_CSV";
  reachable: boolean;
  rawDataAvailable: boolean;
  scoreAvailable: boolean;
  baselineAvailable: boolean;
  cacheStatus: "HIT" | "MISS" | "DISABLED" | "ERROR";
  lastSuccessfulRefresh?: string;
  teamsAvailable: string[];
  teamsUnavailable: string[];
  warnings: string[];
  errors: string[];
};

type CompletedGame = {
  gamePk: string;
  gameDate: string;
  homeTeamId?: string;
  awayTeamId?: string;
};

const WINDOW_TO_GAMES: Record<OffensiveRollingWindow, 7 | 14 | 30> = {
  last7: 7,
  last14: 14,
  last30: 30,
};

const SAMPLE_THRESHOLDS: Record<7 | 14 | 30, { sufficientPa: number; sufficientBbe: number; minimumGames: number }> = {
  7: { sufficientPa: 150, sufficientBbe: 80, minimumGames: 4 },
  14: { sufficientPa: 300, sufficientBbe: 160, minimumGames: 8 },
  30: { sufficientPa: 640, sufficientBbe: 340, minimumGames: 16 },
};

const HIT_EVENTS = new Set(["single", "double", "triple", "home_run"]);
const WALK_EVENTS = new Set(["walk", "intent_walk"]);
const STRIKEOUT_EVENTS = new Set(["strikeout", "strikeout_double_play"]);
const BATTED_BALL_EVENTS = new Set([
  ...HIT_EVENTS,
  "field_out",
  "force_out",
  "grounded_into_double_play",
  "double_play",
  "field_error",
  "fielders_choice",
  "fielders_choice_out",
  "sac_fly",
  "sac_bunt",
  "sac_fly_double_play",
]);
const PA_EVENTS = new Set([
  ...HIT_EVENTS,
  ...WALK_EVENTS,
  ...STRIKEOUT_EVENTS,
  "field_out",
  "force_out",
  "grounded_into_double_play",
  "double_play",
  "field_error",
  "fielders_choice",
  "fielders_choice_out",
  "hit_by_pitch",
  "sac_fly",
  "sac_bunt",
  "sac_fly_double_play",
  "catcher_interf",
]);

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? round(numerator / denominator) : undefined;
}

function isCompletedRegularSeasonGame(game: MlbOfficialScheduleGame, asOf: Date) {
  const date = game.gameDate ? new Date(game.gameDate) : undefined;
  if (!game.gamePk || !date || date > asOf) return false;
  const state = `${game.status?.abstractGameState ?? ""} ${game.status?.detailedState ?? ""}`.toLowerCase();
  if (state.includes("postponed") || state.includes("cancelled") || state.includes("canceled")) return false;
  if (state.includes("suspended") || state.includes("delay")) return false;
  return game.status?.abstractGameState === "Final" || state.includes("final");
}

export function selectCompletedGamesForTeam(input: {
  officialGames: MlbOfficialScheduleGame[];
  teamId: string;
  asOf: string;
  requestedGames: 7 | 14 | 30;
}): CompletedGame[] {
  const asOfDate = new Date(input.asOf);
  return input.officialGames
    .filter((game) => {
      const homeId = game.teams?.home?.team?.id ? String(game.teams.home.team.id) : undefined;
      const awayId = game.teams?.away?.team?.id ? String(game.teams.away.team.id) : undefined;
      return (homeId === input.teamId || awayId === input.teamId) && isCompletedRegularSeasonGame(game, asOfDate);
    })
    .map((game) => ({
      gamePk: String(game.gamePk),
      gameDate: game.gameDate ?? "",
      homeTeamId: game.teams?.home?.team?.id ? String(game.teams.home.team.id) : undefined,
      awayTeamId: game.teams?.away?.team?.id ? String(game.teams.away.team.id) : undefined,
    }))
    .sort((a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime())
    .slice(0, input.requestedGames);
}

export function classifyOffensiveSampleQuality(input: {
  gamesRequested: 7 | 14 | 30;
  gamesIncluded: number;
  plateAppearances: number;
  battedBallEvents: number;
  sourceAvailable: boolean;
}): OffensiveSampleQuality {
  if (!input.sourceAvailable || input.gamesIncluded === 0) return "UNAVAILABLE";
  const thresholds = SAMPLE_THRESHOLDS[input.gamesRequested];
  if (input.gamesIncluded < thresholds.minimumGames) return "INSUFFICIENT";
  if (input.gamesIncluded >= input.gamesRequested &&
      input.plateAppearances >= thresholds.sufficientPa &&
      input.battedBallEvents >= thresholds.sufficientBbe) {
    return "SUFFICIENT";
  }
  return "LIMITED";
}

export function aggregateStatcastRowsForTeam(input: {
  team: MlbTeamIdentity;
  rows: StatcastSearchRow[];
  games: CompletedGame[];
  window: OffensiveRollingWindow;
}): NonNullable<VerifiedOffensiveRollingStats["windows"][OffensiveRollingWindow]> {
  const gameIds = new Set(input.games.map((game) => game.gamePk));
  const rows = input.rows.filter((row) => row.gamePk && gameIds.has(row.gamePk) && row.battingTeamId === input.team.officialTeamId);
  let plateAppearances = 0;
  let battedBallEvents = 0;
  let hits = 0;
  let walks = 0;
  let strikeouts = 0;
  let hardHitBalls = 0;
  let barrels = 0;
  const exitVelocities: number[] = [];
  const xbaValues: number[] = [];
  const xslgValues: number[] = [];
  const xwobaValues: number[] = [];

  rows.forEach((row) => {
    const event = row.events ?? "";
    if (PA_EVENTS.has(event) || row.wobaDenom === 1) plateAppearances += 1;
    if (HIT_EVENTS.has(event)) hits += 1;
    if (WALK_EVENTS.has(event)) walks += 1;
    if (STRIKEOUT_EVENTS.has(event)) strikeouts += 1;
    if (isNumber(row.launchSpeed) && BATTED_BALL_EVENTS.has(event)) {
      battedBallEvents += 1;
      exitVelocities.push(row.launchSpeed);
      if (row.launchSpeed >= 95) hardHitBalls += 1;
    }
    if (row.launchSpeedAngle === 6) barrels += 1;
    if (isNumber(row.estimatedBaUsingSpeedangle)) xbaValues.push(row.estimatedBaUsingSpeedangle);
    if (isNumber(row.estimatedSlgUsingSpeedangle)) xslgValues.push(row.estimatedSlgUsingSpeedangle);
    if (isNumber(row.estimatedWobaUsingSpeedangle)) xwobaValues.push(row.estimatedWobaUsingSpeedangle);
  });

  const gamesRequested = WINDOW_TO_GAMES[input.window];
  const gamesIncluded = input.games.length;
  const warnings: string[] = [];
  if (rows.length === 0) warnings.push("No usable Statcast rows matched this team/window.");
  if (gamesIncluded < gamesRequested) warnings.push(`Only ${gamesIncluded} completed games available for last ${gamesRequested}.`);

  const avgExitVelocity = average(exitVelocities);
  const xBA = average(xbaValues);
  const xSLG = average(xslgValues);
  const xwOBA = average(xwobaValues);

  return {
    games: gamesIncluded,
    gamesRequested,
    gamesIncluded,
    startDate: input.games.at(-1)?.gameDate?.slice(0, 10),
    endDate: input.games[0]?.gameDate?.slice(0, 10),
    plateAppearances,
    battedBallEvents,
    hits,
    walks,
    strikeouts,
    hardHitBalls,
    barrels,
    hardHitRate: rate(hardHitBalls, battedBallEvents),
    barrelRate: rate(barrels, battedBallEvents),
    exitVelocity: isNumber(avgExitVelocity) ? round(avgExitVelocity, 1) : undefined,
    averageExitVelocity: isNumber(avgExitVelocity) ? round(avgExitVelocity, 1) : undefined,
    walkRate: rate(walks, plateAppearances),
    strikeoutRate: rate(strikeouts, plateAppearances),
    expectedBattingAverage: isNumber(xBA) ? round(xBA, 3) : undefined,
    expectedSlugging: isNumber(xSLG) ? round(xSLG, 3) : undefined,
    expectedWeightedOnBaseAverage: isNumber(xwOBA) ? round(xwOBA, 3) : undefined,
    xBA: isNumber(xBA) ? round(xBA, 3) : undefined,
    xSLG: isNumber(xSLG) ? round(xSLG, 3) : undefined,
    xwOBA: isNumber(xwOBA) ? round(xwOBA, 3) : undefined,
    sampleQuality: classifyOffensiveSampleQuality({
      gamesRequested,
      gamesIncluded,
      plateAppearances,
      battedBallEvents,
      sourceAvailable: rows.length > 0,
    }),
    warnings,
  };
}

export class StatcastOffenseProvider {
  private health: StatcastOffenseProviderHealth = {
    provider: "BASEBALL_SAVANT_STATCAST_CSV",
    reachable: false,
    rawDataAvailable: false,
    scoreAvailable: false,
    baselineAvailable: false,
    cacheStatus: "DISABLED",
    teamsAvailable: [],
    teamsUnavailable: [],
    warnings: [],
    errors: [],
  };

  constructor(
    private readonly options: {
      enabled: boolean;
      scoreEnabled: boolean;
      officialClient: Pick<MlbOfficialClient, "getSchedule">;
      statcastClient?: StatcastClient;
    },
  ) {}

  getHealth() {
    return this.health;
  }

  async getOffensiveFormFeatures(context: MlbGameContext): Promise<OffensiveFormFeatures> {
    if (!this.options.enabled) {
      this.health = { ...this.health, cacheStatus: "DISABLED", warnings: ["MLB_STATCAST_PROVIDER_ENABLED is false."] };
      return buildUnavailableOffensiveFormFeatures(context.currentTime);
    }

    const home = getMlbTeamIdentityByName(context.homeTeam);
    const away = getMlbTeamIdentityByName(context.awayTeam);
    if (!home || !away) {
      this.health = {
        ...this.health,
        teamsUnavailable: [context.homeTeam, context.awayTeam].filter(Boolean),
        warnings: ["One or both teams could not be mapped to official MLB team IDs."],
      };
      return buildUnavailableOffensiveFormFeatures(context.currentTime);
    }

    try {
      const asOf = context.currentTime;
      const end = new Date(asOf);
      const officialGames: MlbOfficialScheduleGame[] = [];
      for (let index = 0; index < 75; index += 1) {
        const date = new Date(end.getTime() - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        officialGames.push(...await this.options.officialClient.getSchedule(date));
        const homeGames = selectCompletedGamesForTeam({
          officialGames,
          teamId: home.officialTeamId,
          asOf,
          requestedGames: 30,
        });
        const awayGames = selectCompletedGamesForTeam({
          officialGames,
          teamId: away.officialTeamId,
          asOf,
          requestedGames: 30,
        });
        if (homeGames.length >= 30 && awayGames.length >= 30) break;
      }
      const teams = [home, away];
      const windowsByTeam = new Map<string, Record<OffensiveRollingWindow, CompletedGame[]>>();
      teams.forEach((team) => {
        windowsByTeam.set(team.officialTeamId, {
          last7: selectCompletedGamesForTeam({ officialGames, teamId: team.officialTeamId, asOf, requestedGames: 7 }),
          last14: selectCompletedGamesForTeam({ officialGames, teamId: team.officialTeamId, asOf, requestedGames: 14 }),
          last30: selectCompletedGamesForTeam({ officialGames, teamId: team.officialTeamId, asOf, requestedGames: 30 }),
        });
      });

      const allGames = Array.from(windowsByTeam.values()).flatMap((windows) => windows.last30);
      const dates = allGames.map((game) => game.gameDate.slice(0, 10)).sort();
      if (dates.length === 0) throw new Error("No completed official games available for Statcast offensive windows.");
      const statcast = await (this.options.statcastClient ?? cachedStatcastClient).getRows({
        startDate: dates[0],
        endDate: dates.at(-1) ?? dates[0],
      });

      const teamWindows = teams.map((team): VerifiedOffensiveRollingStats => {
        const windows = windowsByTeam.get(team.officialTeamId);
        return {
          teamId: team.officialTeamId,
          teamName: team.officialTeamName,
          asOf,
          source: "BASEBALL_SAVANT",
          windows: {
            last7: aggregateStatcastRowsForTeam({ team, rows: statcast.rows, games: windows?.last7 ?? [], window: "last7" }),
            last14: aggregateStatcastRowsForTeam({ team, rows: statcast.rows, games: windows?.last14 ?? [], window: "last14" }),
            last30: aggregateStatcastRowsForTeam({ team, rows: statcast.rows, games: windows?.last30 ?? [], window: "last30" }),
          },
        };
      });
      const baseline = buildStatcastLeagueBaseline({ teamWindows, asOf });
      const baselineAvailable = Object.keys(baseline.metrics).length > 0;
      const features = buildOffensiveFormFeatures({
        home: teamWindows[0],
        away: teamWindows[1],
        observedAt: asOf,
        baseline: baselineAvailable ? baseline : undefined,
        scoringEnabled: this.options.scoreEnabled,
      });

      this.health = {
        provider: "BASEBALL_SAVANT_STATCAST_CSV",
        reachable: true,
        rawDataAvailable: features.metadata.availability !== "UNAVAILABLE",
        scoreAvailable: Boolean(features.home?.atlasOffensiveScore || features.away?.atlasOffensiveScore),
        baselineAvailable,
        cacheStatus: statcast.cacheHit ? "HIT" : "MISS",
        lastSuccessfulRefresh: statcast.fetchedAt,
        teamsAvailable: teamWindows
          .filter((team) => Object.values(team.windows).some((window) => (window?.plateAppearances ?? 0) > 0))
          .map((team) => team.teamName),
        teamsUnavailable: teamWindows
          .filter((team) => Object.values(team.windows).every((window) => (window?.plateAppearances ?? 0) === 0))
          .map((team) => team.teamName),
        warnings: [...baseline.warnings, ...(features.metadata.warnings ?? [])],
        errors: [],
      };
      return features;
    } catch (error) {
      this.health = {
        ...this.health,
        reachable: false,
        rawDataAvailable: false,
        cacheStatus: "ERROR",
        errors: [error instanceof Error ? error.message : "Statcast provider failed."],
      };
      return buildUnavailableOffensiveFormFeatures(context.currentTime);
    }
  }
}
