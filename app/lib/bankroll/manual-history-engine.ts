import type { ManualPickTimelineEvent, ManualTrackedPick, ManualTrackingCollection } from "./types";

export type TrackingRange = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "all_time" | "calendar";

export type TrackingHistoryEvent = {
  id: string;
  type: string;
  time: string;
  description: string;
  status: ManualPickTimelineEvent["status"];
};

export type TrackingHistoryPick = {
  pick: ManualTrackedPick;
  timeline: TrackingHistoryEvent[];
};

export type TrackingHistoryGroup = {
  key: string;
  label: string;
  picks: TrackingHistoryPick[];
};

export type TrackingHistoryView = {
  range: TrackingRange;
  selectedDate: string;
  groups: TrackingHistoryGroup[];
  picks: TrackingHistoryPick[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TECHNICAL_EVENT_TYPES = new Set(["linked_pick_invalid", "legacy_unlinked", "linked_atlas_pick_data_resynced"]);

export function loadTrackingHistory(
  manualTracking: ManualTrackingCollection | null | undefined,
  range: TrackingRange = "today",
  selectedDate = toDateKey(new Date()),
  now = new Date(),
): TrackingHistoryView {
  const picks = [...(manualTracking?.picks ?? [])].sort(sortPicksDesc).map((pick) => ({
    pick,
    timeline: buildTimeline(pick),
  }));
  const filteredPicks = filterPicksByRange(picks, range, selectedDate, now);

  return {
    range,
    selectedDate,
    groups: groupByDate(filteredPicks, now),
    picks: filteredPicks,
  };
}

export function getTrackingDay(manualTracking: ManualTrackingCollection | null | undefined, dateKey: string, now = new Date()) {
  return loadTrackingHistory(manualTracking, "calendar", dateKey, now);
}

export function groupByDate(picks: TrackingHistoryPick[], now = new Date()): TrackingHistoryGroup[] {
  const groups = new Map<string, TrackingHistoryPick[]>();

  for (const item of picks) {
    const key = getPickDateKey(item.pick);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupPicks]) => ({
      key,
      label: formatGroupLabel(key, now),
      picks: groupPicks.sort((a, b) => sortPicksDesc(a.pick, b.pick)),
    }));
}

export function groupByWeek(picks: TrackingHistoryPick[], now = new Date()) {
  const start = startOfWeek(now);
  const end = addDays(start, 7);
  return picks.filter((item) => isDateWithin(getPickDate(item.pick), start, end));
}

export function groupByMonth(picks: TrackingHistoryPick[], now = new Date()) {
  return picks.filter((item) => {
    const date = getPickDate(item.pick);
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  });
}

export function buildTimeline(pick: ManualTrackedPick): TrackingHistoryEvent[] {
  return [...(pick.timeline ?? [])]
    .filter((event) => !TECHNICAL_EVENT_TYPES.has(event.type))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((event) => ({
      id: event.id,
      type: event.type,
      time: event.createdAt,
      description: formatTimelineDescription(event),
      status: event.status,
    }));
}

function filterPicksByRange(picks: TrackingHistoryPick[], range: TrackingRange, selectedDate: string, now: Date) {
  if (range === "today") {
    return picks.filter((item) => getPickDateKey(item.pick) === toDateKey(now));
  }

  if (range === "yesterday") {
    return picks.filter((item) => getPickDateKey(item.pick) === toDateKey(addDays(now, -1)));
  }

  if (range === "this_week") {
    return groupByWeek(picks, now);
  }

  if (range === "last_week") {
    const end = startOfWeek(now);
    const start = addDays(end, -7);
    return picks.filter((item) => isDateWithin(getPickDate(item.pick), start, end));
  }

  if (range === "this_month") {
    return groupByMonth(picks, now);
  }

  if (range === "all_time") {
    return picks;
  }

  return picks.filter((item) => getPickDateKey(item.pick) === selectedDate);
}

function sortPicksDesc(a: ManualTrackedPick, b: ManualTrackedPick) {
  return getPickTimestamp(b) - getPickTimestamp(a);
}

function getPickTimestamp(pick: ManualTrackedPick) {
  return getPickDate(pick).getTime();
}

function getPickDate(pick: ManualTrackedPick) {
  return new Date(pick.createdAt || pick.eventDate || pick.updatedAt);
}

function getPickDateKey(pick: ManualTrackedPick) {
  return toDateKey(getPickDate(pick));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setHours(0, 0, 0, 0);
  return addDays(copy, diff);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isDateWithin(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() < end.getTime();
}

function formatGroupLabel(dateKey: string, now: Date) {
  if (dateKey === toDateKey(now)) return "TODAY";
  if (dateKey === toDateKey(addDays(now, -1))) return "YESTERDAY";

  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const diffDays = Math.floor((new Date(`${toDateKey(now)}T00:00:00.000Z`).getTime() - date.getTime()) / DAY_MS);
  if (diffDays > 1 && diffDays <= 7) return "LAST WEEK";

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

function formatTimelineDescription(event: ManualPickTimelineEvent) {
  if (event.type === "manual_pick_created" || event.message === "Manual Pick Created") return "Manual Pick Created";
  if (event.type === "tracking_started" || event.message === "Tracking Started") return "Tracking Started";
  if (event.type === "event_started" || event.message === "Event Started") return "Game Started";
  if (event.type === "result_synced_from_atlas" || event.message === "Result Synced from Atlas") return "Result Synced";
  if (event.type === "manual_bankroll_updated" || event.message === "Manual Bankroll Updated") return "Manual Bankroll Updated";
  if (event.message?.startsWith("Included in Weekly")) return "Included in Weekly Summary";
  if (event.message?.startsWith("Included in Monthly")) return "Included in Monthly Summary";
  return event.description || event.message || "Tracking Event";
}
