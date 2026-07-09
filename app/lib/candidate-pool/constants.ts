import type {
  CandidateLifecycleStatus,
  CandidateMarket,
  CandidateRiskFlag,
  CandidateSource,
  CandidateSport,
} from "./types";

export const CANDIDATE_SPORTS = [
  "mlb",
  "nba",
  "nhl",
  "nfl",
  "soccer",
] as const satisfies readonly CandidateSport[];

export const CANDIDATE_MARKETS = [
  "h2h",
  "spread",
  "total",
  "team_total",
  "btts",
  "corners",
  "other",
] as const satisfies readonly CandidateMarket[];

export const SUPPORTED_CANDIDATE_MARKETS = [
  "h2h",
  "spread",
  "total",
] as const satisfies readonly CandidateMarket[];

export const CANDIDATE_SOURCES = [
  "odds_api",
  "sportsdataio",
  "public_signals_legacy",
  "manual",
  "unknown",
] as const satisfies readonly CandidateSource[];

export const CANDIDATE_LIFECYCLE_STATUSES = [
  "raw",
  "normalized",
  "scored",
  "eligible",
  "rejected",
  "published",
  "archived",
] as const satisfies readonly CandidateLifecycleStatus[];

export const CANDIDATE_RISK_FLAGS = [
  "missing_odds",
  "missing_score",
  "low_liquidity",
  "market_conflict",
  "bad_price",
  "line_mismatch",
  "game_started",
  "duplicate_candidate",
  "unsupported_market",
  "missing_team",
  "invalid_time",
  "unknown",
] as const satisfies readonly CandidateRiskFlag[];

export const DEFAULT_CANDIDATE_SOURCE: CandidateSource = "unknown";
export const DEFAULT_CANDIDATE_STATUS: CandidateLifecycleStatus = "raw";
