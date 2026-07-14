export type BankrollProfile = "atlas_recommended" | "higher_exposure";

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
