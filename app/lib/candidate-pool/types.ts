export type CandidateSport = "mlb" | "nba" | "nhl" | "nfl" | "soccer";

export type CandidateMarket =
  | "h2h"
  | "spread"
  | "total"
  | "team_total"
  | "btts"
  | "corners"
  | "other";

export type CandidateSource =
  | "odds_api"
  | "sportsdataio"
  | "public_signals_legacy"
  | "manual"
  | "unknown";

export type CandidateLifecycleStatus =
  | "raw"
  | "normalized"
  | "scored"
  | "eligible"
  | "rejected"
  | "published"
  | "archived";

export type CandidateRiskFlag =
  | "missing_odds"
  | "missing_score"
  | "low_liquidity"
  | "market_conflict"
  | "bad_price"
  | "line_mismatch"
  | "game_started"
  | "duplicate_candidate"
  | "unsupported_market"
  | "missing_team"
  | "invalid_time"
  | "unknown";

export type CandidatePick = {
  id: string;
  sport: CandidateSport;
  source: CandidateSource;
  sourceGameId?: string | null;
  gameId: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  league?: string | null;
  market: CandidateMarket;
  selection: string;
  line?: number | null;
  odds?: number | null;
  bookmaker?: string | null;
  bookCount?: number | null;
  averagePrice?: number | null;
  bestPrice?: number | null;
  priceSpread?: number | null;
  impliedProbability?: number | null;
  edge?: number | null;
  confidence?: number | null;
  valuePriority?: number | null;
  marketConsensus?: number | null;
  steamScore?: number | null;
  sharpScore?: number | null;
  liquidityScore?: number | null;
  rlmScore?: number | null;
  closingLineProjection?: number | null;
  riskFlags: CandidateRiskFlag[];
  tags: string[];
  status: CandidateLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  raw?: unknown;
};

export type CandidateRejection = {
  candidateId?: string | null;
  sport: CandidateSport;
  gameId?: string | null;
  reason: CandidateRiskFlag;
  details?: string | Record<string, unknown> | null;
};

export type RawCandidateInput = {
  id?: string | null;
  sport?: string | null;
  source?: string | null;
  sourceGameId?: string | null;
  gameId?: string | null;
  commenceTime?: string | Date | null;
  commence_time?: string | Date | null;
  startTime?: string | Date | null;
  start_time?: string | Date | null;
  homeTeam?: string | null;
  home_team?: string | null;
  awayTeam?: string | null;
  away_team?: string | null;
  league?: string | null;
  market?: string | null;
  marketKey?: string | null;
  market_key?: string | null;
  selection?: string | null;
  pick?: string | null;
  outcome?: string | null;
  line?: number | string | null;
  point?: number | string | null;
  odds?: number | string | null;
  price?: number | string | null;
  bookmaker?: string | null;
  sportsbook?: string | null;
  bookCount?: number | string | null;
  book_count?: number | string | null;
  averagePrice?: number | string | null;
  average_price?: number | string | null;
  bestPrice?: number | string | null;
  best_price?: number | string | null;
  priceSpread?: number | string | null;
  price_spread?: number | string | null;
  tags?: string[] | string | null;
  raw?: unknown;
};

export type CandidatePoolSourceInput = {
  source: CandidateSource | string;
  candidates?: RawCandidateInput[];
  games?: RawCandidateInput[];
  warnings?: string[];
};

export type BuildCandidatePoolInput = {
  sport: CandidateSport | string;
  date: string;
  generatedAt?: string | Date;
  now?: Date;
  sources: CandidatePoolSourceInput[];
};

export type CandidatePoolResult = {
  sport: CandidateSport;
  date: string;
  generatedAt: string;
  totalGames: number;
  totalCandidates: number;
  eligibleCandidates: number;
  rejectedCandidates: number;
  candidates: CandidatePick[];
  rejections: CandidateRejection[];
  warnings: string[];
};
