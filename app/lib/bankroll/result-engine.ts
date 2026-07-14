import { calculateRiskAmount, updateAtlasPlan as applyAtlasPlanUpdates } from "./atlas-plan";
import { buildFinancialPlan, roundCurrency } from "./engine";
import { selectPrimaryPlan } from "./package-engine";
import { saveBankrollConfig } from "./storage";
import type {
  AtlasPlan,
  AtlasPlanCollection,
  AtlasPlanFinalResult,
  BankrollConfig,
  FinancialMetrics,
} from "./types";

const FINAL_RESULT_STATUSES = new Set<AtlasPlanFinalResult>(["won", "lost", "push", "cancelled"]);

export type ProcessPlanResultOptions = {
  planId?: string;
  settledAt?: string;
};

export function processPlanResult(
  config: BankrollConfig,
  result: AtlasPlanFinalResult,
  options: ProcessPlanResultOptions = {},
): BankrollConfig {
  const settledAt = options.settledAt ?? new Date().toISOString();
  const targetPlan = findResultTargetPlan(config, options.planId);

  if (!targetPlan || isPlanFinal(targetPlan)) {
    return config;
  }

  const resultProfit = calculatePlanResultProfit(targetPlan, result);
  const nextBankroll = updateFinancialState(config.currentBankroll, resultProfit);
  const financialPlan = buildFinancialPlan({
    ...config,
    currentBankroll: nextBankroll,
    updatedAt: settledAt,
  });
  const completedPlan = applyAtlasPlanUpdates(
    targetPlan,
    {
      status: result,
      result,
      completedAt: settledAt,
      profit: resultProfit,
      started: false,
      locked: true,
    },
    settledAt,
  );
  const atlasPlanCollection = updateAtlasPlanCollection(config.atlasPlanCollection, completedPlan, financialPlan.metrics, settledAt);

  return {
    ...config,
    currentBankroll: financialPlan.metrics.currentBankroll,
    recommendedUnit: financialPlan.metrics.recommendedUnit,
    atlasPlanCollection,
    atlasPlan: atlasPlanCollection.primaryPlan ?? undefined,
    updatedAt: settledAt,
  };
}

export function persistResult(
  config: BankrollConfig,
  result: AtlasPlanFinalResult,
  options: ProcessPlanResultOptions = {},
) {
  const nextConfig = processPlanResult(config, result, options);
  saveBankrollConfig(nextConfig);
  return nextConfig;
}

export function applyWin(plan: AtlasPlan) {
  return calculateAmericanOddsProfit(plan.riskAmount, plan.odds);
}

export function applyLoss(plan: AtlasPlan) {
  return roundCurrency(-Math.max(0, plan.riskAmount));
}

export function applyPush() {
  return 0;
}

export function applyCancelled() {
  return 0;
}

export function updateFinancialState(currentBankroll: number, resultProfit: number) {
  return roundCurrency(Math.max(0, currentBankroll + resultProfit));
}

export function updateAtlasPlanResult(plan: AtlasPlan, result: AtlasPlanFinalResult, settledAt = new Date().toISOString()) {
  return updateAtlasPlanRecord(plan, result, calculatePlanResultProfit(plan, result), settledAt);
}

export function updateAtlasPlanCollection(
  collection: AtlasPlanCollection | null | undefined,
  completedPlan: AtlasPlan,
  metrics: FinancialMetrics,
  now = new Date().toISOString(),
): AtlasPlanCollection {
  const plans = collection?.plans.length
    ? collection.plans.map((plan) => (plan.id === completedPlan.id ? completedPlan : syncOpenPlanMoney(plan, metrics, now)))
    : [completedPlan];

  return {
    plans,
    primaryPlan: selectPrimaryPlan(plans, now),
    manualSelectionRequired: collection?.manualSelectionRequired ?? false,
    createdAt: collection?.createdAt ?? now,
    updatedAt: now,
  };
}

export function getCompletedPlans(collection: AtlasPlanCollection | null | undefined) {
  return (collection?.plans ?? []).filter(isPlanFinal);
}

export function getPendingPlans(collection: AtlasPlanCollection | null | undefined) {
  return (collection?.plans ?? []).filter((plan) => plan.status === "pending" || plan.status === "confirmed");
}

export function getStartedPlans(collection: AtlasPlanCollection | null | undefined) {
  return (collection?.plans ?? []).filter((plan) => plan.status === "started" || plan.started);
}

export function calculatePlanResultProfit(plan: AtlasPlan, result: AtlasPlanFinalResult) {
  if (result === "won") return applyWin(plan);
  if (result === "lost") return applyLoss(plan);
  if (result === "push") return applyPush();
  return applyCancelled();
}

export function calculateAmericanOddsProfit(riskAmount: number, odds: number) {
  const risk = Math.max(0, riskAmount);
  if (!Number.isFinite(odds) || odds === 0) return 0;
  if (odds > 0) return roundCurrency((risk * odds) / 100);
  return roundCurrency((risk * 100) / Math.abs(odds));
}

function updateAtlasPlanRecord(plan: AtlasPlan, result: AtlasPlanFinalResult, profit: number, settledAt: string) {
  return applyAtlasPlanUpdates(
    plan,
    {
      status: result,
      result,
      completedAt: settledAt,
      profit,
      started: false,
      locked: true,
    },
    settledAt,
  );
}

function findResultTargetPlan(config: BankrollConfig, planId: string | undefined) {
  const plans = config.atlasPlanCollection?.plans ?? (config.atlasPlan ? [config.atlasPlan] : []);
  if (planId) return plans.find((plan) => plan.id === planId || plan.candidateId === planId) ?? null;
  return config.atlasPlanCollection?.primaryPlan ?? config.atlasPlan ?? null;
}

function syncOpenPlanMoney(plan: AtlasPlan, metrics: FinancialMetrics, now: string) {
  if (isPlanFinal(plan)) return plan;

  return applyAtlasPlanUpdates(
    plan,
    {
      recommendedUnit: metrics.recommendedUnit,
      riskAmount: calculateRiskAmount(metrics),
      plannedExposure: metrics.exposure.value,
    },
    now,
  );
}

function isPlanFinal(plan: AtlasPlan) {
  return Boolean(plan.result && FINAL_RESULT_STATUSES.has(plan.result)) || FINAL_RESULT_STATUSES.has(plan.status as AtlasPlanFinalResult);
}
