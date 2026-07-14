import { ATLAS_RECOMMENDED_PERCENTAGE, HIGHER_EXPOSURE_PERCENTAGE } from "./constants";
import { loadTrackingHistory, type TrackingRange } from "./manual-history-engine";
import type { BankrollProfile, ManualTrackedPick, ManualTrackingCollection } from "./types";

export type ManualPerformanceGroup = {
  key: string;
  label: string;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  cancelled: number;
  winRate: number;
  profit: number;
  roi: number;
};

export type ManualDisciplineLabel = "Excellent Discipline" | "Good Discipline" | "Needs Consistency" | "High Variability";

export type ManualTrackingAnalytics = {
  period: TrackingRange;
  selectedDate: string;
  initialBankroll: number;
  currentBankroll: number;
  profit: number;
  roi: number;
  wins: number;
  losses: number;
  pushes: number;
  cancelled: number;
  winRate: number;
  activePicks: number;
  completedPicks: number;
  totalPicks: number;
  currentStreak: number;
  currentStreakType: "won" | "lost" | null;
  longestWinningStreak: number;
  longestLosingStreak: number;
  averageRiskAmount: number;
  averageRiskPercentage: number;
  highestRiskPercentage: number;
  lowestRiskPercentage: number;
  withinPlanCount: number;
  abovePlanCount: number;
  disciplineScore: number;
  disciplineLabel: ManualDisciplineLabel;
  performanceBySport: ManualPerformanceGroup[];
  performanceByMarket: ManualPerformanceGroup[];
  hasPicks: boolean;
  hasCompletedResults: boolean;
  generatedAt: string;
};

const FINAL_STATUSES = new Set(["won", "lost", "push", "cancelled"]);

export function buildManualAnalytics(
  manualTracking: ManualTrackingCollection | null | undefined,
  period: TrackingRange = "all_time",
  selectedDate = new Date().toISOString().slice(0, 10),
  profile: BankrollProfile = "atlas_recommended",
  now = new Date(),
): ManualTrackingAnalytics {
  const filteredPicks = filterManualPicksByPeriod(manualTracking, period, selectedDate, now);
  const financialState = manualTracking?.manualFinancialState;
  const initialBankroll = financialState?.initialBankroll ?? 0;
  const completedPicks = filteredPicks.filter((pick) => FINAL_STATUSES.has(pick.status));
  const gradedPicks = completedPicks.filter((pick) => pick.result === "won" || pick.result === "lost");
  const wins = gradedPicks.filter((pick) => pick.result === "won").length;
  const losses = gradedPicks.filter((pick) => pick.result === "lost").length;
  const pushes = completedPicks.filter((pick) => pick.result === "push").length;
  const cancelled = completedPicks.filter((pick) => pick.result === "cancelled").length;
  const periodProfit = roundMetric(completedPicks.reduce((sum, pick) => sum + pick.profit, 0));
  const useStoredTotals = period === "all_time";
  const profit = useStoredTotals ? financialState?.profit ?? periodProfit : periodProfit;
  const currentBankroll = useStoredTotals ? financialState?.currentBankroll ?? initialBankroll + profit : initialBankroll + profit;
  const exposure = calculateExposureMetrics(filteredPicks, profile);
  const streaks = calculateManualStreaks(completedPicks);
  const disciplineScore = calculateDisciplineMetrics(filteredPicks, profile).score;

  return {
    period,
    selectedDate,
    initialBankroll,
    currentBankroll: roundMetric(currentBankroll),
    profit: roundMetric(profit),
    roi: initialBankroll > 0 ? roundMetric((profit / initialBankroll) * 100) : 0,
    wins,
    losses,
    pushes,
    cancelled,
    winRate: wins + losses > 0 ? roundMetric((wins / (wins + losses)) * 100) : 0,
    activePicks: filteredPicks.filter((pick) => !FINAL_STATUSES.has(pick.status)).length,
    completedPicks: completedPicks.length,
    totalPicks: filteredPicks.length,
    currentStreak: streaks.currentStreak,
    currentStreakType: streaks.currentStreakType,
    longestWinningStreak: streaks.longestWinningStreak,
    longestLosingStreak: streaks.longestLosingStreak,
    averageRiskAmount: exposure.averageRiskAmount,
    averageRiskPercentage: exposure.averageRiskPercentage,
    highestRiskPercentage: exposure.highestRiskPercentage,
    lowestRiskPercentage: exposure.lowestRiskPercentage,
    withinPlanCount: exposure.withinPlanCount,
    abovePlanCount: exposure.abovePlanCount,
    disciplineScore,
    disciplineLabel: getManualDisciplineLabel(disciplineScore),
    performanceBySport: calculateManualPerformanceBySport(filteredPicks, initialBankroll),
    performanceByMarket: calculateManualPerformanceByMarket(filteredPicks, initialBankroll),
    hasPicks: filteredPicks.length > 0,
    hasCompletedResults: completedPicks.length > 0,
    generatedAt: now.toISOString(),
  };
}

export function getManualAnalyticsSummary(analytics: ManualTrackingAnalytics) {
  return {
    currentBankroll: analytics.currentBankroll,
    profit: analytics.profit,
    roi: analytics.roi,
    winRate: analytics.winRate,
  };
}

export function filterManualPicksByPeriod(
  manualTracking: ManualTrackingCollection | null | undefined,
  period: TrackingRange,
  selectedDate: string,
  now = new Date(),
) {
  return loadTrackingHistory(manualTracking, period, selectedDate, now).picks.map((item) => item.pick);
}

