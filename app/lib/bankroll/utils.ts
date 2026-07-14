import {
  ATLAS_RECOMMENDED_PERCENTAGE,
  HIGHER_EXPOSURE_PERCENTAGE,
} from "./constants";
import type { BankrollConfig, BankrollProfile, BankrollValidationResult } from "./types";

export function getBankrollProfilePercentage(profile: BankrollProfile) {
  return profile === "higher_exposure" ? HIGHER_EXPOSURE_PERCENTAGE : ATLAS_RECOMMENDED_PERCENTAGE;
}

export function calculateRecommendedUnit(currentBankroll: number, profile: BankrollProfile) {
  return roundCurrency(currentBankroll * getBankrollProfilePercentage(profile));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export function parseBankrollInput(input: string) {
  const normalized = input.trim().replace(/^\$/, "").replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  return roundCurrency(value);
}

export function validateBankroll(input: string): BankrollValidationResult {
  const value = parseBankrollInput(input);

  if (value === null || value <= 0) {
    return { valid: false, error: "Enter a valid bankroll." };
  }

  return { valid: true, value };
}

export function isValidStoredConfig(value: unknown): value is BankrollConfig {
  if (!value || typeof value !== "object") return false;

  const config = value as Partial<BankrollConfig>;
  const profileValid = config.profile === "atlas_recommended" || config.profile === "higher_exposure";

  return (
    profileValid &&
    isPositiveCurrency(config.initialBankroll) &&
    isPositiveCurrency(config.currentBankroll) &&
    isPositiveCurrency(config.recommendedUnit) &&
    typeof config.createdAt === "string" &&
    typeof config.updatedAt === "string"
  );
}

export function createBankrollConfig(initialBankroll: number, profile: BankrollProfile): BankrollConfig {
  const now = new Date().toISOString();

  return {
    initialBankroll: roundCurrency(initialBankroll),
    currentBankroll: roundCurrency(initialBankroll),
    recommendedUnit: calculateRecommendedUnit(initialBankroll, profile),
    profile,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateBankrollConfig(config: BankrollConfig, initialBankroll: number, profile: BankrollProfile): BankrollConfig {
  return {
    ...config,
    initialBankroll: roundCurrency(initialBankroll),
    currentBankroll: roundCurrency(initialBankroll),
    recommendedUnit: calculateRecommendedUnit(initialBankroll, profile),
    profile,
    updatedAt: new Date().toISOString(),
  };
}

function isPositiveCurrency(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
