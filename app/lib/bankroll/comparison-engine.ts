import { calculateDisciplineMetrics, type ManualPerformanceGroup, type ManualTrackingAnalytics } from "./manual-analytics-engine";
import type { TrackingRange } from "./manual-history-engine";
import type { AtlasPlan, BankrollConfig, ManualTrackedPick, WeeklySummary } from "./types";

export type ComparisonLeader = "atlas" | "manual" | "even" | "insufficient";

export type ComparisonMetric = {
  atlas: number;
  manual: number;
  leader: ComparisonLeader;
};

export type ComparisonGroup = {
  key: string;
  label: string;
  atlasROI: number;
  manualROI: number;
  atlasWinRate: number;
  manualWinRate: number;
  atlasProfit: number;
  manualProfit: number;
  leader: ComparisonLeader;
};

export type TrackingComparison = {
  period: TrackingRange;
  atlasBankroll: number;
  manualBankroll: number;
  atlasROI: number;
  manualROI: number;
  atlasProfit: number;
  manualProfit: number;
  atlasWinRate: number;
  manualWinRate: number;
  atlasExposure: number;
  manualExposure: number;
  atlasDiscipline: number;
  manualDiscipline: number;
  atlasCompletedPicks: number;
  manualCompletedPicks: number;
  betterROI: ComparisonLeader;
  betterWinRate: ComparisonLeader;
  betterDiscipline: ComparisonLeader;
  roiComparison: ComparisonMetric;
  winRateComparison: ComparisonMetric;
  profitComparison: ComparisonMetric;
  disciplineComparison: ComparisonMetric;
  sports: ComparisonGroup[];
  markets: ComparisonGroup[];
  insights: string[];
  hasComparisonData: boolean;
  generatedAt: string;
};

const FINAL_STATUSES = new Set(["won", "lost", "push", "cancelled"]);

export function buildComparison(
  config: BankrollConfig,
  manualAnalytics: ManualTrackingAnalytics,
  period: TrackingRange = manualAnalytics.period,
  selectedDate = manualAnalytics.selectedDate,
  now = new Date(),
): TrackingComparison {
  const atlasSnapshot = buildAtlasSnapshot(config, period, selectedDate, now);
  const manualDiscipline = manualAnalytics.disciplineScore;
  const atlasDiscipline = atlasSnapshot.discipline;
  const comparison: TrackingComparison = {
    period,
    atlasBankroll: atlasSnapshot.bankroll,
    manualBankroll: manualAnalytics.currentBankroll,
    atlasROI: atlasSnapshot.roi,
    manualROI: manualAnalytics.roi,
    atlasProfit: atlasSnapshot.profit,
    manualProfit: manualAnalytics.profit,
    atlasWinRate: atlasSnapshot.winRate,
    manualWinRate: manualAnalytics.winRate,
    atlasExposure: atlasSnapshot.exposure,
    manualExposure: manualAnalytics.averageRiskPercentage,
    atlasDiscipline,
    manualDiscipline,
    atlasCompletedPicks: atlasSnapshot.completedPicks,
    manualCompletedPicks: manualAnalytics.completedPicks,
    betterROI: compareROI(atlasSnapshot.roi, manualAnalytics.roi),
    betterWinRate: compareWinRate(atlasSnapshot.winRate, manualAnalytics.winRate),
    betterDiscipline: compareDiscipline(atlasDiscipline, manualDiscipline),
    roiComparison: compareMetric(atlasSnapshot.roi, manualAnalytics.roi),
    winRateComparison: compareMetric(atlasSnapshot.winRate, manualAnalytics.winRate),
    profitComparison: compareMetric(atlasSnapshot.profit, manualAnalytics.profit),
    disciplineComparison: compareMetric(atlasDiscipline, manualDiscipline),
    sports: compareSports(atlasSnapshot.bySport, manualAnalytics.performanceBySport),
    markets: compareMarkets(atlasSnapshot.byMarket, manualAnalytics.performanceByMarket),
    insights: [],
    hasComparisonData: atlasSnapshot.completedPicks > 0 && manualAnalytics.completedPicks > 0,
    generatedAt: now.toISOString(),
  };

  return {
    ...comparison,
    insights: buildInsights(comparison),
  };
}

export function compareROI(atlasROI: number, manualROI: number) {
  return compareMetric(atlasROI, manualROI).leader;
}

export function compareProfit(atlasProfit: number, manualProfit: number) {
  return compareMetric(atlasProfit, manualProfit).leader;
}

export function compareDiscipline(atlasDiscipline: number, manualDiscipline: number) {
  return compareMetric(atlasDiscipline, manualDiscipline).leader;
}

