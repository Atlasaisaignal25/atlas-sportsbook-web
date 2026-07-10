type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export type MlbOfficialGamePlayer = {
  person?: {
    id?: number;
    fullName?: string;
  };
  position?: {
    code?: string;
    name?: string;
    abbreviation?: string;
  };
  status?: {
    code?: string;
    description?: string;
  };
  battingOrder?: string;
  gameStatus?: {
    isOnBench?: boolean;
    isSubstitute?: boolean;
  };
  allPositions?: Array<{
    code?: string;
    name?: string;
    abbreviation?: string;
  }>;
  stats?: {
    pitching?: Record<string, unknown>;
  };
};

export type MlbOfficialBoxscoreTeam = {
  team?: {
    id?: number;
    name?: string;
  };
  battingOrder?: string[];
  pitchers?: number[];
  players?: Record<string, MlbOfficialGamePlayer>;
};

export type MlbOfficialBoxscore = {
  teams?: {
    home?: MlbOfficialBoxscoreTeam;
    away?: MlbOfficialBoxscoreTeam;
  };
};

export type MlbOfficialLiveFeed = {
  gameData?: {
    datetime?: {
      dateTime?: string;
      officialDate?: string;
    };
    status?: {
      abstractGameState?: string;
      detailedState?: string;
      statusCode?: string;
    };
    probablePitchers?: {
      home?: {
        id?: number;
        fullName?: string;
      };
      away?: {
        id?: number;
        fullName?: string;
      };
    };
    teams?: {
      home?: {
        id?: number;
        name?: string;
      };
      away?: {
        id?: number;
        name?: string;
      };
    };
  };
};

export type MlbOfficialBoxscoreGameInfo = {
  gameStatus?: string;
  gameDate?: string;
  officialDate?: string;
  teams?: {
    home?: { id?: number; name?: string };
    away?: { id?: number; name?: string };
  };
};

export interface MlbOfficialGameClient {
  getLiveFeed(gamePk: string): Promise<MlbOfficialLiveFeed>;
  getBoxscore(gamePk: string): Promise<MlbOfficialBoxscore>;
}

const MLB_STATS_API_BASE_URL = "https://statsapi.mlb.com";
const liveFeedCache = new Map<string, CacheEntry<MlbOfficialLiveFeed>>();
const boxscoreCache = new Map<string, CacheEntry<MlbOfficialBoxscore>>();

function ttlForGame(commenceTime?: string) {
  const start = commenceTime ? new Date(commenceTime).getTime() : NaN;
  if (!Number.isFinite(start)) return 10 * 60 * 1000;

  const minutesUntilStart = (start - Date.now()) / 60000;
  if (minutesUntilStart <= 60) return 2 * 60 * 1000;
  if (minutesUntilStart <= 180) return 5 * 60 * 1000;
  return 15 * 60 * 1000;
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return undefined;
  return entry.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

async function fetchJson<T>(path: string) {
  const response = await fetch(`${MLB_STATS_API_BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`MLB Stats API returned ${response.status} for ${path}`);
  return (await response.json()) as T;
}

export class CachedMlbOfficialGameClient implements MlbOfficialGameClient {
  async getLiveFeed(gamePk: string) {
    const key = `live:${gamePk}`;
    const cached = getCached(liveFeedCache, key);
    if (cached) return cached;

    const feed = await fetchJson<MlbOfficialLiveFeed>(`/api/v1.1/game/${encodeURIComponent(gamePk)}/feed/live`);
    setCached(liveFeedCache, key, feed, ttlForGame(feed.gameData?.datetime?.dateTime));
    return feed;
  }

  async getBoxscore(gamePk: string) {
    const key = `box:${gamePk}`;
    const cached = getCached(boxscoreCache, key);
    if (cached) return cached;

    const boxscore = await fetchJson<MlbOfficialBoxscore>(`/api/v1/game/${encodeURIComponent(gamePk)}/boxscore`);
    setCached(boxscoreCache, key, boxscore, 2 * 60 * 1000);
    return boxscore;
  }
}

export const cachedMlbOfficialGameClient = new CachedMlbOfficialGameClient();
