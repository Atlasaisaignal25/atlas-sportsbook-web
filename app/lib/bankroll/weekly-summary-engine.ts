import { calculateExposure, calculateROI, roundCurrency } from "./engine";
import type {
  AtlasPlan,
  AtlasPlanFinalResult,
  AtlasPlanPackage,
  BankrollConfig,
  BankrollCycle,
  WeeklyStreaks,
  WeeklySummary,
} from "./types";

const WEEKLY_CYCLE_DAYS = 7;

export function normalizeWeeklyState(config: BankrollConfig, now = new Date().toISOString()): BankrollConfig {
  const activeCycle = isValidOpenCycle(config.activeCycle)
    ? config.activeCycle
    : createWeeklyCycle(getNextCycleNumber(config), config.createdAt, config.initialBankroll);
  const hydratedConfig: BankrollConfig = {
    ...config,
    activeCycle,
    cycleHistory: config.cycleHistory ?? [],
    weeklySummaries: config.weeklySummaries ?? [],
  };

  if (!shouldCloseWeeklyCycle(activeCycle, now)) return hydratedConfig;

  return closeWeeklyCycle(hydratedConfig, now);
}

export function createWeeklyCycle(
  cycleNumber: number,
  startDate = new Date().toISOString(),
  initialBankroll = 0,
): BankrollCycle {
  const normalizedStart = new Date(startDate).toISOString();

  return {
    id: `bankroll-cycle-${cycleNumber}`,
    cycleNumber,
    startDate: normalizedStart,
    endDate: addDays(normalizedStart, WEEKLY_CYCLE_DAYS),
    status: "open",
    initialBankroll: roundCurrency(initialBankroll),
    createdAt: normalizedStart,
    closedAt: null,
  };
}

export function closeWeeklyCycle(config: BankrollConfig, closedAt = new Date().toISOString()): BankrollConfig {
  const activeCycle = isValidOpenCycle(config.activeCycle)
    ? config.activeCycle
    : createWeeklyCycle(getNextCycleNumber(config), config.createdAt, config.initialBankroll);
  const summary = createWeeklySummary(config, activeCycle, closedAt);
  const closedCycle: BankrollCycle = {
    ...activeCycle,
    status: "closed",
    closedAt,
  };
  const cycleHistory = appendUniqueCycle(config.cycleHistory ?? [], closedCycle);
  const weeklySummaries = appendUniqueSummary(config.weeklySummaries ?? [], summary);
  const nextCycle = createWeeklyCycle(activeCycle.cycleNumber + 1, closedAt, config.currentBankroll);

  return {
    ...config,
    activeCycle: nextCycle,
    cycleHistory,
    weeklySummaries,
    updatedAt: closedAt,
  };
}

export function createWeeklySummary(config: BankrollConfig, cycle: BankrollCycle, createdAt = new Date().toISOString()): WeeklySummary {
  const plans = getCyclePlans(config, cycle);
  const resultCounts = countPlanResults(plans);
  const initialBankroll = roundCurrency(cycle.initialBankroll);
  const finalBankroll = roundCurrency(config.currentBankroll);
  const profit = roundCurrency(finalBankroll - initialBankroll);
  const roi = calculateROI(finalBankroll, initialBankroll).value;
  const packageName = getSnapshotPackage(config);
  const currentExposure = calculateExposure(config.recommendedUnit, finalBankroll, config.profile).value;
  const completedPlans = resultCounts.won + resultCounts.lost + resultCounts.push + resultCounts.cancelled;
  const pendingPlans = countPendingPlans(config, cycle);
  const totalRisk = roundCurrency(plans.reduce((sum, plan) => sum + Math.max(0, plan.riskAmount), 0));
  const totalProfit = roundCurrency(plans.reduce((sum, plan) => sum + (plan.profit ?? 0), 0));

  return {
    id: `weekly-summary-${cycle.cycleNumber}`,
    cycleNumber: cycle.cycleNumber,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    status: "closed",
    initialBankroll,
    finalBankroll,
    profit,
    roi,
    recommendedUnitFinal: roundCurrency(config.recommendedUnit),
    profile: config.profile,
    package: packageName,
    currentExposure,
    wins: resultCounts.won,
    losses: resultCounts.lost,
    pushes: resultCounts.push,
    cancelled: resultCounts.cancelled,
    completedPlans,
    pendingPlans,
    winRate: calculateWinRate(resultCounts.won, resultCounts.lost),
    planScore: calculatePlanScore({
      pendingPlans,
      cancelled: resultCounts.cancelled,
      inconsistencies: countSummaryInconsistencies(config, plans, profit, totalProfit),
    }),
    replacementCount: plans.reduce((sum, plan) => sum + (plan.replacementHistory?.length ?? 0), 0),
    averageUnit: completedPlans > 0 ? roundCurrency(totalRisk / completedPlans) : 0,
    totalRisk,
    totalProfit,
    streaks: calculateWeeklyStreaks(plans),
    createdAt,
  };
}

export function shouldCloseWeeklyCycle(cycle: BankrollCycle, now = new Date().toISOString()) {
  return new Date(now).getTime() > new Date(cycle.endDate).getTime();
}

