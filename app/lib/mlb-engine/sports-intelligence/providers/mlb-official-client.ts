import type { MlbOfficialScheduleGame } from "../mlb-game-mapper";

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export type MlbOfficialPerson = {
  id?: number;
  fullName?: string;
  pitchHand?: {
    code?: string;
    description?: string;
  };
};

export type MlbOfficialStatsResponse = {
  stats?: Array<{
    splits?: Array<{
      stat?: Record<string, unknown>;
      date?: string;
      game?: {
        gamePk?: number;
      };
    }>;
  }>;
};

export interface MlbOfficialClient {
  getSchedule(date: string): Promise<MlbOfficialScheduleGame[]>;
  getPerson(playerId: string): Promise<MlbOfficialPerson | null>;
  getPitcherSeasonStats(playerId: string, season: string): Promise<Record<string, unknown> | undefined>;
  getPitcherGameLog(playerId: string, season: string): Promise<NonNullable<MlbOfficialStatsResponse["stats"]>[number]["splits"]>;
}

const MLB_STATS_API_BASE_URL = "https://statsapi.mlb.com/api/v1";
const scheduleCache = new Map<string, CacheEntry<MlbOfficialScheduleGame[]>>();
const personCache = new Map<string, CacheEntry<MlbOfficialPerson | null>>();
const seasonStatsCache = new Map<string, CacheEntry<Record<string, unknown> | undefined>>();
const gameLogCache = new Map<string, CacheEntry<NonNullable<MlbOfficialStatsResponse["stats"]>[number]["splits"]>>();

const SCHEDULE_TTL_MS = 15 * 60 * 1000;
const PERSON_TTL_MS = 6 * 60 * 60 * 1000;
const SEASON_STATS_TTL_MS = 60 * 60 * 1000;
const GAME_LOG_TTL_MS = 30 * 60 * 1000;

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return entry.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MLB_STATS_API_BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`MLB Stats API returned ${response.status} for ${path}`);
  }

  return (await response.json()) as T;
}

export class CachedMlbOfficialClient implements MlbOfficialClient {
  async getSchedule(date: string) {
    const key = `schedule:${date}`;
    const cached = getCached(scheduleCache, key);
    if (cached) return cached;

    const data = await fetchJson<{ dates?: Array<{ games?: MlbOfficialScheduleGame[] }> }>(
      `/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=probablePitcher`,
    );
    const games = data.dates?.flatMap((day) => day.games ?? []) ?? [];
    setCached(scheduleCache, key, games, SCHEDULE_TTL_MS);
    return games;
  }

  async getPerson(playerId: string) {
    const key = `person:${playerId}`;
    const cached = getCached(personCache, key);
    if (cached !== undefined) return cached;

    const data = await fetchJson<{ people?: MlbOfficialPerson[] }>(`/people/${encodeURIComponent(playerId)}`);
    const person = data.people?.[0] ?? null;
    setCached(personCache, key, person, PERSON_TTL_MS);
    return person;
  }

  async getPitcherSeasonStats(playerId: string, season: string) {
    const key = `season:${playerId}:${season}`;
    const cached = getCached(seasonStatsCache, key);
    if (cached !== undefined) return cached;

    const data = await fetchJson<MlbOfficialStatsResponse>(
      `/people/${encodeURIComponent(playerId)}/stats?stats=season&group=pitching&season=${encodeURIComponent(season)}`,
    );
    const stat = data.stats?.[0]?.splits?.[0]?.stat;
    setCached(seasonStatsCache, key, stat, SEASON_STATS_TTL_MS);
    return stat;
  }

  async getPitcherGameLog(playerId: string, season: string) {
    const key = `game-log:${playerId}:${season}`;
    const cached = getCached(gameLogCache, key);
    if (cached !== undefined) return cached;

    const data = await fetchJson<MlbOfficialStatsResponse>(
      `/people/${encodeURIComponent(playerId)}/stats?stats=gameLog&group=pitching&season=${encodeURIComponent(season)}`,
    );
    const splits = data.stats?.[0]?.splits ?? [];
    setCached(gameLogCache, key, splits, GAME_LOG_TTL_MS);
    return splits;
  }
}

export const cachedMlbOfficialClient = new CachedMlbOfficialClient();

