import {
  CANDIDATE_MARKETS,
  CANDIDATE_SPORTS,
  DEFAULT_CANDIDATE_SOURCE,
} from "./constants";
import type { CandidateMarket, CandidateSource, CandidateSport } from "./types";

const sportAliases: Record<string, CandidateSport> = {
  baseball_mlb: "mlb",
  basketball_nba: "nba",
  icehockey_nhl: "nhl",
  americanfootball_nfl: "nfl",
  football_nfl: "nfl",
  soccer_epl: "soccer",
  soccer_usa_mls: "soccer",
  soccer_fifa_world_cup: "soccer",
};

const marketAliases: Record<string, CandidateMarket> = {
  moneyline: "h2h",
  ml: "h2h",
  h2h_lay: "h2h",
  spreads: "spread",
  handicap: "spread",
  point_spread: "spread",
  totals: "total",
  over_under: "total",
  overunder: "total",
  team_totals: "team_total",
  both_teams_to_score: "btts",
};

export function normalizeSport(value: unknown): CandidateSport | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if ((CANDIDATE_SPORTS as readonly string[]).includes(normalized)) {
    return normalized as CandidateSport;
  }

  return sportAliases[normalized] ?? null;
}

export function normalizeMarket(value: unknown): CandidateMarket {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if ((CANDIDATE_MARKETS as readonly string[]).includes(normalized)) {
    return normalized as CandidateMarket;
  }

  return marketAliases[normalized] ?? "other";
}

export function normalizeTeamName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeCandidateSource(value: unknown): CandidateSource {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (
    normalized === "odds_api" ||
    normalized === "sportsdataio" ||
    normalized === "public_signals_legacy" ||
    normalized === "manual" ||
    normalized === "unknown"
  ) {
    return normalized;
  }

  return DEFAULT_CANDIDATE_SOURCE;
}

function candidateIdPart(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.+-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildCandidateId(params: {
  sport: CandidateSport;
  gameId: string;
  market: CandidateMarket;
  selection: string;
  line?: number | string | null;
  bookmaker?: string | null;
}) {
  return [
    params.sport,
    params.gameId,
    params.market,
    params.selection,
    params.line ?? "no-line",
    params.bookmaker ?? "best",
  ]
    .map(candidateIdPart)
    .filter(Boolean)
    .join(":");
}
