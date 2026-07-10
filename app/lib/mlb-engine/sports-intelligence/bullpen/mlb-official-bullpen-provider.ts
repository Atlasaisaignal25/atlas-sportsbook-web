import { UnavailableMlbSportsIntelligenceProvider } from "../provider";
import { mapOddsEventToOfficialMlbGame, type MlbOfficialScheduleGame } from "../mlb-game-mapper";
import { MLB_TEAM_IDENTITIES, getMlbTeamIdentityById } from "../mlb-team-mapping";
import {
  cachedMlbOfficialGameClient,
  type MlbOfficialBoxscore,
  type MlbOfficialBoxscoreTeam,
  type MlbOfficialGameClient,
} from "../providers/mlb-official-game-client";
import { cachedMlbOfficialClient, type MlbOfficialClient } from "../providers/mlb-official-client";
import type {
  BullpenFeatures,
  MlbGameContext,
  MlbRelieverAppearance,
  MlbTeamBullpenFeatures,
} from "../types";
import { buildTeamBullpenFeatures, fatigueDistribution } from "./bullpen-workload";
import {
  applyBullpenFatigueV2,
  applyBullpenQualityScores,
  qualityDistribution,
  rawBullpenWorkloadDistribution,
} from "./bullpen-calibration";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export type MlbOfficialBullpenProviderHealth = {
  source: "MLB_STATS_API";
  reachable: boolean;
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  gamesProcessed: number;
  reliefAppearancesProcessed: number;
  teamsAvailable: number;
  teamsPartial: number;
  teamsUnavailable: number;
  errors: string[];
  latencyMs: number;
  cacheStatus: "IN_MEMORY_TTL";
};

const unavailableProvider = new UnavailableMlbSportsIntelligenceProvider();
const completedGameStates = new Set(["Final", "Game Over", "Completed Early"]);
const teamFeatureCache = new Map<string, CacheEntry<MlbTeamBullpenFeatures>>();
const gameBoxscoreCache = new Map<string, CacheEntry<MlbOfficialBoxscore>>();

function addDays(date: Date, offset: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy;
}

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function isCompleted(game: MlbOfficialScheduleGame, asOf: string) {
  const state = game.status?.detailedState ?? "";
  const gameDate = game.gameDate ? new Date(game.gameDate).getTime() : NaN;
  return Boolean(
    game.gamePk &&
    game.gameDate &&
    Number.isFinite(gameDate) &&
    gameDate <= new Date(asOf).getTime() &&
    (game.status?.abstractGameState === "Final" || completedGameStates.has(state)),
  );
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function inningsToNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const [wholeRaw, outsRaw] = value.split(".");
  const whole = Number(wholeRaw);
  const outs = outsRaw === undefined ? 0 : Number(outsRaw);
  if (!Number.isFinite(whole) || !Number.isFinite(outs)) return undefined;
  return Math.round((whole + outs / 3) * 100) / 100;
}

function boolStat(value: unknown) {
  const parsed = toNumber(value);
  return parsed !== undefined ? parsed > 0 : false;
}

function playerKey(playerId: number | string) {
  return `ID${playerId}`;
}

function pitcherStats(team: MlbOfficialBoxscoreTeam, pitcherId: number) {
  return team.players?.[playerKey(pitcherId)]?.stats?.pitching ?? {};
}

function pitcherName(team: MlbOfficialBoxscoreTeam, pitcherId: number) {
  return team.players?.[playerKey(pitcherId)]?.person?.fullName ?? String(pitcherId);
}

