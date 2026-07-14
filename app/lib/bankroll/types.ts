export type BankrollProfile = "atlas_recommended" | "higher_exposure";

export type BankrollPlanStatus = "active" | "not_configured";

export type BankrollConfig = {
  initialBankroll: number;
  currentBankroll: number;
  recommendedUnit: number;
  profile: BankrollProfile;
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