export function calculateManualPerformanceBySport(picks: ManualTrackedPick[], initialBankroll = 0) {
  return buildPerformanceGroups(picks, (pick) => pick.sport ?? "Unknown", initialBankroll);
}

export function calculateManualPerformanceByMarket(picks: ManualTrackedPick[], initialBankroll = 0) {
  return buildPerformanceGroups(picks, (pick) => pick.market || "Unknown", initialBankroll);
}

export function calculateAverageExposure(picks: ManualTrackedPick[]) {
  return calculateExposureMetrics(picks, "atlas_recommended").averageRiskPercentage;
}

export function calculateDisciplineMetrics(picks: ManualTrackedPick[], profile: BankrollProfile = "atlas_recommended") {
  const exposureLimit = getProfileExposureLimit(profile);
  let score = 100;

  for (const pick of picks) {
    if (pick.riskAmount <= 0 || pick.riskPercentage <= 0) score -= 10;
    if (pick.riskPercentage > exposureLimit) score -= 6;
    if (pick.trackingState === "legacy_unlinked") score -= 12;
    if (pick.trackingState === "linked_pick_invalid") score -= 12;
    if (!pick.linkedAtlasPickId) score -= 8;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    label: getManualDisciplineLabel(Math.max(0, Math.min(100, Math.round(score)))),
  };
}

export function calculateManualStreaks(completedPicks: ManualTrackedPick[]) {
  const graded = [...completedPicks]
    .filter((pick) => pick.result === "won" || pick.result === "lost")
    .sort((a, b) => new Date(a.completedAt ?? a.updatedAt).getTime() - new Date(b.completedAt ?? b.updatedAt).getTime());
  let currentWin = 0;
  let currentLoss = 0;
  let longestWinningStreak = 0;
  let longestLosingStreak = 0;

  for (const pick of graded) {
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

  const latest = graded.at(-1);
  const currentStreakType = latest?.result === "won" || latest?.result === "lost" ? latest.result : null;

  return {
    currentStreak: currentStreakType === "won" ? currentWin : currentStreakType === "lost" ? currentLoss : 0,
    currentStreakType,
    longestWinningStreak,
    longestLosingStreak,
  };
}

function buildPerformanceGroups(picks: ManualTrackedPick[], keySelector: (pick: ManualTrackedPick) => string, initialBankroll: number): ManualPerformanceGroup[] {
  const groups = new Map<string, ManualTrackedPick[]>();

  for (const pick of picks) {
    const key = keySelector(pick);
    groups.set(key, [...(groups.get(key) ?? []), pick]);
  }

  return Array.from(groups.entries())
    .map(([key, groupPicks]) => {
      const completed = groupPicks.filter((pick) => FINAL_STATUSES.has(pick.status));
      const wins = completed.filter((pick) => pick.result === "won").length;
      const losses = completed.filter((pick) => pick.result === "lost").length;
      const pushes = completed.filter((pick) => pick.result === "push").length;
      const cancelled = completed.filter((pick) => pick.result === "cancelled").length;
      const profit = roundMetric(completed.reduce((sum, pick) => sum + pick.profit, 0));

      return {
        key,
        label: key,
        picks: groupPicks.length,
        wins,
        losses,
        pushes,
        cancelled,
        winRate: wins + losses > 0 ? roundMetric((wins / (wins + losses)) * 100) : 0,
        profit,
        roi: initialBankroll > 0 ? roundMetric((profit / initialBankroll) * 100) : 0,
      };
    })
    .filter((group) => group.picks > 0)
    .sort((a, b) => b.picks - a.picks || b.profit - a.profit || a.label.localeCompare(b.label));
}

function calculateExposureMetrics(picks: ManualTrackedPick[], profile: BankrollProfile) {
  const exposureLimit = getProfileExposureLimit(profile);
  const validPicks = picks.filter((pick) => pick.riskAmount > 0 && pick.riskPercentage > 0);
  const riskAmountTotal = validPicks.reduce((sum, pick) => sum + pick.riskAmount, 0);
  const riskPercentageTotal = validPicks.reduce((sum, pick) => sum + pick.riskPercentage, 0);
  const riskPercentages = validPicks.map((pick) => pick.riskPercentage);

  return {
    averageRiskAmount: validPicks.length > 0 ? roundMetric(riskAmountTotal / validPicks.length) : 0,
    averageRiskPercentage: validPicks.length > 0 ? roundMetric(riskPercentageTotal / validPicks.length) : 0,
    highestRiskPercentage: riskPercentages.length > 0 ? roundMetric(Math.max(...riskPercentages)) : 0,
    lowestRiskPercentage: riskPercentages.length > 0 ? roundMetric(Math.min(...riskPercentages)) : 0,
    withinPlanCount: validPicks.filter((pick) => pick.riskPercentage <= exposureLimit).length,
    abovePlanCount: validPicks.filter((pick) => pick.riskPercentage > exposureLimit).length,
  };
}

function getProfileExposureLimit(profile: BankrollProfile) {
  return (profile === "higher_exposure" ? HIGHER_EXPOSURE_PERCENTAGE : ATLAS_RECOMMENDED_PERCENTAGE) * 100;
}

function getManualDisciplineLabel(score: number): ManualDisciplineLabel {
  if (score >= 90) return "Excellent Discipline";
  if (score >= 75) return "Good Discipline";
  if (score >= 60) return "Needs Consistency";
  return "High Variability";
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100;
}
