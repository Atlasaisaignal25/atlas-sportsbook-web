export type BankrollProfile = "atlas_recommended" | "higher_exposure";

export type BankrollPlanStatus = "active" | "not_configured";

export type AtlasPlanStatus =
  | "pending"
  | "confirmed"
  | "started"
  | "won"
  | "lost"
  | "push"
  | "cancelled"
  | "downgraded"
  | "removed"
  | "no_eligible_replacement";

export type AtlasPlanSource = "signals" | "top3" | "top5" | "topsignal" | "manual";

export type AtlasPlanPackage = "free" | "exclusive" | "premium" | "unlimited";

export type AtlasPlanResult = "won" | "lost" | "push" | "cancelled" | null;

export type AtlasPlanFinalResult = Exclude<AtlasPlanResult, null>;

export type AtlasPlanSport = "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER";

export type MembershipContext = {
  package: AtlasPlanPackage;
  selectedSport: AtlasPlanSport | null;
  availableSports: AtlasPlanSport[];
};

export type ReplacementReason = "removed" | "downgraded" | "started_unavailable" | "candidate_invalid";

export type ReplacementRecord = {
  originalPickId: string;
  replacementPickId: string;
  originalRank: number;
  replacementRank: number;
  reason: ReplacementReason;
  replacedAt: string;
  sport: string;
  source: AtlasPlanSource;
  package: AtlasPlanPackage;
};

export type AtlasPlanCandidate = {
  candidateId: string;
  sport: AtlasPlanSport;
  league: string;
  selection: string;
  market: string;
  odds: number;
  status: AtlasPlanStatus;
  package: AtlasPlanPackage;
  startTime: string;
  source: AtlasPlanSource;
  rank: number;
};

export type AtlasPlan = {
  id: string;
  candidateId: string;
  sport: string;
  league: string;
  selection: string;
  market: string;
  odds: number;
  status: AtlasPlanStatus;
  package: AtlasPlanPackage;
  recommendedUnit: number;
  riskAmount: number;
  startTime: string;
  createdAt: string;
  updatedAt: string;
  source: AtlasPlanSource;
  rank: number;
  locked: boolean;
  started: boolean;
  result: AtlasPlanResult;
  completedAt: string | null;
  profit: number;
  originalRank: number;
  plannedExposure: number;
  replacementHistory: ReplacementRecord[];
};

export type AtlasPlanCollection = {
  plans: AtlasPlan[];
  primaryPlan: AtlasPlan | null;
  manualSelectionRequired: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BankrollConfig = {
  initialBankroll: number;
  currentBankroll: number;
  recommendedUnit: number;
  profile: BankrollProfile;
  membership?: MembershipContext;
  atlasPlan?: AtlasPlan;
  atlasPlanCollection?: AtlasPlanCollection;
  createdAt: string;
  updatedAt: string;
};

export type BankrollValidationResult =
  | { valid: true; value: number }
  | { valid: false; error: string };

export type FinancialState = {
  initialBankroll: number;
  currentBankroll: number;
  profile: BankrollProfile;
  currentCycle: string;
  planStatus: BankrollPlanStatus;
  createdAt: string;
  updatedAt: string;
};

export type ROIResult = {
  value: number;
  status: "positive" | "zero" | "negative";
};

export type ExposureResult = {
  value: number;
  target: number;
  status: "aligned" | "off_plan";
};

export type FinancialMetrics = {
  currentBankroll: number;
  recommendedUnit: number;
  profit: number;
  roi: ROIResult;
  exposure: ExposureResult;
};

export type BankrollFinancialPlan = {
  state: FinancialState;
  metrics: FinancialMetrics;
};
