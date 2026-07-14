import { ATLAS_RECOMMENDED_PERCENTAGE, HIGHER_EXPOSURE_PERCENTAGE } from "./constants";
import type {
  BankrollConfig,
  BankrollFinancialPlan,
  BankrollProfile,
  ExposureResult,
  FinancialMetrics,
  FinancialState,
  ROIResult,
} from "./types";

export function buildFinancialState(config: BankrollConfig): FinancialState {
  return {
    initialBankroll: clampBankroll(config.initialBankroll),
    currentBankroll: clampBankroll(config.currentBankroll),
    profile: config.profile,
    currentCycle: "Day 4 / 7",
    planStatus: "active",
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

export function buildFinancialPlan(config: BankrollConfig): BankrollFinancialPlan {
  const state = buildFinancialState(config);

  return {
    state,
    metrics: calculateFinancialMetrics(state),
  };
}

export function calculateFinancialMetrics(state: FinancialState): FinancialMetrics {
  const currentBankroll = calculateCurrentBankroll(state.currentBankroll);
  const recommendedUnit = calculateRecommendedUnit(currentBankroll, state.profile);

  return {
    currentBankroll,
    recommendedUnit,
    profit: calculateProfit(currentBankroll, state.initialBankroll),
    roi: calculateROI(currentBankroll, state.initialBankroll),
    exposure: calculateExposure(recommendedUnit, currentBankroll, state.profile),
  };
}

export function updateCurrentBankroll(state: FinancialState, currentBankroll: number): BankrollFinancialPlan {
  const nextState: FinancialState = {
    ...state,
    currentBankroll: calculateCurrentBankroll(currentBankroll),
    updatedAt: new Date().toISOString(),
  };

  return {
    state: nextState,
    metrics: calculateFinancialMetrics(nextState),
  };
}

export function calculateCurrentBankroll(currentBankroll: number) {
  return clampBankroll(currentBankroll);
}

export function calculateRecommendedUnit(currentBankroll: number, profile: BankrollProfile) {
  return roundCurrency(Math.max(0, currentBankroll) * getBankrollProfilePercentage(profile));
}

export function calculateProfit(currentBankroll: number, initialBankroll: number) {
  return roundCurrency(calculateCurrentBankroll(currentBankroll) - clampBankroll(initialBankroll));
}

export function calculateROI(currentBankroll: number, initialBankroll: number): ROIResult {
  const safeInitial = clampBankroll(initialBankroll);
  if (safeInitial === 0) return { value: 0, status: "zero" };

  const value = roundPercentage((calculateProfit(currentBankroll, safeInitial) / safeInitial) * 100);

  return {
    value,
    status: value > 0 ? "positive" : value < 0 ? "negative" : "zero",
  };
}

export function calculateExposure(recommendedUnit: number, currentBankroll: number, profile: BankrollProfile): ExposureResult {
  const safeBankroll = calculateCurrentBankroll(currentBankroll);
  const target = roundPercentage(getBankrollProfilePercentage(profile) * 100);
  if (safeBankroll === 0) return { value: 0, target, status: "off_plan" };

  const value = roundPercentage((Math.max(0, recommendedUnit) / safeBankroll) * 100);

  return {
    value,
    target,
    status: Math.abs(value - target) <= 0.01 ? "aligned" : "off_plan",
  };
}

export function getBankrollProfilePercentage(profile: BankrollProfile) {
  return profile === "higher_exposure" ? HIGHER_EXPOSURE_PERCENTAGE : ATLAS_RECOMMENDED_PERCENTAGE;
}

export function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function formatPercentage(value: number) {
  const rounded = roundPercentage(value);
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  }).format(Math.abs(rounded));

  if (rounded > 0) return `+${formatted}%`;
  if (rounded < 0) return `-${formatted}%`;
  return "0%";
}

function roundPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function clampBankroll(value: number) {
  if (!Number.isFinite(value)) return 0;
  return roundCurrency(Math.max(0, value));
}
