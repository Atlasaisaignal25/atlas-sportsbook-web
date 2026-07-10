import {
  UnavailableMlbSportsIntelligenceProvider,
  type MlbSportsIntelligenceProvider,
} from "../provider";
import {
  mapOddsEventToOfficialMlbGame,
  type MlbGameMappingResult,
  type MlbOfficialScheduleGame,
} from "../mlb-game-mapper";
import {
  normalizeStartingPitcher,
  startingPitcherAvailability,
  startingPitcherWarnings,
  toStartingPitcherContract,
  type NormalizedStartingPitcher,
} from "../pitcher-normalizer";
import type {
  MlbGameContext,
  StartingPitcherFeatures,
} from "../types";
import { cachedMlbOfficialClient, type MlbOfficialClient } from "./mlb-official-client";

type ProviderHealth = {
  source: "MLB_STATS_API";
  reachable: boolean;
  lastSuccessfulRequest?: string;
  gamesMapped: number;
  gamesUnmatched: number;
  bothPitchersAvailable: number;
  onePitcherAvailable: number;
  zeroPitchersAvailable: number;
  staleRecords: number;
  errors: string[];
  cacheStatus: "IN_MEMORY_TTL";
};

const unavailableProvider = new UnavailableMlbSportsIntelligenceProvider();
const FRESHNESS_MINUTES = 30;

function dateKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function adjacentDateKeys(value: string) {
  const date = new Date(`${dateKey(value)}T12:00:00Z`);
  return [-1, 0, 1].map((offset) => {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + offset);
    return copy.toISOString().slice(0, 10);
  });
}

function seasonKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(new Date().getUTCFullYear());
  return String(date.getUTCFullYear());
}

function sourceUpdatedAt(game?: MlbOfficialScheduleGame) {
  return game?.gameDate ?? new Date().toISOString();
}

function pitcherStatus(_game: MlbOfficialScheduleGame): "PROBABLE" {
  return "PROBABLE";
}

function countPitchers(home?: NormalizedStartingPitcher, away?: NormalizedStartingPitcher) {
  return Number(Boolean(home)) + Number(Boolean(away));
}

export class MlbOfficialPitcherProvider
  extends UnavailableMlbSportsIntelligenceProvider
  implements MlbSportsIntelligenceProvider {
  name = "MlbOfficialPitcherProvider";

  private health: ProviderHealth = {
    source: "MLB_STATS_API",
    reachable: false,
    gamesMapped: 0,
    gamesUnmatched: 0,
    bothPitchersAvailable: 0,
    onePitcherAvailable: 0,
    zeroPitchersAvailable: 0,
    staleRecords: 0,
    errors: [],
    cacheStatus: "IN_MEMORY_TTL",
  };

  constructor(private readonly client: MlbOfficialClient = cachedMlbOfficialClient) {
    super();
  }

  getHealth() {
    return this.health;
  }

  async resolveGame(context: MlbGameContext) {
    const dates = adjacentDateKeys(context.commenceTime);
    const gamesByDate = await Promise.all(dates.map((date) => this.client.getSchedule(date)));
    const games = gamesByDate.flat();
    const resolved = mapOddsEventToOfficialMlbGame({ context, officialGames: games });

    if (resolved.mapping.matched) this.health.gamesMapped += 1;
    else this.health.gamesUnmatched += 1;

    return resolved;
  }

  private async normalizePitcher(input: {
    pitcher?: { id?: number; fullName?: string };
    game: MlbOfficialScheduleGame;
    context: MlbGameContext;
  }) {
    if (!input.pitcher?.id) return undefined;

    const playerId = String(input.pitcher.id);
    const season = seasonKey(input.context.commenceTime);
    const [person, seasonStats, gameLog] = await Promise.all([
      this.client.getPerson(playerId),
      this.client.getPitcherSeasonStats(playerId, season),
      this.client.getPitcherGameLog(playerId, season),
    ]);
    this.health.reachable = true;
    this.health.lastSuccessfulRequest = new Date().toISOString();

    return normalizeStartingPitcher({
      probablePitcher: input.pitcher,
      person,
      status: pitcherStatus(input.game),
      sourceGameId: input.game.gamePk ? String(input.game.gamePk) : undefined,
      sourceUpdatedAt: sourceUpdatedAt(input.game),
      seasonStats,
      gameLog,
      commenceTime: input.context.commenceTime,
    });
  }

  async getStartingPitcherFeatures(context: MlbGameContext): Promise<StartingPitcherFeatures> {
    try {
      const resolved = await this.resolveGame(context);
      const mapping = resolved.mapping;
      const game = resolved.game;

      if (!mapping.matched || !game) {
        return {
          metadata: {
            availability: "UNAVAILABLE",
            source: "MLB_OFFICIAL",
            updatedAt: new Date().toISOString(),
            warnings: mapping.warnings,
          },
        };
      }

      const [home, away] = await Promise.all([
        this.normalizePitcher({
          pitcher: game.teams?.home?.probablePitcher,
          game,
          context,
        }),
        this.normalizePitcher({
          pitcher: game.teams?.away?.probablePitcher,
          game,
          context,
        }),
      ]);
      const pitcherCount = countPitchers(home, away);
      if (pitcherCount === 2) this.health.bothPitchersAvailable += 1;
      else if (pitcherCount === 1) this.health.onePitcherAvailable += 1;
      else this.health.zeroPitchersAvailable += 1;

      const warnings = [
        ...mapping.warnings,
        ...startingPitcherWarnings(home, away),
        ...(home ? [] : ["Home probable pitcher unavailable from MLB official schedule."]),
        ...(away ? [] : ["Away probable pitcher unavailable from MLB official schedule."]),
      ];
      const updatedAt = sourceUpdatedAt(game);
      const freshnessMinutes = Math.max(Math.round((Date.now() - new Date(updatedAt).getTime()) / 60000), 0);
      const stale = freshnessMinutes > FRESHNESS_MINUTES && new Date(context.commenceTime).getTime() - Date.now() <= 12 * 60 * 60 * 1000;
      if (stale) this.health.staleRecords += 1;

      return {
        metadata: {
          availability: startingPitcherAvailability({
            matched: mapping.matched,
            home,
            away,
            stale,
          }),
          source: "MLB_OFFICIAL",
          observedAt: new Date().toISOString(),
          updatedAt,
          freshnessMinutes,
          confidence: Math.round(mapping.confidence * 100),
          warnings,
        },
        homeStarter: home ? toStartingPitcherContract(home) : undefined,
        awayStarter: away ? toStartingPitcherContract(away) : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown MLB official pitcher provider error";
      this.health.errors.push(message);
      return {
        metadata: {
          availability: "ERROR",
          source: "MLB_OFFICIAL",
          observedAt: new Date().toISOString(),
          warnings: [message],
        },
      };
    }
  }
}

export function getMlbOfficialPitcherProviderWhenEnabled(flags: {
  sportsIntelligenceEnabled: boolean;
  pitcherModelEnabled: boolean;
}) {
  if (!flags.sportsIntelligenceEnabled || !flags.pitcherModelEnabled) {
    return unavailableProvider;
  }

  return new MlbOfficialPitcherProvider();
}

export type { ProviderHealth as MlbOfficialPitcherProviderHealth, MlbGameMappingResult };
