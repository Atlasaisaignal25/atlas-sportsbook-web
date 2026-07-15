import type { TrackingRange } from "./manual-history-engine";

export type BankrollUITab = "atlas" | "manual";

export type BankrollUIState = {
  activeBankrollTab: BankrollUITab;
  trackingRange: TrackingRange;
  calendarDate: string;
  selectedTrackingPickId: string | null;
  timelineOpen: boolean;
  selectedHistoryPeriod: TrackingRange;
  selectedHistoryDate: string;
};

const BANKROLL_UI_STORAGE_KEY = "atlas-bankroll-ui-v1";

export const defaultBankrollUIState: BankrollUIState = {
  activeBankrollTab: "atlas",
  trackingRange: "today",
  calendarDate: new Date().toISOString().slice(0, 10),
  selectedTrackingPickId: null,
  timelineOpen: false,
  selectedHistoryPeriod: "today",
  selectedHistoryDate: new Date().toISOString().slice(0, 10),
};

export function loadBankrollUIState(): BankrollUIState {
  if (typeof window === "undefined") return defaultBankrollUIState;

  try {
    const raw = window.localStorage.getItem(BANKROLL_UI_STORAGE_KEY);
    if (!raw) return defaultBankrollUIState;

    return normalizeBankrollUIState(JSON.parse(raw));
  } catch {
    return defaultBankrollUIState;
  }
}

export function saveBankrollUIState(state: BankrollUIState) {
  if (typeof window === "undefined") return;

  try {
    const normalizedState = normalizeBankrollUIState(state);
    const nextRaw = JSON.stringify(normalizedState);
    if (window.localStorage.getItem(BANKROLL_UI_STORAGE_KEY) === nextRaw) return;
    window.localStorage.setItem(BANKROLL_UI_STORAGE_KEY, nextRaw);
  } catch {
    // UI state is a convenience layer; the app remains usable without it.
  }
}

export function updateBankrollUIState(updates: Partial<BankrollUIState>) {
  const nextState = normalizeBankrollUIState({ ...loadBankrollUIState(), ...updates });
  saveBankrollUIState(nextState);
  return nextState;
}

export function resetBankrollUIState() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(BANKROLL_UI_STORAGE_KEY);
  } catch {
    // Reset remains best-effort.
  }
}

function normalizeBankrollUIState(value: unknown): BankrollUIState {
  const state = value && typeof value === "object" ? value as Partial<BankrollUIState> : {};
  const trackingRange = normalizeTrackingRange(state.trackingRange);
  const calendarDate = normalizeDateKey(state.calendarDate) ?? defaultBankrollUIState.calendarDate;
  const selectedHistoryPeriod = normalizeTrackingRange(state.selectedHistoryPeriod ?? trackingRange);
  const selectedHistoryDate = normalizeDateKey(state.selectedHistoryDate) ?? calendarDate;
  const selectedTrackingPickId = typeof state.selectedTrackingPickId === "string" && state.selectedTrackingPickId.trim()
    ? state.selectedTrackingPickId
    : null;

  return {
    activeBankrollTab: state.activeBankrollTab === "manual" ? "manual" : "atlas",
    trackingRange,
    calendarDate,
    selectedTrackingPickId,
    timelineOpen: Boolean(state.timelineOpen && selectedTrackingPickId),
    selectedHistoryPeriod,
    selectedHistoryDate,
  };
}

function normalizeTrackingRange(value: unknown): TrackingRange {
  if (
    value === "today" ||
    value === "yesterday" ||
    value === "this_week" ||
    value === "last_week" ||
    value === "this_month" ||
    value === "all_time" ||
    value === "calendar"
  ) {
    return value;
  }

  return "today";
}

function normalizeDateKey(value: unknown) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}
