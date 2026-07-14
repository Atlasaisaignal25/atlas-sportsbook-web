import { BANKROLL_CONFIG_STORAGE_KEY } from "./constants";
import { isValidStoredConfig } from "./utils";
import type { BankrollConfig } from "./types";
import { calculateFinancialMetrics, calculateRecommendedUnit, calculateCurrentBankroll, roundCurrency } from "./engine";
import { normalizeMembershipContext, syncPlans } from "./package-engine";

export function loadBankrollConfig(): BankrollConfig | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(BANKROLL_CONFIG_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isValidStoredConfig(parsed)) return null;

    const normalizedConfig = normalizeBankrollConfig(parsed);
    window.localStorage.setItem(BANKROLL_CONFIG_STORAGE_KEY, JSON.stringify(normalizedConfig));

    return normalizedConfig;
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
  const membership = normalizeMembershipContext(config.membership);
  const normalizedBase = {
    ...config,
    membership,
    initialBankroll: roundCurrency(Math.max(0, config.initialBankroll)),
    currentBankroll,
    recommendedUnit: calculateRecommendedUnit(currentBankroll, config.profile),
  };
  const metrics = calculateFinancialMetrics({
    initialBankroll: normalizedBase.initialBankroll,
    currentBankroll: normalizedBase.currentBankroll,
    profile: normalizedBase.profile,
    currentCycle: "Day 4 / 7",
    planStatus: "active",
    createdAt: normalizedBase.createdAt,
    updatedAt: normalizedBase.updatedAt,
  });

  const atlasPlanCollection = syncPlans(normalizedBase.atlasPlanCollection, membership, metrics);

  return {
    ...normalizedBase,
    atlasPlanCollection,
    atlasPlan: atlasPlanCollection.primaryPlan ?? undefined,
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
