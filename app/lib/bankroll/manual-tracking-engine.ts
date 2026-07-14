import type { BankrollConfig, ManualTrackedPick, ManualTrackingCollection } from "./types";

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
    timeline: Array.isArray(pick.timeline) ? pick.timeline : [],
  };
}