export function compareSports(atlasGroups: ManualPerformanceGroup[], manualGroups: ManualPerformanceGroup[]) {
  return compareGroups(atlasGroups, manualGroups);
}

export function compareMarkets(atlasGroups: ManualPerformanceGroup[], manualGroups: ManualPerformanceGroup[]) {
  return compareGroups(atlasGroups, manualGroups);
}

export function buildInsights(comparison: TrackingComparison) {
  if (!comparison.hasComparisonData) {
    return ["Comparison will become available after both Atlas Plan and My Tracking have completed picks."];
  }

  const insights: string[] = [];
  if (comparison.betterDiscipline === "atlas") insights.push("Atlas showed stronger discipline during this period.");
  if (comparison.betterDiscipline === "manual") insights.push("Your tracking discipline was stronger during this period.");
  if (comparison.betterROI === "manual" && Math.abs(comparison.manualExposure - comparison.atlasExposure) <= 1) {
    insights.push("Your ROI was higher while keeping exposure similar.");
  }
  if (comparison.manualExposure < comparison.atlasExposure) insights.push("You reduced exposure compared with Atlas for this period.");
  if (insights.length === 0) insights.push("Both paths stayed close across the main tracking metrics.");

  return insights.slice(0, 2);
}

function buildAtlasSnapshot(config: BankrollConfig, period: TrackingRange, selectedDate: string, now: Date) {
  const plans = getAtlasPlansForPeriod(config, period, selectedDate, now);
  const completedPlans = plans.filter((plan) => plan.result && FINAL_STATUSES.has(plan.result));
  const weeklySummaries = getWeeklySummariesForPeriod(config.weeklySummaries ?? [], period, selectedDate, now);
  const wins = completedPlans.filter((plan) => plan.result === "won").length;
  const losses = completedPlans.filter((plan) => plan.result === "lost").length;
  const profit = roundMetric(completedPlans.reduce((sum, plan) => sum + (plan.profit ?? 0), 0));
  const totalRisk = completedPlans.reduce((sum, plan) => sum + Math.max(0, plan.riskAmount), 0);
  const bySport = buildAtlasGroups(completedPlans, (plan) => plan.sport || "Unknown", config.initialBankroll);
  const byMarket = buildAtlasGroups(completedPlans, (plan) => plan.market || "Unknown", config.initialBankroll);
  const summaryProfit = roundMetric(weeklySummaries.reduce((sum, summary) => sum + summary.profit, 0));
  const useSummaries = completedPlans.length === 0 && weeklySummaries.length > 0;
  const atlasProfit = useSummaries ? summaryProfit : profit;
  const completedCount = useSummaries ? weeklySummaries.reduce((sum, summary) => sum + summary.completedPlans, 0) : completedPlans.length;
  const summaryWins = weeklySummaries.reduce((sum, summary) => sum + summary.wins, 0);
  const summaryLosses = weeklySummaries.reduce((sum, summary) => sum + summary.losses, 0);
  const gradedWins = useSummaries ? summaryWins : wins;
  const gradedLosses = useSummaries ? summaryLosses : losses;
  const exposure = useSummaries
    ? roundMetric(average(weeklySummaries.map((summary) => summary.currentExposure)))
    : completedPlans.length > 0
      ? roundMetric((totalRisk / completedPlans.length / Math.max(config.currentBankroll, 1)) * 100)
      : 0;
  const discipline = useSummaries
    ? roundMetric(average(weeklySummaries.map((summary) => summary.planScore)))
    : calculateAtlasDiscipline(completedPlans);

  return {
    bankroll: roundMetric(config.currentBankroll),
    roi: config.initialBankroll > 0 ? roundMetric((atlasProfit / config.initialBankroll) * 100) : 0,
    profit: atlasProfit,
    winRate: gradedWins + gradedLosses > 0 ? roundMetric((gradedWins / (gradedWins + gradedLosses)) * 100) : 0,
    exposure,
    discipline,
    completedPicks: completedCount,
    bySport: useSummaries ? [] : bySport,
    byMarket: useSummaries ? [] : byMarket,
  };
}

function getAtlasPlansForPeriod(config: BankrollConfig, period: TrackingRange, selectedDate: string, now: Date) {
  const plans = config.atlasPlanCollection?.plans ?? (config.atlasPlan ? [config.atlasPlan] : []);
  return plans.filter((plan) => isDateInPeriod(new Date(plan.completedAt ?? plan.startTime), period, selectedDate, now));
}

function getWeeklySummariesForPeriod(summaries: WeeklySummary[], period: TrackingRange, selectedDate: string, now: Date) {
  return summaries.filter((summary) => isDateInPeriod(new Date(summary.endDate), period, selectedDate, now));
}