function positionWarning(team: MlbOfficialBoxscoreTeam, pitcherId: number) {
  const player = team.players?.[playerKey(pitcherId)];
  const positions = [
    player?.position?.abbreviation,
    player?.position?.name,
    ...(player?.allPositions?.map((position) => position.abbreviation ?? position.name ?? "") ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  if (positions && !positions.includes("p") && !positions.includes("pitch")) {
    return "Pitching appearance may be a position-player pitching event.";
  }
  return undefined;
}

function sideAppearances(input: {
  officialGameId: string;
  gameDate: string;
  team: MlbOfficialBoxscoreTeam | undefined;
  warnings?: string[];
}) {
  const teamId = String(input.team?.team?.id ?? "");
  const teamName = input.team?.team?.name ?? getMlbTeamIdentityById(teamId)?.officialTeamName ?? teamId;
  const pitchers = input.team?.pitchers ?? [];
  const starterId = pitchers[0];
  return pitchers.map((pitcherId, index): MlbRelieverAppearance => {
    const stat = input.team ? pitcherStats(input.team, pitcherId) : {};
    const warnings = [...(input.warnings ?? [])];
    const unusualPosition = input.team ? positionWarning(input.team, pitcherId) : undefined;
    if (unusualPosition) warnings.push(unusualPosition);
    if (index === 0 && pitchers.length >= 2) warnings.push("Starter excluded from relief workload.");
    if (index === 1 && pitchers.length >= 6) warnings.push("Possible opener or bulk-reliever game; relief classification remains evidence-based by official order.");
    return {
      officialGameId: input.officialGameId,
      gameDate: input.gameDate,
      playerId: String(pitcherId),
      playerName: input.team ? pitcherName(input.team, pitcherId) : String(pitcherId),
      teamId,
      teamName,
      inningsPitched: inningsToNumber(stat.inningsPitched),
      pitchesThrown: toNumber(stat.pitchesThrown ?? stat.numberOfPitches),
      battersFaced: toNumber(stat.battersFaced),
      hitsAllowed: toNumber(stat.hits),
      walksAllowed: toNumber(stat.baseOnBalls ?? stat.walks),
      strikeouts: toNumber(stat.strikeOuts ?? stat.strikeouts),
      runsAllowed: toNumber(stat.runs),
      earnedRunsAllowed: toNumber(stat.earnedRuns),
      save: boolStat(stat.saves),
      hold: boolStat(stat.holds),
      blownSave: boolStat(stat.blownSaves),
      gameFinished: boolStat(stat.gamesFinished),
      startedGame: pitcherId === starterId,
      reliefAppearance: pitcherId !== starterId,
      source: "MLB_OFFICIAL",
      warnings,
    };
  });
}

export class MlbOfficialBullpenProvider {
  name = "MlbOfficialBullpenProvider";
  private health: MlbOfficialBullpenProviderHealth = {
    source: "MLB_STATS_API",
    reachable: false,
    requests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    gamesProcessed: 0,
    reliefAppearancesProcessed: 0,
    teamsAvailable: 0,
    teamsPartial: 0,
    teamsUnavailable: 0,
    errors: [],
    latencyMs: 0,
    cacheStatus: "IN_MEMORY_TTL",
  };

  constructor(
    private readonly options: {
      enabled: boolean;
      scoreEnabled?: boolean;
      fatigueVersion?: "v1" | "v2";
      qualityScoreEnabled?: boolean;
      officialClient?: MlbOfficialClient;
      gameClient?: MlbOfficialGameClient;
    },
  ) {}

  getHealth() {
    return this.health;
  }

  private async scheduleWindow(asOf: string) {
    const client = this.options.officialClient ?? cachedMlbOfficialClient;
    const anchor = new Date(asOf);
    const lookbackDays = this.options.qualityScoreEnabled ? 31 : 8;
    const dates = Array.from({ length: lookbackDays }, (_, index) => dateKey(addDays(anchor, -index)));
    const started = Date.now();
    const gamesByDate = await Promise.all(dates.map((date) => client.getSchedule(date)));
    this.health.requests += dates.length;
    this.health.cacheMisses += dates.length;
    this.health.latencyMs += Date.now() - started;
    this.health.reachable = true;
    return gamesByDate.flat().filter((game) => isCompleted(game, asOf));
  }

  private async getBoxscore(gamePk: string) {
    const cached = gameBoxscoreCache.get(gamePk);
    if (cached && cached.expiresAt > Date.now()) {
      this.health.cacheHits += 1;
      return cached.value;
    }
    const started = Date.now();
    const boxscore = await (this.options.gameClient ?? cachedMlbOfficialGameClient).getBoxscore(gamePk);
    this.health.requests += 1;
    this.health.cacheMisses += 1;
    this.health.latencyMs += Date.now() - started;
    gameBoxscoreCache.set(gamePk, { value: boxscore, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return boxscore;
  }

  async captureAllTeams(asOf = new Date().toISOString()) {
    if (!this.options.enabled) {
      return { teams: [] as MlbTeamBullpenFeatures[], gamesProcessed: 0, reliefAppearancesProcessed: 0, errors: [] as string[] };
    }
    const games = await this.scheduleWindow(asOf);
    const uniqueGames = Array.from(new Map(games.map((game) => [String(game.gamePk), game])).values());
    const appearancesByTeam = new Map<string, MlbRelieverAppearance[]>();
    const gamesByTeam = new Map<string, Set<string>>();
    const sourceDates: string[] = [];

    await Promise.all(uniqueGames.map(async (game) => {
      if (!game.gamePk) return;
      try {
        const boxscore = await this.getBoxscore(String(game.gamePk));
        const gameDate = game.gameDate ?? asOf;
        sourceDates.push(gameDate);
        const home = sideAppearances({ officialGameId: String(game.gamePk), gameDate, team: boxscore.teams?.home });
        const away = sideAppearances({ officialGameId: String(game.gamePk), gameDate, team: boxscore.teams?.away });
        [...home, ...away].forEach((appearance) => {
          const list = appearancesByTeam.get(appearance.teamId) ?? [];
          list.push(appearance);
          appearancesByTeam.set(appearance.teamId, list);
          const gameSet = gamesByTeam.get(appearance.teamId) ?? new Set<string>();
          gameSet.add(String(game.gamePk));
          gamesByTeam.set(appearance.teamId, gameSet);
        });
      } catch (error) {
        this.health.errors.push(error instanceof Error ? error.message : "Unknown bullpen boxscore error");
      }
    }));

    const teams = MLB_TEAM_IDENTITIES.map((team) => {
      const appearances = appearancesByTeam.get(team.officialTeamId) ?? [];
      const feature = buildTeamBullpenFeatures({
        teamId: team.officialTeamId,
        teamName: team.officialTeamName,
        appearances,
        gamesRequested: 7,
        gamesIncluded: gamesByTeam.get(team.officialTeamId)?.size ?? 0,
        asOf,
        sourceUpdatedAt: sourceDates.sort().at(-1),
        scoreEnabled: this.options.scoreEnabled,
      });
      return feature;
    });
    const fatigueCalibrated = this.options.scoreEnabled && this.options.fatigueVersion === "v2"
      ? teams.map(applyBullpenFatigueV2)
      : teams;
    const finalTeams = this.options.qualityScoreEnabled
      ? applyBullpenQualityScores(fatigueCalibrated, appearancesByTeam)
      : fatigueCalibrated;
    this.health.gamesProcessed = uniqueGames.length;
    this.health.reliefAppearancesProcessed = finalTeams.reduce((total, team) => total + team.relievers.reduce((sum, reliever) => sum + reliever.appearancesLast7Days, 0), 0);
    this.health.teamsAvailable = finalTeams.filter((team) => team.metadata.availability === "AVAILABLE").length;
    this.health.teamsPartial = finalTeams.filter((team) => team.metadata.availability === "PARTIAL").length;
    this.health.teamsUnavailable = finalTeams.filter((team) => team.metadata.availability === "UNAVAILABLE").length;
    finalTeams.forEach((team) => {
      teamFeatureCache.set(`${team.teamId}:${dateKey(asOf)}:${Boolean(this.options.scoreEnabled)}:${this.options.fatigueVersion ?? "v1"}:${Boolean(this.options.qualityScoreEnabled)}`, {
        value: team,
        expiresAt: Date.now() + 20 * 60 * 1000,
      });
    });
    return {
      teams: finalTeams,
      appearancesByTeam,
      gamesProcessed: uniqueGames.length,
      reliefAppearancesProcessed: this.health.reliefAppearancesProcessed,
      errors: this.health.errors,
      fatigueDistribution: fatigueDistribution(finalTeams),
      qualityDistribution: qualityDistribution(finalTeams),
      rawWorkloadDistribution: rawBullpenWorkloadDistribution(finalTeams),
    };
  }

  async getTeamBullpen(teamId: string, asOf: string) {
    const cached = teamFeatureCache.get(`${teamId}:${dateKey(asOf)}:${Boolean(this.options.scoreEnabled)}:${this.options.fatigueVersion ?? "v1"}:${Boolean(this.options.qualityScoreEnabled)}`);
    if (cached && cached.expiresAt > Date.now()) {
      this.health.cacheHits += 1;
      return cached.value;
    }
    const capture = await this.captureAllTeams(asOf);
    return capture.teams.find((team) => team.teamId === teamId);
  }

  async getBullpenFeatures(context: MlbGameContext): Promise<BullpenFeatures> {
    if (!this.options.enabled) return unavailableProvider.getBullpenFeatures(context);
    try {
      const officialClient = this.options.officialClient ?? cachedMlbOfficialClient;
      const anchor = new Date(context.commenceTime);
      const dates = [-1, 0, 1].map((offset) => dateKey(addDays(anchor, offset)));
      const games = (await Promise.all(dates.map((date) => officialClient.getSchedule(date)))).flat();
      const resolved = mapOddsEventToOfficialMlbGame({ context, officialGames: games });
      if (!resolved.mapping.matched || !resolved.mapping.officialHomeTeamId || !resolved.mapping.officialAwayTeamId) {
        return {
          metadata: {
            availability: "UNAVAILABLE",
            source: "MLB_OFFICIAL",
            observedAt: context.currentTime,
            warnings: resolved.mapping.warnings,
          },
          overallAvailability: "UNAVAILABLE",
        };
      }
      const [home, away] = await Promise.all([
        this.getTeamBullpen(resolved.mapping.officialHomeTeamId, context.currentTime),
        this.getTeamBullpen(resolved.mapping.officialAwayTeamId, context.currentTime),
      ]);
      const availability = home?.metadata.availability === "AVAILABLE" && away?.metadata.availability === "AVAILABLE"
        ? "AVAILABLE"
        : home || away ? "PARTIAL" : "UNAVAILABLE";
      const fatigueAdvantage = home?.fatigueScore !== undefined && away?.fatigueScore !== undefined
        ? home.fatigueScore < away.fatigueScore ? "HOME" : away.fatigueScore < home.fatigueScore ? "AWAY" : "NEUTRAL"
        : undefined;
      const qualityAdvantage = home?.qualityScore !== undefined && away?.qualityScore !== undefined
        ? home.qualityScore > away.qualityScore ? "HOME" : away.qualityScore > home.qualityScore ? "AWAY" : "NEUTRAL"
        : undefined;
      return {
        metadata: {
          availability,
          source: "MLB_OFFICIAL",
          observedAt: context.currentTime,
          updatedAt: [home?.metadata.updatedAt, away?.metadata.updatedAt].filter(Boolean).sort().at(-1),
          warnings: [...(home?.warnings ?? []), ...(away?.warnings ?? []), ...resolved.mapping.warnings],
        },
        home: home as BullpenFeatures["home"],
        away: away as BullpenFeatures["away"],
        fatigueAdvantage,
        bullpenAdvantage: undefined,
        qualityAdvantage,
        overallAvailability: availability,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown MLB official bullpen provider error";
      this.health.errors.push(message);
      return {
        metadata: {
          availability: "ERROR",
          source: "MLB_OFFICIAL",
          observedAt: context.currentTime,
          warnings: [message],
        },
        overallAvailability: "ERROR",
      };
    }
  }
}

export function getMlbOfficialBullpenProviderWhenEnabled(flags: {
  sportsIntelligenceEnabled: boolean;
  bullpenModelEnabled: boolean;
  bullpenProviderEnabled: boolean;
  bullpenFatigueScoreEnabled?: boolean;
  bullpenFatigueVersion?: "v1" | "v2";
  bullpenQualityScoreEnabled?: boolean;
}) {
  if (!flags.sportsIntelligenceEnabled || !flags.bullpenModelEnabled || !flags.bullpenProviderEnabled) {
    return new MlbOfficialBullpenProvider({ enabled: false });
  }
  return new MlbOfficialBullpenProvider({
    enabled: true,
    scoreEnabled: Boolean(flags.bullpenFatigueScoreEnabled),
    fatigueVersion: flags.bullpenFatigueVersion ?? "v1",
    qualityScoreEnabled: Boolean(flags.bullpenQualityScoreEnabled),
  });
}
