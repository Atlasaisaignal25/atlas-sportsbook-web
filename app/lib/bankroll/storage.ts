import { BANKROLL_CONFIG_STORAGE_KEY } from "./constants";
import { isValidStoredConfig } from "./utils";
import type { BankrollConfig } from "./types";
import { calculateRecommendedUnit, calculateCurrentBankroll, roundCurrency } from "./engine";

export function loadBankrollConfig(): BankrollConfig | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(BANKROLL_CONFIG_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isValidStoredConfig(parsed) ? normalizeBankrollConfig(parsed) : null;
  } catch {
    return null;
  }
}

export function saveBankrollConfig(config: BankrollConfig) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(BANKROLL_CONFIG_STORAGE_KEY, JSON.stringify(normalizeBankrollConfig(config)));
  } catch {
    // Bankroll remains usable for the current session if local storage is unavailable.
  }
}

export function normalizeBankrollConfig(config: BankrollConfig): BankrollConfig {
  const currentBankroll = calculateCurrentBankroll(config.currentBankroll);

  return {
    ...config,
    initialBankroll: roundCurrency(Math.max(0, config.initialBankroll)),
    currentBankroll,
    recommendedUnit: calculateRecommendedUnit(currentBankroll, config.profile),
  };
}

export function clearBankrollConfig() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(BANKROLL_CONFIG_STORAGE_KEY);
  } catch {
    // Reset still clears in-memory state if local storage is unavailable.
  }
}
