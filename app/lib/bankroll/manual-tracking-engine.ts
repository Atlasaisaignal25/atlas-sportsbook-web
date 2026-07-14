import { buildFinancialPlan, calculateExposure, calculateRecommendedUnit, roundCurrency } from "./engine";
import type {
  BankrollConfig,
  ManualFinancialState,
  ManualPickInput,
  ManualPickValidationResult,
  ManualTrackedPick,
  ManualTrackingCollection,
  ManualTrackingStats,
} from "./types";

const COMPLETED_MANUAL_STATUSES = new Set(["won", "lost", "push", "cancelled"]);

export function createManualTracking(now = new Date().toISOString(), initialBankroll = 0): ManualTrackingCollection {
  const manualFinancialState = createManualFinancialState(initialBankroll, now);
  const stats = calculateManualStats([], manualFinancialState);

  return {
    trackingId: "manual-tracking-v1",
    createdAt: now,
    updatedAt: now,
    picks: [],
    activePicks: [],
    completedPicks: [],
    stats,
    manualFinancialState,
    manualStats: stats,
    manualTimeline: [],
  };
}

export function normalizeManualTracking(
  collection: ManualTrackingCollection | null | undefined,
  now = new Date().toISOString(),
  atlasBankroll = 0,
): ManualTrackingCollection {
  if (!isValidManualTrackingCollection(collection)) return createManualTracking(now, atlasBankroll);

  const picks = collection.picks.map(normalizeManualPick);
  const activePicks = getActiveManualPicks(picks);
  const completedPicks = getCompletedManualPicks(picks);
  const manualFinancialState = normalizeManualFinancialState(collection.manualFinancialState, atlasBankroll, collection.createdAt, now);
  const stats = calculateManualStats(picks, manualFinancialState);

  return {
    trackingId: collection.trackingId,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt || now,
    picks,
    activePicks,
    completedPicks,
    stats,
    manualFinancialState,
    manualStats: stats,
    manualTimeline: Array.isArray(collection.manualTimeline) ? collection.manualTimeline : [],
  };
}

export function loadManualTracking(config: BankrollConfig) {
  return normalizeManualTracking(config.manualTracking, config.updatedAt, config.currentBankroll);
}

export function saveManualTracking(config: BankrollConfig, manualTracking: ManualTrackingCollection): BankrollConfig {
  return {
    ...config,
    manualTracking: normalizeManualTracking(manualTracking, new Date().toISOString(), config.currentBankroll),
    updatedAt: new Date().toISOString(),
  };
}

export function createManualPick(
  collection: ManualTrackingCollection,
  input: ManualPickInput,
  currentBankroll: number,
  now = new Date().toISOString(),
): ManualTrackingCollection {
  const validation = validateManualPick(input, currentBankroll);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const value = validation.value;
  const pick: ManualTrackedPick = {
    id: `manual-pick-${now.replace(/\D/g, "")}`,
    origin: "manual",
    sport: value.sport,
    league: value.league.trim(),
    eventId: value.eventId ?? null,
    homeTeam: value.homeTeam.trim(),
    awayTeam: value.awayTeam.trim(),
    eventDate: value.eventDate,
    eventTime: value.eventTime,
    market: value.market.trim(),
    selection: value.selection.trim(),
    odds: value.odds,
    riskAmount: value.riskAmount,
    riskPercentage: calculateRiskPercentage(value.riskAmount, currentBankroll),
    status: "pending",
    result: null,
    profit: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    notes: value.notes.trim(),
    source: "manual",
    timeline: [
      {
        id: `manual-pick-created-${now.replace(/\D/g, "")}`,
        type: "created",
        message: "Manual Pick Created",
        createdAt: now,
      },
    ],
  };

  const manualBankroll = collection.manualFinancialState.currentBankroll > 0 ? collection.manualFinancialState.currentBankroll : currentBankroll;

  const manualFinancialState =
    collection.picks.length === 0 &&
    collection.manualFinancialState.initialBankroll === 0 &&
    collection.manualFinancialState.currentBankroll === 0 &&
    currentBankroll > 0
      ? createManualFinancialState(currentBankroll, collection.createdAt)
      : collection.manualFinancialState;

  return normalizeManualTracking({
    ...collection,
    updatedAt: now,
    manualFinancialState,
    picks: [...collection.picks, pick],
  }, now, manualBankroll);
}

