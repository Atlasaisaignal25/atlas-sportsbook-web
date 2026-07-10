import { getMlbTeamIdentityBySavantCode } from "../mlb-team-mapping";

export type StatcastSearchRow = {
  gameDate?: string;
  gamePk?: string;
  atBatNumber?: number;
  pitchNumber?: number;
  gameType?: string;
  homeTeam?: string;
  awayTeam?: string;
  battingTeamCode?: string;
  battingTeamId?: string;
  events?: string;
  description?: string;
  launchSpeed?: number;
  launchSpeedAngle?: number;
  estimatedBaUsingSpeedangle?: number;
  estimatedWobaUsingSpeedangle?: number;
  estimatedSlgUsingSpeedangle?: number;
  wobaValue?: number;
  wobaDenom?: number;
};

export type StatcastClientResult = {
  rows: StatcastSearchRow[];
  sourceUrl: string;
  fetchedAt: string;
  cacheHit: boolean;
  latencyMs: number;
};

type CacheEntry = {
  expiresAt: number;
  result: StatcastClientResult;
};

const BASEBALL_SAVANT_STATCAST_CSV_URL = "https://baseballsavant.mlb.com/statcast_search/csv";
const cache = new Map<string, CacheEntry>();

function parseNumber(value: string | undefined) {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted && char === '"' && next === '"') {
      field += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function normalizeStatcastCsv(text: string): StatcastSearchRow[] {
  const parsed = parseCsv(text);
  const headers = parsed[0]?.map((header) => header.trim()) ?? [];
  if (headers.length === 0) return [];

  return parsed.slice(1).map((values) => {
    const record = new Map<string, string>();
    headers.forEach((header, index) => record.set(header, values[index] ?? ""));
    const homeTeam = record.get("home_team") || undefined;
    const awayTeam = record.get("away_team") || undefined;
    const inningTopbot = record.get("inning_topbot");
    const battingTeamCode = inningTopbot === "Top" ? awayTeam : inningTopbot === "Bot" ? homeTeam : undefined;
    const battingTeam = battingTeamCode ? getMlbTeamIdentityBySavantCode(battingTeamCode) : undefined;

    return {
      gameDate: record.get("game_date") || undefined,
      gamePk: record.get("game_pk") || undefined,
      atBatNumber: parseNumber(record.get("at_bat_number")),
      pitchNumber: parseNumber(record.get("pitch_number")),
      gameType: record.get("game_type") || undefined,
      homeTeam,
      awayTeam,
      battingTeamCode,
      battingTeamId: battingTeam?.officialTeamId,
      events: record.get("events") || undefined,
      description: record.get("description") || undefined,
      launchSpeed: parseNumber(record.get("launch_speed")),
      launchSpeedAngle: parseNumber(record.get("launch_speed_angle")),
      estimatedBaUsingSpeedangle: parseNumber(record.get("estimated_ba_using_speedangle")),
      estimatedWobaUsingSpeedangle: parseNumber(record.get("estimated_woba_using_speedangle")),
      estimatedSlgUsingSpeedangle: parseNumber(record.get("estimated_slg_using_speedangle")),
      wobaValue: parseNumber(record.get("woba_value")),
      wobaDenom: parseNumber(record.get("woba_denom")),
    };
  });
}

function buildUrl(params: { startDate: string; endDate: string }) {
  const url = new URL(BASEBALL_SAVANT_STATCAST_CSV_URL);
  url.searchParams.set("all", "true");
  url.searchParams.set("type", "details");
  url.searchParams.set("player_type", "batter");
  url.searchParams.set("game_date_gt", params.startDate);
  url.searchParams.set("game_date_lt", params.endDate);
  url.searchParams.set("hfGT", "R|");
  url.searchParams.set("hfSea", new Date(params.endDate).getUTCFullYear().toString() + "|");
  url.searchParams.set("csv", "true");
  return url.toString();
}

export class StatcastClient {
  constructor(private readonly options: { ttlMs?: number } = {}) {}

  async getRows(params: { startDate: string; endDate: string }): Promise<StatcastClientResult> {
    const sourceUrl = buildUrl(params);
    const cached = cache.get(sourceUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, cacheHit: true, latencyMs: 0 };
    }

    const started = Date.now();
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Baseball Savant Statcast CSV returned ${response.status}`);
    const text = await response.text();
    const result: StatcastClientResult = {
      rows: normalizeStatcastCsv(text),
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      cacheHit: false,
      latencyMs: Date.now() - started,
    };
    cache.set(sourceUrl, {
      expiresAt: Date.now() + (this.options.ttlMs ?? 45 * 60 * 1000),
      result,
    });
    return result;
  }
}

export const cachedStatcastClient = new StatcastClient();
