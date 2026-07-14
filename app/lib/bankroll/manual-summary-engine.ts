import {
  calculateDisciplineMetrics,
  calculateManualPerformanceByMarket,
  calculateManualPerformanceBySport,
  calculateManualStreaks,
} from "./manual-analytics-engine";
import { normalizeManualTracking } from "./manual-tracking-engine";
import type {
  BankrollConfig,
  ManualCycle,
  ManualMonthlySummary,
  ManualPickTimelineEvent,
  ManualSummaryBreakdown,
  ManualTrackedPick,
  ManualTrackingCollection,
  ManualWeeklySummary,
} from "./types";

const FINAL_MANUAL_STATUSES = new Set(["won", "lost", "push", "cancelled"]);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ManualHistorySummary = {
  activeCycle: ManualCycle | null;
  cycleHistory: ManualCycle[];
  weeklySummaries: ManualWeeklySummary[];
  monthlySummaries: ManualMonthlySummary[];
  timeline: ManualPickTimelineEvent[];
};

export function buildManualWeeklySummary(
  manualTracking: ManualTrackingCollection,
  cycle = getOrCreateManualCycle(manualTracking),
  createdAt = new Date().toISOString(),
): ManualWeeklySummary {
  const cyclePicks = getPicksInRange(manualTracking.picks, cycle.startDate, cycle.endDate);
  const completedPicks = cyclePicks.filter((pick) => FINAL_MANUAL_STATUSES.has(pick.status));
  const activePicks = cyclePicks.filter((pick) => !FINAL_MANUAL_STATUSES.has(pick.status));
  const wins = completedPicks.filter((pick) => pick.result === "won").length;
  const losses = completedPicks.filter((pick) => pick.result === "lost").length;
  const pushes = completedPicks.filter((pick) => pick.result === "push").length;
  const cancelled = completedPicks.filter((pick) => pick.result === "cancelled").length;
  const profit = roundSummary(completedPicks.reduce((sum, pick) => sum + pick.profit, 0));
  const finalBankroll = roundSummary(cycle.initialBankroll + profit);
  const gradedCount = wins + losses;
  const discipline = calculateDisciplineMetrics(cyclePicks);
  const streaks = calculateManualStreaks(completedPicks);
  const riskPicks = cyclePicks.filter((pick) => pick.riskAmount > 0);
  const averageRiskAmount = riskPicks.length > 0 ? roundSummary(riskPicks.reduce((sum, pick) => sum + pick.riskAmount, 0) / riskPicks.length) : 0;
  const averageRiskPercentage = riskPicks.length > 0 ? roundSummary(riskPicks.reduce((sum, pick) => sum + pick.riskPercentage, 0) / riskPicks.length) : 0;

  return {
    id: `manual-weekly-${cycle.cycleNumber}`,
    cycleNumber: cycle.cycleNumber,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    initialBankroll: roundSummary(cycle.initialBankroll),
    finalBankroll,
    profit,
    roi: cycle.initialBankroll > 0 ? roundSummary((profit / cycle.initialBankroll) * 100) : 0,
    wins,
    losses,
    pushes,
    cancelled,
    completedPicks: completedPicks.length,
    activePicks: activePicks.length,
    winRate: gradedCount > 0 ? roundSummary((wins / gradedCount) * 100) : 0,
    disciplineScore: discipline.score,
    averageRiskAmount,
    averageRiskPercentage,
    replacementCount: 0,
    longestWinningStreak: streaks.longestWinningStreak,
    longestLosingStreak: streaks.longestLosingStreak,
    sportsBreakdown: toSummaryBreakdown(calculateManualPerformanceBySport(cyclePicks, cycle.initialBankroll)),
    marketsBreakdown: toSummaryBreakdown(calculateManualPerformanceByMarket(cyclePicks, cycle.initialBankroll)),
    createdAt,
  };
}