export function updateManualPick(
  collection: ManualTrackingCollection,
  pickId: string,
  updates: Partial<ManualTrackedPick>,
  now = new Date().toISOString(),
) {
  return normalizeManualTracking({
    ...collection,
    updatedAt: now,
    picks: collection.picks.map((pick) =>
      pick.id === pickId
        ? normalizeManualPick({ ...pick, ...updates, id: pick.id, origin: "manual", source: "manual", updatedAt: now })
        : pick,
    ),
  }, now, collection.manualFinancialState.currentBankroll);
}

export function deleteManualPick(collection: ManualTrackingCollection, pickId: string, now = new Date().toISOString()) {
  return normalizeManualTracking({
    ...collection,
    updatedAt: now,
    picks: collection.picks.filter((pick) => pick.id !== pickId),
  }, now, collection.manualFinancialState.currentBankroll);
}

export function validateManualPick(input: ManualPickInput, currentBankroll: number): ManualPickValidationResult {
  if (!input.sport) return { valid: false, error: "Select a sport." };
  if (!input.market.trim()) return { valid: false, error: "Enter a market." };
  if (!input.selection.trim()) return { valid: false, error: "Enter a selection." };
  if (input.notes.length > 500) return { valid: false, error: "Notes must be 500 characters or fewer." };

  const odds = parseOdds(input.odds);
  if (odds === null) return { valid: false, error: "Enter valid odds." };

  const riskAmount = parseCurrencyInput(input.riskAmount);
  if (riskAmount === null || riskAmount <= 0) return { valid: false, error: "Enter a valid risk amount." };
  if (currentBankroll < 0) return { valid: false, error: "Current bankroll is invalid." };
  if (riskAmount > currentBankroll) return { valid: false, error: "Risk amount cannot exceed current bankroll." };

  return {
    valid: true,
    value: {
      sport: input.sport,
      league: input.league,
      eventId: input.eventId ?? null,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      eventDate: input.eventDate,
      eventTime: input.eventTime,
      market: input.market,
      selection: input.selection,
      odds,
      riskAmount,
      notes: input.notes,
    },
  };
}

export function calculateRiskPercentage(riskAmount: number, currentBankroll: number) {
  return calculateExposure(riskAmount, currentBankroll, "atlas_recommended").value;
}

