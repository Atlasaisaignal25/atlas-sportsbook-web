import { BANKROLL_CONFIG_STORAGE_KEY } from "./constants";
import { isValidStoredConfig } from "./utils";
import type { BankrollConfig } from "./types";

export function loadBankrollConfig(): BankrollConfig | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(BANKROLL_CONFIG_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isValidStoredConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBankrollConfig(config: BankrollConfig) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(BANKROLL_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Bankroll remains usable for the current session if local storage is unavailable.
  }
}

export function clearBankrollConfig() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(BANKROLL_CONFIG_STORAGE_KEY);
  } catch {
    // Reset still clears in-memory state if local storage is unavailable.
  }
}
