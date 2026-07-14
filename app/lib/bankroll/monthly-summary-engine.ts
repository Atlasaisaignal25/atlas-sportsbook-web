import type { BankrollConfig, MonthlySummary, WeeklySummary } from "./types";

export function normalizeMonthlyState(config: BankrollConfig, now = new Date().toISOString()): BankrollConfig {
  const weeklySummaries = config.weeklySummaries ?? [];
  const generatedSummaries = createMonthlySummaries(weeklySummaries, now);

  return {
    ...config,
    monthlySummaries: mergeMonthlySummaries(config.monthlySummaries ?? [], generatedSummaries),
  };
}

export function createMonthlySummaries(weeklySummaries: WeeklySummary[], createdAt = new Date().toISOString()) {
  return Array.from(groupWeeklySummariesByMonth(weeklySummaries).values())
    .map((weeks) => createMonthlySummary(weeks, createdAt))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

export function createMonthlySummary(weeklySummaries: WeeklySummary[], createdAt = new Date().toISOString()): MonthlySummary {
  const sortedWeeks = sortWeeklySummaries(weeklySummaries);
  const firstWeek = sortedWeeks[0];
  const lastWeek = sortedWeeks.at(-1);

  if (!firstWeek || !lastWeek) {
    throw new Error("Monthly Summary requires at least one Weekly Summary.");
  }

  const monthDate = new Date(firstWeek.startDate);
  const wins = sumWeeklyValue(sortedWeeks, "wins");
  const losses = sumWeeklyValue(sortedWeeks, "losses");
  const totalRisk = roundCurrency(sumWeeklyValue(sortedWeeks, "totalRisk"));
  const completedPlans = sumWeeklyValue(sortedWeeks, "completedPlans");
  const bestWeek = getBestWeek(sortedWeeks);
  const worstWeek = getWorstWeek(sortedWeeks);

  return {
    id: getMonthlySummaryId(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1),
    month: monthDate.getUTCMonth() + 1,
    year: monthDate.getUTCFullYear(),
    startDate: firstWeek.startDate,
    endDate: lastWeek.endDate,
    weeklySummaryIds: sortedWeeks.map((summary) => summary.id),
    initialBankroll: firstWeek.initialBankroll,
    finalBankroll: lastWeek.finalBankroll,
    profit: roundCurrency(sumWeeklyValue(sortedWeeks, "profit")),
    roi: roundPercentage(weightedAverage(sortedWeeks, "roi", "initialBankroll")),
    profile: lastWeek.profile,
    package: lastWeek.package,
    wins,
    losses,
    pushes: sumWeeklyValue(sortedWeeks, "pushes"),
    cancelled: sumWeeklyValue(sortedWeeks, "cancelled"),
    winRate: calculateConsolidatedWinRate(wins, losses, sortedWeeks),
    planScore: roundPercentage(averageWeeklyValue(sortedWeeks, "planScore")),
    completedPlans,
    replacementCount: sumWeeklyValue(sortedWeeks, "replacementCount"),
    averageUnit: completedPlans > 0 ? roundCurrency(totalRisk / completedPlans) : 0,
    totalRisk,
    totalProfit: roundCurrency(sumWeeklyValue(sortedWeeks, "totalProfit")),
    bestWeekId: bestWeek?.id ?? null,
    bestWeekROI: bestWeek?.roi ?? 0,
    worstWeekId: worstWeek?.id ?? null,
    worstWeekROI: worstWeek?.roi ?? 0,
    longestWinningStreak: Math.max(0, ...sortedWeeks.map((summary) => summary.streaks.longestWinningStreak)),
    longestLosingStreak: Math.max(0, ...sortedWeeks.map((summary) => summary.streaks.longestLosingStreak)),
    createdAt,
  };
}

export function groupWeeklySummariesByMonth(weeklySummaries: WeeklySummary[]) {
  return sortWeeklySummaries(weeklySummaries).reduce((groups, summary) => {
    const date = new Date(summary.startDate);
    const key = getMonthlySummaryId(date.getUTCFullYear(), date.getUTCMonth() + 1);
    const group = groups.get(key) ?? [];
    groups.set(key, [...group, summary]);
    return groups;
  }, new Map<string, WeeklySummary[]>());
}

export function getBestWeek(weeklySummaries: WeeklySummary[]) {
  return sortWeeklySummaries(weeklySummaries).reduce<WeeklySummary | null>((best, summary) => {
    if (!best) return summary;
    return summary.roi > best.roi ? summary : best;
  }, null);
}

export function getWorstWeek(weeklySummaries: WeeklySummary[]) {
  return sortWeeklySummaries(weeklySummaries).reduce<WeeklySummary | null>((worst, summary) => {
    if (!worst) return summary;
    return summary.roi < worst.roi ? summary : worst;
  }, null);
}

function mergeMonthlySummaries(existingSummaries: MonthlySummary[], generatedSummaries: MonthlySummary[]) {
  const generatedById = new Map(generatedSummaries.map((summary) => [summary.id, summary]));
  const mergedExisting = existingSummaries.map((summary) => {
    const generated = generatedById.get(summary.id);
    if (!generated) return summary;

    generatedById.delete(summary.id);
    return haveSameWeeklySnapshot(summary, generated) ? summary : generated;
  });

  return [...mergedExisting, ...generatedById.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

function haveSameWeeklySnapshot(existing: MonthlySummary, generated: MonthlySummary) {
  return (
    existing.weeklySummaryIds.length === generated.weeklySummaryIds.length &&
    existing.weeklySummaryIds.every((id, index) => id === generated.weeklySummaryIds[index])
  );
}

function sortWeeklySummaries(weeklySummaries: WeeklySummary[]) {
  return [...weeklySummaries].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

function sumWeeklyValue<K extends NumericWeeklySummaryKey>(weeklySummaries: WeeklySummary[], key: K) {
  return weeklySummaries.reduce((sum, summary) => sum + summary[key], 0);
}

function averageWeeklyValue<K extends NumericWeeklySummaryKey>(weeklySummaries: WeeklySummary[], key: K) {
  if (weeklySummaries.length === 0) return 0;
  return sumWeeklyValue(weeklySummaries, key) / weeklySummaries.length;
}

function weightedAverage<K extends NumericWeeklySummaryKey, W extends NumericWeeklySummaryKey>(
  weeklySummaries: WeeklySummary[],
  valueKey: K,
  weightKey: W,
) {
  const totalWeight = sumWeeklyValue(weeklySummaries, weightKey);
  if (totalWeight <= 0) return averageWeeklyValue(weeklySummaries, valueKey);

  return weeklySummaries.reduce((sum, summary) => sum + summary[valueKey] * summary[weightKey], 0) / totalWeight;
}

function calculateConsolidatedWinRate(wins: number, losses: number, weeklySummaries: WeeklySummary[]) {
  const graded = wins + losses;
  if (graded > 0) return roundPercentage((wins / graded) * 100);
  return roundPercentage(averageWeeklyValue(weeklySummaries, "winRate"));
}

function getMonthlySummaryId(year: number, month: number) {
  return `monthly-summary-${year}-${String(month).padStart(2, "0")}`;
}

function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function roundPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

type NumericWeeklySummaryKey = {
  [K in keyof WeeklySummary]: WeeklySummary[K] extends number ? K : never;
}[keyof WeeklySummary];
