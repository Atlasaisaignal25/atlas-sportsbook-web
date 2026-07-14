import { calculateExposure, roundCurrency } from "./engine";
import type {
  BankrollConfig,
  ManualPickInput,
  ManualPickValidationResult,
  ManualTrackedPick,
  ManualTrackingCollection,
} from "./types";

const COMPLETED_MANUAL_STATUSES = new Set(["won", "lost", "push", "cancelled"]);

export function createManualTracking(now = new Date().toISOString()): ManualTrackingCollection {
  return {
    trackingId: "manual-tracking-v1",
    createdAt: now,
    updatedAt: now,
    picks: [],
    activePicks: [],
    completedPicks: [],
    stats: {
      totalPicks: 0,
      activeCount: 0,
      completedCount: 0,
    },
  };
}

export function normalizeManualTracking(
  collection: ManualTrackingCollection | null | undefined,
  now = new Date().toISOString(),
): ManualTrackingCollection {
  if (!isValidManualTrackingCollection(collection)) return createManualTracking(now);

  const picks = collection.picks.map(normalizeManualPick);
  const activePicks = getActiveManualPicks(picks);
  const completedPicks = getCompletedManualPicks(picks);

  return {
    trackingId: collection.trackingId,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt || now,
    picks,
    activePicks,
    completedPicks,
    stats: {
      totalPicks: picks.length,
      activeCount: activePicks.length,
      completedCount: completedPicks.length,
    },
  };
}

export function loadManualTracking(config: BankrollConfig) {
  return normalizeManualTracking(config.manualTracking, config.updatedAt);
}

export function saveManualTracking(config: BankrollConfig, manualTracking: ManualTrackingCollection): BankrollConfig {
  return {
    ...config,
    manualTracking: normalizeManualTracking(manualTracking),
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

  return normalizeManualTracking({
    ...collection,
    updatedAt: now,
    picks: [...collection.picks, pick],
  }, now);
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
  }, now);
}

export function deleteManualPick(collection: ManualTrackingCollection, pickId: string, now = new Date().toISOString()) {
  return normalizeManualTracking({
    ...collection,
    updatedAt: now,
    picks: collection.picks.filter((pick) => pick.id !== pickId),
  }, now);
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