export function buildManualMonthlySummary(weeklySummaries: ManualWeeklySummary[], createdAt = new Date().toISOString()): ManualMonthlySummary {
  if (weeklySummaries.length === 0) {
    throw new Error("Monthly summary requires at least one weekly summary.");
  }

  const sortedWeeks = [...weeklySummaries].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const firstWeek = sortedWeeks[0];
  const lastWeek = sortedWeeks.at(-1) ?? firstWeek;
  const monthDate = new Date(firstWeek.endDate);
  const wins = sumBy(sortedWeeks, "wins");
  const losses = sumBy(sortedWeeks, "losses");
  const pushes = sumBy(sortedWeeks, "pushes");
  const cancelled = sumBy(sortedWeeks, "cancelled");
  const completedPicks = sumBy(sortedWeeks, "completedPicks");
  const profit = roundSummary(sumBy(sortedWeeks, "profit"));
  const initialBankroll = roundSummary(firstWeek.initialBankroll);
  const finalBankroll = roundSummary(lastWeek.finalBankroll);
  const gradedCount = wins + losses;
  const bestWeek = sortedWeeks.reduce((best, week) => (week.roi > best.roi ? week : best), sortedWeeks[0]);
  const worstWeek = sortedWeeks.reduce((worst, week) => (week.roi < worst.roi ? week : worst), sortedWeeks[0]);

  return {
    id: `manual-monthly-${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`,
    month: monthDate.getUTCMonth() + 1,
    year: monthDate.getUTCFullYear(),
    startDate: firstWeek.startDate,
    endDate: lastWeek.endDate,
    weeklySummaryIds: sortedWeeks.map((week) => week.id),
    initialBankroll,
    finalBankroll,
    profit,
    roi: initialBankroll > 0 ? roundSummary((profit / initialBankroll) * 100) : 0,
    wins,
    losses,
    pushes,
    cancelled,
    completedPicks,
    winRate: gradedCount > 0 ? roundSummary((wins / gradedCount) * 100) : 0,
    disciplineScore: averageWeighted(sortedWeeks, "disciplineScore", "completedPicks"),
    averageRiskAmount: averageWeighted(sortedWeeks, "averageRiskAmount", "completedPicks"),
    averageRiskPercentage: averageWeighted(sortedWeeks, "averageRiskPercentage", "completedPicks"),
    bestWeek: {
      id: bestWeek.id,
      roi: bestWeek.roi,
    },
    worstWeek: {
      id: worstWeek.id,
      roi: worstWeek.roi,
    },
    longestWinningStreak: Math.max(...sortedWeeks.map((week) => week.longestWinningStreak), 0),
    longestLosingStreak: Math.max(...sortedWeeks.map((week) => week.longestLosingStreak), 0),
    sportsBreakdown: mergeBreakdowns(sortedWeeks.flatMap((week) => week.sportsBreakdown), initialBankroll),
    marketsBreakdown: mergeBreakdowns(sortedWeeks.flatMap((week) => week.marketsBreakdown), initialBankroll),
    createdAt,
  };
}

export function closeManualWeek(manualTracking: ManualTrackingCollection, closedAt = new Date().toISOString()): ManualTrackingCollection {
  const normalizedTracking = normalizeManualSummaryState(manualTracking, closedAt);
  const cycle = normalizedTracking.manualActiveCycle ?? getOrCreateManualCycle(normalizedTracking, closedAt);
  const summary = buildManualWeeklySummary(normalizedTracking, cycle, closedAt);
  const closedCycle: ManualCycle = {
    ...cycle,
    status: "closed",
    closedAt,
  };
  const nextCycle = createManualCycle(cycle.cycleNumber + 1, getNextCycleStart(closedAt), summary.finalBankroll);

  return normalizeManualTracking({
    ...normalizedTracking,
    updatedAt: closedAt,
    manualActiveCycle: nextCycle,
    manualCycleHistory: upsertById(normalizedTracking.manualCycleHistory, closedCycle),
    manualWeeklySummaries: upsertById(normalizedTracking.manualWeeklySummaries, summary),
    manualTimeline: appendManualTimelineEvent(normalizedTracking.manualTimeline, "weekly_summary_generated", "Weekly Summary Generated", closedAt),
  }, closedAt, normalizedTracking.manualFinancialState.currentBankroll);
}

export function closeManualMonth(manualTracking: ManualTrackingCollection, closedAt = new Date().toISOString()): ManualTrackingCollection {
  const normalizedTracking = normalizeManualSummaryState(manualTracking, closedAt);
  const existingMonthIds = new Set(normalizedTracking.manualMonthlySummaries.map((summary) => summary.id));
  const groupedWeeks = groupWeeklySummariesByMonth(normalizedTracking.manualWeeklySummaries);
  let monthlySummaries = normalizedTracking.manualMonthlySummaries;
  let timeline = normalizedTracking.manualTimeline;

  for (const weeks of groupedWeeks.values()) {
    const summary = buildManualMonthlySummary(weeks, closedAt);
    if (existingMonthIds.has(summary.id)) continue;
    monthlySummaries = [...monthlySummaries, summary];
    timeline = appendManualTimelineEvent(timeline, "monthly_summary_generated", "Monthly Summary Generated", closedAt);
  }

  return normalizeManualTracking({
    ...normalizedTracking,
    updatedAt: closedAt,
    manualMonthlySummaries: monthlySummaries.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()),
    manualTimeline: timeline,
  }, closedAt, normalizedTracking.manualFinancialState.currentBankroll);
}

