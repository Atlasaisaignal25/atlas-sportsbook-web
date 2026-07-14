export type BankrollProfile = "atlas_recommended" | "higher_exposure";

export type BankrollPlanStatus = "active" | "not_configured";

export type BankrollCycleStatus = "open" | "closed";

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

export type BankrollCycle = {
  id: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  status: BankrollCycleStatus;
  initialBankroll: number;
  createdAt: string;
  closedAt: string | null;
};

export type WeeklyStreaks = {
  longestWinningStreak: number;
  longestLosingStreak: number;
  currentEndingStreak: number;
  currentEndingType: "won" | "lost" | null;
};

export type WeeklySummary = {
  id: string;
  cycleNumber: number;
  startDate: string;
  endDate: string;
  status: "closed";
  initialBankroll: number;
  finalBankroll: number;
  profit: number;
  roi: number;
  recommendedUnitFinal: number;
  profile: BankrollProfile;
  package: AtlasPlanPackage;
  currentExposure: number;
  wins: number;
  losses: number;
  pushes: number;
  cancelled: number;
  completedPlans: number;
  pendingPlans: number;
  winRate: number;
  planScore: number;
  replacementCount: number;
  averageUnit: number;
  totalRisk: number;
  totalProfit: number;
  streaks: WeeklyStreaks;
  createdAt: string;
};

export type MonthlySummary = {
  id: string;
  month: number;
  year: number;
  startDate: string;
  endDate: string;
  weeklySummaryIds: string[];
  initialBankroll: number;
  finalBankroll: number;
  profit: number;
  roi: number;
  profile: BankrollProfile;
  package: AtlasPlanPackage;
  wins: number;
  losses: number;
  pushes: number;
  cancelled: number;
  winRate: number;
  planScore: number;
  completedPlans: number;
  replacementCount: number;
  averageUnit: number;
  totalRisk: number;
  totalProfit: number;
  bestWeekId: string | null;
  bestWeekROI: number;
  worstWeekId: string | null;
  worstWeekROI: number;
  longestWinningStreak: number;
  longestLosingStreak: number;
  createdAt: string;
};

export type BankrollConfig = {
  initialBankroll: number;
  currentBankroll: number;
  recommendedUnit: number;
  profile: BankrollProfile;
  membership?: MembershipContext;
  atlasPlan?: AtlasPlan;
  atlasPlanCollection?: AtlasPlanCollection;
  activeCycle?: BankrollCycle;
  cycleHistory?: BankrollCycle[];
  weeklySummaries?: WeeklySummary[];
  monthlySummaries?: MonthlySummary[];
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