export function createManualFinancialState(initialBankroll: number, now = new Date().toISOString()): ManualFinancialState {
  const safeBankroll = roundCurrency(Math.max(0, initialBankroll));

  return {
    initialBankroll: safeBankroll,
    currentBankroll: safeBankroll,
    recommendedUnit: calculateRecommendedUnit(safeBankroll, "atlas_recommended"),
    profit: 0,
    roi: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeManualFinancialState(
  state: ManualFinancialState | undefined,
  atlasBankroll: number,
  createdAt: string,
  now = new Date().toISOString(),
): ManualFinancialState {
  if (!state) return createManualFinancialState(atlasBankroll, createdAt || now);

  const financialPlan = buildFinancialPlan({
    initialBankroll: state.initialBankroll,
    currentBankroll: state.currentBankroll,
    recommendedUnit: state.recommendedUnit,
    profile: "atlas_recommended",
    createdAt: state.createdAt,
    updatedAt: state.updatedAt || now,
  });

  return {
    initialBankroll: financialPlan.state.initialBankroll,
    currentBankroll: financialPlan.metrics.currentBankroll,
    recommendedUnit: financialPlan.metrics.recommendedUnit,
    profit: financialPlan.metrics.profit,
    roi: financialPlan.metrics.roi.value,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt || now,
  };
}

export function calculateManualStats(picks: ManualTrackedPick[], financialState: ManualFinancialState): ManualTrackingStats {
  const activePicks = getActiveManualPicks(picks);
  const completedPicks = getCompletedManualPicks(picks);
  const wins = completedPicks.filter((pick) => pick.result === "won").length;
  const losses = completedPicks.filter((pick) => pick.result === "lost").length;
  const pushes = completedPicks.filter((pick) => pick.result === "push").length;
  const cancelled = completedPicks.filter((pick) => pick.result === "cancelled").length;
  const streaks = calculateManualStreaks(completedPicks);
  const graded = wins + losses;

  return {
    currentBankroll: financialState.currentBankroll,
    initialBankroll: financialState.initialBankroll,
    profit: financialState.profit,
    roi: financialState.roi,
    winRate: graded > 0 ? Math.round((wins / graded) * 10000) / 100 : 0,
    wins,
    losses,
    pushes,
    cancelled,
    currentStreak: streaks.currentStreak,
    currentStreakType: streaks.currentStreakType,
    longestWinningStreak: streaks.longestWinningStreak,
    longestLosingStreak: streaks.longestLosingStreak,
    completedPicks: completedPicks.length,
    activePicks: activePicks.length,
    totalPicks: picks.length,
    activeCount: activePicks.length,
    completedCount: completedPicks.length,
  };
}

export function getActiveManualPicks(picks: ManualTrackedPick[]) {
  return picks.filter((pick) => !COMPLETED_MANUAL_STATUSES.has(pick.status));
}

export function getCompletedManualPicks(picks: ManualTrackedPick[]) {
  return picks.filter((pick) => COMPLETED_MANUAL_STATUSES.has(pick.status));
}

export function isValidManualTrackingCollection(value: unknown): value is ManualTrackingCollection {
  if (!value || typeof value !== "object") return false;

  const collection = value as Partial<ManualTrackingCollection>;

  return (
    typeof collection.trackingId === "string" &&
    typeof collection.createdAt === "string" &&
    typeof collection.updatedAt === "string" &&
    Array.isArray(collection.picks)
  );
}

function normalizeManualPick(pick: ManualTrackedPick): ManualTrackedPick {
  return {
    ...pick,
    origin: "manual",
    source: "manual",
    eventDate: pick.eventDate ?? "",
    eventTime: pick.eventTime ?? "",
    timeline: Array.isArray(pick.timeline) ? pick.timeline : [],
  };
}

function calculateManualStreaks(picks: ManualTrackedPick[]) {
  const gradedPicks = [...picks]
    .filter((pick) => pick.result === "won" || pick.result === "lost")
    .sort((a, b) => new Date(a.completedAt ?? a.updatedAt).getTime() - new Date(b.completedAt ?? b.updatedAt).getTime());
  let currentWin = 0;
  let currentLoss = 0;
  let longestWinningStreak = 0;
  let longestLosingStreak = 0;

  for (const pick of gradedPicks) {
    if (pick.result === "won") {
      currentWin += 1;
      currentLoss = 0;
      longestWinningStreak = Math.max(longestWinningStreak, currentWin);
    } else {
      currentLoss += 1;
      currentWin = 0;
      longestLosingStreak = Math.max(longestLosingStreak, currentLoss);
    }
  }

  const latest = gradedPicks.at(-1);
  const currentStreakType = latest?.result === "won" || latest?.result === "lost" ? latest.result : null;

  return {
    currentStreak: currentStreakType === "won" ? currentWin : currentStreakType === "lost" ? currentLoss : 0,
    currentStreakType,
    longestWinningStreak,
    longestLosingStreak,
  };
}

function parseCurrencyInput(input: string) {
  const normalized = input.trim().replace(/^\$/, "").replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return roundCurrency(value);
}

function parseOdds(input: string) {
  const normalized = input.trim();
  if (!normalized) return null;
  if (/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
    const value = Number(normalized);
    if (!Number.isFinite(value) || value === 0) return null;
    return value;
  }
  return null;
}