export function loadManualSummaryHistory(manualTracking: ManualTrackingCollection | null | undefined, now = new Date().toISOString()): ManualHistorySummary {
  if (!manualTracking) {
    return {
      activeCycle: null,
      cycleHistory: [],
      weeklySummaries: [],
      monthlySummaries: [],
      timeline: [],
    };
  }

  const normalizedTracking = normalizeManualSummaryState(manualTracking, now);

  return {
    activeCycle: normalizedTracking.manualActiveCycle,
    cycleHistory: normalizedTracking.manualCycleHistory,
    weeklySummaries: [...normalizedTracking.manualWeeklySummaries].sort((a, b) => b.cycleNumber - a.cycleNumber),
    monthlySummaries: [...normalizedTracking.manualMonthlySummaries].sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()),
    timeline: normalizedTracking.manualTimeline,
  };
}

export function syncManualSummaries(config: BankrollConfig, now = new Date().toISOString()): BankrollConfig {
  let manualTracking = normalizeManualSummaryState(normalizeManualTracking(config.manualTracking, config.updatedAt, config.currentBankroll), now);
  let guard = 0;

  while (manualTracking.manualActiveCycle && new Date(manualTracking.manualActiveCycle.endDate).getTime() <= new Date(now).getTime() && guard < 12) {
    manualTracking = closeManualWeek(manualTracking, manualTracking.manualActiveCycle.endDate);
    guard += 1;
  }

  manualTracking = closeManualMonth(manualTracking, now);

  return {
    ...config,
    manualTracking,
  };
}

export function normalizeManualSummaryState(manualTracking: ManualTrackingCollection, now = new Date().toISOString()): ManualTrackingCollection {
  const normalizedTracking = normalizeManualTracking(manualTracking, now, manualTracking.manualFinancialState.currentBankroll);
  const manualWeeklySummaries = dedupeById(normalizedTracking.manualWeeklySummaries).filter(isValidManualWeeklySummary);
  const manualMonthlySummaries = dedupeById(normalizedTracking.manualMonthlySummaries).filter(isValidManualMonthlySummary);
  const manualCycleHistory = dedupeById(
    normalizedTracking.manualCycleHistory
      .map((cycle) => normalizeManualCycle(cycle, normalizedTracking.createdAt))
      .filter((cycle): cycle is ManualCycle => Boolean(cycle)),
  );
  const baseTracking = {
    ...normalizedTracking,
    manualCycleHistory,
    manualWeeklySummaries,
    manualMonthlySummaries,
  };
  const manualActiveCycle = normalizeManualCycle(baseTracking.manualActiveCycle, normalizedTracking.createdAt) ?? getOrCreateManualCycle(baseTracking, now);

  return {
    ...baseTracking,
    manualActiveCycle,
  };
}

function getOrCreateManualCycle(manualTracking: ManualTrackingCollection, now = new Date().toISOString()): ManualCycle {
  if (manualTracking.manualActiveCycle) return manualTracking.manualActiveCycle;

  const lastWeeklySummary = [...manualTracking.manualWeeklySummaries].sort((a, b) => b.cycleNumber - a.cycleNumber)[0];
  const cycleNumber = lastWeeklySummary ? lastWeeklySummary.cycleNumber + 1 : 1;
  const startDate = lastWeeklySummary ? getNextCycleStart(lastWeeklySummary.endDate) : manualTracking.createdAt ?? now;
  const initialBankroll = lastWeeklySummary?.finalBankroll ?? manualTracking.manualFinancialState.currentBankroll;

  return createManualCycle(cycleNumber, startDate, initialBankroll);
}

function createManualCycle(cycleNumber: number, startDate: string, initialBankroll: number): ManualCycle {
  const start = safeDate(startDate);
  const end = new Date(start.getTime() + WEEK_MS - 1);

  return {
    id: `manual-cycle-${cycleNumber}`,
    cycleNumber,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    status: "open",
    initialBankroll: roundSummary(initialBankroll),
    createdAt: start.toISOString(),
    closedAt: null,
  };
}

function getNextCycleStart(endDate: string) {
  return new Date(safeDate(endDate).getTime() + 1).toISOString();
}

function getPicksInRange(picks: ManualTrackedPick[], startDate: string, endDate: string) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  return picks.filter((pick) => {
    const activityDate = new Date(pick.completedAt ?? pick.updatedAt ?? pick.createdAt).getTime();
    return activityDate >= start && activityDate <= end;
  });
}