export function calculateWinRate(wins: number, losses: number) {
  const graded = wins + losses;
  if (graded <= 0) return 0;
  return roundPercentage((wins / graded) * 100);
}

export function calculatePlanScore({
  pendingPlans,
  cancelled,
  inconsistencies,
}: {
  pendingPlans: number;
  cancelled: number;
  inconsistencies: number;
}) {
  return Math.max(0, 100 - pendingPlans * 8 - cancelled * 5 - inconsistencies * 10);
}

export function calculateWeeklyStreaks(plans: AtlasPlan[]): WeeklyStreaks {
  const gradedPlans = [...plans]
    .filter((plan) => plan.result === "won" || plan.result === "lost")
    .sort((a, b) => new Date(a.completedAt ?? a.updatedAt).getTime() - new Date(b.completedAt ?? b.updatedAt).getTime());
  let longestWinningStreak = 0;
  let longestLosingStreak = 0;
  let currentWinningStreak = 0;
  let currentLosingStreak = 0;

  for (const plan of gradedPlans) {
    if (plan.result === "won") {
      currentWinningStreak += 1;
      currentLosingStreak = 0;
      longestWinningStreak = Math.max(longestWinningStreak, currentWinningStreak);
    } else {
      currentLosingStreak += 1;
      currentWinningStreak = 0;
      longestLosingStreak = Math.max(longestLosingStreak, currentLosingStreak);
    }
  }

  const latest = gradedPlans.at(-1);
  const currentEndingType = latest?.result === "won" || latest?.result === "lost" ? latest.result : null;

  return {
    longestWinningStreak,
    longestLosingStreak,
    currentEndingStreak: currentEndingType === "won" ? currentWinningStreak : currentEndingType === "lost" ? currentLosingStreak : 0,
    currentEndingType,
  };
}

export function getCyclePlans(config: BankrollConfig, cycle: BankrollCycle) {
  const plans = config.atlasPlanCollection?.plans ?? (config.atlasPlan ? [config.atlasPlan] : []);

  return plans.filter((plan) => {
    if (!plan.completedAt || !plan.result) return false;
    const completedTime = new Date(plan.completedAt).getTime();
    return completedTime >= new Date(cycle.startDate).getTime() && completedTime <= new Date(cycle.endDate).getTime();
  });
}

function countPlanResults(plans: AtlasPlan[]) {
  return plans.reduce(
    (counts, plan) => {
      if (plan.result === "won" || plan.result === "lost" || plan.result === "push" || plan.result === "cancelled") {
        counts[plan.result] += 1;
      }

      return counts;
    },
    { won: 0, lost: 0, push: 0, cancelled: 0 } satisfies Record<AtlasPlanFinalResult, number>,
  );
}

function countPendingPlans(config: BankrollConfig, cycle: BankrollCycle) {
  const plans = config.atlasPlanCollection?.plans ?? (config.atlasPlan ? [config.atlasPlan] : []);
  const cycleEndTime = new Date(cycle.endDate).getTime();

  return plans.filter((plan) => {
    if (plan.result) return false;
    const startTime = new Date(plan.startTime).getTime();
    return startTime >= new Date(cycle.startDate).getTime() && startTime <= cycleEndTime;
  }).length;
}

function countSummaryInconsistencies(config: BankrollConfig, plans: AtlasPlan[], profit: number, totalProfit: number) {
  let inconsistencies = 0;
  if (!Number.isFinite(config.currentBankroll) || config.currentBankroll < 0) inconsistencies += 1;
  if (Math.abs(profit - totalProfit) > 0.02 && plans.length > 0) inconsistencies += 1;
  if (plans.some((plan) => !plan.completedAt || !plan.result)) inconsistencies += 1;
  return inconsistencies;
}

function getSnapshotPackage(config: BankrollConfig): AtlasPlanPackage {
  return config.membership?.package ?? config.atlasPlanCollection?.primaryPlan?.package ?? config.atlasPlan?.package ?? "premium";
}

function getNextCycleNumber(config: BankrollConfig) {
  const activeCycleNumber = config.activeCycle?.cycleNumber ?? 0;
  const historyNumber = Math.max(0, ...(config.cycleHistory ?? []).map((cycle) => cycle.cycleNumber));
  const summaryNumber = Math.max(0, ...(config.weeklySummaries ?? []).map((summary) => summary.cycleNumber));
  return Math.max(activeCycleNumber, historyNumber, summaryNumber) + 1;
}

function isValidOpenCycle(cycle: BankrollConfig["activeCycle"]): cycle is BankrollCycle {
  return Boolean(
    cycle &&
      cycle.status === "open" &&
      typeof cycle.id === "string" &&
      typeof cycle.cycleNumber === "number" &&
      typeof cycle.startDate === "string" &&
      typeof cycle.endDate === "string" &&
      typeof cycle.initialBankroll === "number",
  );
}

function appendUniqueCycle(cycles: BankrollCycle[], cycle: BankrollCycle) {
  return cycles.some((item) => item.id === cycle.id) ? cycles : [...cycles, cycle];
}

function appendUniqueSummary(summaries: WeeklySummary[], summary: WeeklySummary) {
  return summaries.some((item) => item.id === summary.id) ? summaries : [...summaries, summary];
}

function addDays(date: string, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function roundPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