function compareMetric(atlas: number, manual: number): ComparisonMetric {
  const diff = Math.abs(atlas - manual);
  const leader: ComparisonLeader = diff < 0.01 ? "even" : atlas > manual ? "atlas" : "manual";
  return { atlas, manual, leader };
}

function compareWinRate(atlas: number, manual: number) {
  return compareMetric(atlas, manual).leader;
}

function compareGroups(atlasGroups: ManualPerformanceGroup[], manualGroups: ManualPerformanceGroup[]): ComparisonGroup[] {
  const keys = new Set([...atlasGroups.map((group) => group.key), ...manualGroups.map((group) => group.key)]);

  return Array.from(keys)
    .map((key) => {
      const atlas = atlasGroups.find((group) => group.key === key);
      const manual = manualGroups.find((group) => group.key === key);

      return {
        key,
        label: atlas?.label ?? manual?.label ?? key,
        atlasROI: atlas?.roi ?? 0,
        manualROI: manual?.roi ?? 0,
        atlasWinRate: atlas?.winRate ?? 0,
        manualWinRate: manual?.winRate ?? 0,
        atlasProfit: atlas?.profit ?? 0,
        manualProfit: manual?.profit ?? 0,
        leader: compareROI(atlas?.roi ?? 0, manual?.roi ?? 0),
      };
    })
    .sort((a, b) => Math.abs(b.atlasProfit + b.manualProfit) - Math.abs(a.atlasProfit + a.manualProfit) || a.label.localeCompare(b.label));
}

function buildAtlasGroups(plans: AtlasPlan[], keySelector: (plan: AtlasPlan) => string, initialBankroll: number): ManualPerformanceGroup[] {
  const groups = new Map<string, AtlasPlan[]>();

  for (const plan of plans) {
    const key = keySelector(plan);
    groups.set(key, [...(groups.get(key) ?? []), plan]);
  }

  return Array.from(groups.entries()).map(([key, groupPlans]) => {
    const wins = groupPlans.filter((plan) => plan.result === "won").length;
    const losses = groupPlans.filter((plan) => plan.result === "lost").length;
    const pushes = groupPlans.filter((plan) => plan.result === "push").length;
    const cancelled = groupPlans.filter((plan) => plan.result === "cancelled").length;
    const profit = roundMetric(groupPlans.reduce((sum, plan) => sum + (plan.profit ?? 0), 0));

    return {
      key,
      label: key,
      picks: groupPlans.length,
      wins,
      losses,
      pushes,
      cancelled,
      winRate: wins + losses > 0 ? roundMetric((wins / (wins + losses)) * 100) : 0,
      profit,
      roi: initialBankroll > 0 ? roundMetric((profit / initialBankroll) * 100) : 0,
    };
  });
}

function calculateAtlasDiscipline(plans: AtlasPlan[]) {
  if (plans.length === 0) return 0;

  return calculateDisciplineMetrics(plans.map(planToManualLikePick)).score;
}

function planToManualLikePick(plan: AtlasPlan): ManualTrackedPick {
  return {
    id: plan.id,
    origin: "manual",
    linkedAtlasPickId: plan.candidateId,
    sport: plan.sport as ManualTrackedPick["sport"],
    league: plan.league,
    eventId: plan.candidateId,
    homeTeam: "",
    awayTeam: "",
    eventDate: plan.startTime.slice(0, 10),
    eventTime: "",
    market: plan.market,
    selection: plan.selection,
    odds: plan.odds,
    trackedOdds: plan.odds,
    riskAmount: plan.riskAmount,
    riskPercentage: plan.plannedExposure,
    status: plan.status,
    result: plan.result,
    profit: plan.profit ?? 0,
    startTime: plan.startTime,
    locked: plan.locked,
    trackingState: "active",
    resultSyncKey: null,
    createdAt: plan.completedAt ?? plan.startTime,
    updatedAt: plan.updatedAt,
    completedAt: plan.completedAt,
    notes: "",
    source: "manual",
    atlasSource: plan.source,
    rank: plan.rank,
    timeline: [],
  };
}

function isDateInPeriod(date: Date, period: TrackingRange, selectedDate: string, now: Date) {
  const key = toDateKey(date);
  if (period === "all_time") return true;
  if (period === "calendar") return key === selectedDate;
  if (period === "today") return key === toDateKey(now);
  if (period === "yesterday") return key === toDateKey(addDays(now, -1));
  if (period === "this_month") return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();

  const thisWeekStart = startOfWeek(now);
  if (period === "this_week") return date >= thisWeekStart && date < addDays(thisWeekStart, 7);
  if (period === "last_week") {
    const lastWeekStart = addDays(thisWeekStart, -7);
    return date >= lastWeekStart && date < thisWeekStart;
  }

  return false;
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

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
