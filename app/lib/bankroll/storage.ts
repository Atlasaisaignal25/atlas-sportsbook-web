import { BANKROLL_CONFIG_STORAGE_KEY } from "./constants";
import { isValidStoredConfig } from "./utils";
import type { BankrollConfig } from "./types";
import { syncPlanWithFinancialEngine } from "./atlas-plan";
import { calculateFinancialMetrics, calculateRecommendedUnit, calculateCurrentBankroll, roundCurrency } from "./engine";
import { syncManualSummaries } from "./manual-summary-engine";
import { normalizeManualTracking } from "./manual-tracking-engine";
import { normalizeMonthlyState } from "./monthly-summary-engine";
import { normalizeMembershipContext, syncPlans } from "./package-engine";
import { normalizeSnapshot } from "./snapshot-engine";
import { normalizeWeeklyState } from "./weekly-summary-engine";

export function loadBankrollConfig(): BankrollConfig | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(BANKROLL_CONFIG_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isValidStoredConfig(parsed)) return null;

    const normalizedConfig = normalizeBankrollConfig(parsed);
    const normalizedRaw = JSON.stringify(normalizedConfig);
    if (normalizedRaw !== raw) {
      window.localStorage.setItem(BANKROLL_CONFIG_STORAGE_KEY, normalizedRaw);
    }

    return normalizedConfig;
  } catch {
    return null;
  }
}

export function saveBankrollConfig(config: BankrollConfig) {
  if (typeof window === "undefined") return;

  try {
    const normalizedRaw = JSON.stringify(normalizeBankrollConfig(config));
    if (window.localStorage.getItem(BANKROLL_CONFIG_STORAGE_KEY) === normalizedRaw) return;
    window.localStorage.setItem(BANKROLL_CONFIG_STORAGE_KEY, normalizedRaw);
  } catch {
    // Bankroll remains usable for the current session if local storage is unavailable.
  }
}

export function normalizeBankrollConfig(config: BankrollConfig, now = new Date().toISOString()): BankrollConfig {
  const currentBankroll = calculateCurrentBankroll(config.currentBankroll);
  const membership = normalizeMembershipContext(config.membership);
  const lastGlobalSnapshot = normalizeSnapshot(config.lastGlobalSnapshot);
  const lastAtlasSnapshot = normalizeSnapshot(config.lastAtlasSnapshot) ?? lastGlobalSnapshot;
  const normalizedBase = {
    ...config,
    membership,
    lastGlobalSnapshot,
    lastAtlasSnapshot,
    lastSnapshotDate: lastAtlasSnapshot?.snapshotDate ?? config.lastSnapshotDate ?? null,
    demoModeEnabled: Boolean(config.demoModeEnabled && lastAtlasSnapshot),
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

  const syncedLegacyPlan = normalizedBase.atlasPlan ? syncPlanWithFinancialEngine(normalizedBase.atlasPlan, metrics, normalizedBase.updatedAt) : undefined;

  return syncManualSummaries(normalizeMonthlyState(normalizeWeeklyState({
    ...normalizedBase,
    atlasPlanCollection,
    atlasPlan: atlasPlanCollection.primaryPlan ?? syncedLegacyPlan,
    manualTracking: normalizeManualTracking(normalizedBase.manualTracking, normalizedBase.updatedAt, currentBankroll),
  })), now);
}

export function clearBankrollConfig() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(BANKROLL_CONFIG_STORAGE_KEY);
  } catch {
    // Reset still clears in-memory state if local storage is unavailable.
  }
}
