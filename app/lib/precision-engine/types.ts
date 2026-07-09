export type PrecisionSport = "MLB" | "NBA" | "NHL" | "SOCCER" | "NFL";

export type PrecisionMarket = "h2h" | "spreads" | "totals" | string;

export type PrecisionLifecycleStatus =
  | "scanning"
  | "validating"
  | "strong_candidate"
  | "final_review"
  | "available_now"
  | "locked"
  | "no_play";

export type PrecisionNoPlayReason =
  | "no_candidates"
  | "below_threshold"
  | "market_conflict"
  | "liquidity_low"
  | "clv_risk"
  | "game_started"
  | "missing_data";

export type PrecisionTimeline = {
  status: PrecisionLifecycleStatus;
  now: string;
  commenceTime: string | null;
  releaseAt: string | null;
  lockedAt: string | null;
  minutesToRelease: number | null;
  minutesToKickoff: number | null;
  progressPercent: number;
  canPurchase: boolean;
  canRevealPick: boolean;
  noPlayReason?: PrecisionNoPlayReason;
};

export type PrecisionCandidate = {
  id?: string | null;
  sport: PrecisionSport;
  date: string;
  gameId?: string | null;
  awayTeam: string;
  homeTeam: string;
  pick: string;
  market: PrecisionMarket;
  line?: number | null;
  odds?: number | null;
  startTime?: string | null;
  status?: string | null;
  confidence?: number | null;
  internalScore?: number | null;
  edge?: number | null;
  analysisSummary?: string | null;
  confidenceLabel?: string | null;
  edgeLabel?: string | null;
  riskNote?: string | null;
  modelFactors?: string[] | null;
};

export type PrecisionDecision = {
  product: "top_signal" | "top_play";
  sport: PrecisionSport;
  candidate: PrecisionCandidate;
  precisionScore: number;
  releaseAt: string | null;
  timeline?: PrecisionTimeline;
  filters: {
    oddsQualified: boolean;
    lineQualified: boolean;
    marketQualified: boolean;
    startTimeQualified: boolean;
  };
  reasons: string[];
};

export type PrecisionPreview = {
  date: string;
  candidateCount: number;
  qualifiedCount: number;
  topSignalsBySport: Partial<Record<PrecisionSport, PrecisionDecision>>;
  topPlay: PrecisionDecision | null;
};