function normalizeManualCycle(cycle: ManualCycle | null | undefined, fallbackDate: string): ManualCycle | null {
  if (!cycle || typeof cycle !== "object") return null;
  const cycleNumber = Number(cycle.cycleNumber);
  const startDate = safeDate(cycle.startDate || fallbackDate).toISOString();
  const endDate = safeDate(cycle.endDate || new Date(safeDate(startDate).getTime() + WEEK_MS - 1).toISOString()).toISOString();

  return {
    id: typeof cycle.id === "string" && cycle.id ? cycle.id : `manual-cycle-${Number.isFinite(cycleNumber) && cycleNumber > 0 ? cycleNumber : 1}`,
    cycleNumber: Number.isFinite(cycleNumber) && cycleNumber > 0 ? cycleNumber : 1,
    startDate,
    endDate,
    status: cycle.status === "closed" ? "closed" : "open",
    initialBankroll: Number.isFinite(Number(cycle.initialBankroll)) ? roundSummary(Number(cycle.initialBankroll)) : 0,
    createdAt: safeDate(cycle.createdAt || startDate).toISOString(),
    closedAt: cycle.closedAt ? safeDate(cycle.closedAt).toISOString() : null,
  };
}

function isValidManualWeeklySummary(summary: ManualWeeklySummary) {
  return Boolean(summary?.id && Number.isFinite(summary.cycleNumber) && summary.startDate && summary.endDate);
}

function isValidManualMonthlySummary(summary: ManualMonthlySummary) {
  return Boolean(summary?.id && Number.isFinite(summary.month) && Number.isFinite(summary.year) && summary.startDate && summary.endDate);
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function safeDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function groupWeeklySummariesByMonth(weeklySummaries: ManualWeeklySummary[]) {
  const groups = new Map<string, ManualWeeklySummary[]>();

  for (const summary of weeklySummaries) {
    const date = new Date(summary.endDate);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    groups.set(key, [...(groups.get(key) ?? []), summary]);
  }

  return groups;
}

function appendManualTimelineEvent(timeline: ManualPickTimelineEvent[], type: string, message: string, createdAt: string) {
  const event: ManualPickTimelineEvent = {
    id: `${type}-${createdAt.replace(/\D/g, "")}`,
    type,
    message,
    description: message,
    createdAt,
  };

  if (timeline.some((item) => item.id === event.id)) return timeline;
  return [...timeline, event];
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  return [...items.filter((current) => current.id !== item.id), item];
}

function sumBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce((sum, item) => sum + Number(item[key] ?? 0), 0);
}

function averageWeighted<T extends Record<string, unknown>>(items: T[], valueKey: keyof T, weightKey: keyof T) {
  const totalWeight = items.reduce((sum, item) => sum + Number(item[weightKey] ?? 0), 0);
  if (totalWeight <= 0) return roundSummary(items.reduce((sum, item) => sum + Number(item[valueKey] ?? 0), 0) / items.length);
  return roundSummary(items.reduce((sum, item) => sum + Number(item[valueKey] ?? 0) * Number(item[weightKey] ?? 0), 0) / totalWeight);
}

function toSummaryBreakdown(groups: ManualSummaryBreakdown[]) {
  return groups.map((group) => ({ ...group }));
}

function mergeBreakdowns(groups: ManualSummaryBreakdown[], initialBankroll: number) {
  const grouped = new Map<string, ManualSummaryBreakdown[]>();

  for (const group of groups) {
    grouped.set(group.key, [...(grouped.get(group.key) ?? []), group]);
  }

  return Array.from(grouped.entries())
    .map(([key, entries]) => {
      const wins = sumBy(entries, "wins");
      const losses = sumBy(entries, "losses");
      const pushes = sumBy(entries, "pushes");
      const cancelled = sumBy(entries, "cancelled");
      const profit = roundSummary(sumBy(entries, "profit"));
      const gradedCount = wins + losses;

      return {
        key,
        label: entries[0]?.label ?? key,
        picks: sumBy(entries, "picks"),
        wins,
        losses,
        pushes,
        cancelled,
        winRate: gradedCount > 0 ? roundSummary((wins / gradedCount) * 100) : 0,
        profit,
        roi: initialBankroll > 0 ? roundSummary((profit / initialBankroll) * 100) : 0,
      };
    })
    .sort((a, b) => b.picks - a.picks || b.profit - a.profit || a.label.localeCompare(b.label));
}

function roundSummary(value: number) {
  return Math.round(value * 100) / 100;
}
