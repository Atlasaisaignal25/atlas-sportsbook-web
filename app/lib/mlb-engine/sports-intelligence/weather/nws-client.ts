type CacheEntry<T> = { expiresAt: number; value: T };

export type NwsHourlyPeriod = {
  startTime?: string;
  endTime?: string;
  temperature?: number;
  temperatureUnit?: string;
  probabilityOfPrecipitation?: { value?: number | null };
  relativeHumidity?: { value?: number | null };
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
};

export type NwsPointResponse = {
  properties?: {
    forecastHourly?: string;
    forecastGridData?: string;
    timeZone?: string;
  };
};

export type NwsHourlyResponse = {
  properties?: {
    generatedAt?: string;
    updated?: string;
    periods?: NwsHourlyPeriod[];
  };
};

const USER_AGENT = "AtlasSignalsWeatherAudit/1.0 (support@atlassignals.app)";
const pointCache = new Map<string, CacheEntry<NwsPointResponse>>();
const hourlyCache = new Map<string, CacheEntry<NwsHourlyResponse>>();

export type NwsClientHealth = {
  source: "NWS";
  reachable: boolean;
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  errors: string[];
  latencyMs: number;
  lastSuccessfulRequest?: string;
  userAgent: string;
};

export class NwsClient {
  private health: NwsClientHealth = {
    source: "NWS",
    reachable: false,
    requests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: [],
    latencyMs: 0,
    userAgent: USER_AGENT,
  };

  getHealth() {
    return this.health;
  }

  private async fetchJson<T>(url: string) {
    const started = Date.now();
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/geo+json, application/json",
      },
      cache: "no-store",
    });
    this.health.requests += 1;
    this.health.cacheMisses += 1;
    this.health.latencyMs += Date.now() - started;
    if (!response.ok) throw new Error(`NWS returned ${response.status} for ${url}`);
    this.health.reachable = true;
    this.health.lastSuccessfulRequest = new Date().toISOString();
    return (await response.json()) as T;
  }

  async getPoint(latitude: number, longitude: number) {
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const cached = pointCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.health.cacheHits += 1;
      return cached.value;
    }
    const value = await this.fetchJson<NwsPointResponse>(`https://api.weather.gov/points/${key}`);
    pointCache.set(key, { value, expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000 });
    return value;
  }

  async getHourlyForecast(url: string) {
    const cached = hourlyCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      this.health.cacheHits += 1;
      return cached.value;
    }
    const value = await this.fetchJson<NwsHourlyResponse>(url);
    hourlyCache.set(url, { value, expiresAt: Date.now() + 20 * 60 * 1000 });
    return value;
  }
}

export const cachedNwsClient = new NwsClient();

