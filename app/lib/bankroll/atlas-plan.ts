import { roundCurrency } from "./engine";
import type { AtlasPlan, AtlasPlanStatus, BankrollConfig, FinancialMetrics } from "./types";

const ATLAS_PLAN_MOCK_ID = "atlas-plan-mock-top5-v1";

export function createAtlasPlan(metrics: FinancialMetrics, now = new Date().toISOString()): AtlasPlan {
  return {
    id: ATLAS_PLAN_MOCK_ID,
    candidateId: ATLAS_PLAN_MOCK_ID,
    sport: "MLB",
    league: "MLB",
    selection: "Dodgers ML",
    market: "Moneyline",
    odds: -135,
    status: "pending",
    package: "premium",
    recommendedUnit: metrics.recommendedUnit,
    riskAmount: calculateRiskAmount(metrics),
    startTime: new Date(new Date(now).getTime() + 180 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now,
    source: "top5",
    rank: 1,
    locked: false,
    started: false,
    result: null,
    originalRank: 1,
    plannedExposure: metrics.exposure.value,
    replacementHistory: [],
  };
}

export function updateAtlasPlan(plan: AtlasPlan, updates: Partial<AtlasPlan>, now = new Date().toISOString()): AtlasPlan {
  const started = updates.started ?? plan.started;

  return {
    ...plan,
    ...updates,
    locked: started ? true : updates.locked ?? plan.locked,
    started,
    updatedAt: now,
  };
}

export function getPlanStatus(plan: AtlasPlan): AtlasPlanStatus {
  return plan.status;
}

export function syncPlanWithFinancialEngine(plan: AtlasPlan | null | undefined, metrics: FinancialMetrics, now = new Date().toISOString()): AtlasPlan {
  const nextPlan = plan ?? createAtlasPlan(metrics, now);
  const started = nextPlan.status === "started" || nextPlan.started;

  return updateAtlasPlan(
    nextPlan,
    {
      recommendedUnit: metrics.recommendedUnit,
      riskAmount: calculateRiskAmount(metrics),
      plannedExposure: metrics.exposure.value,
      started,
      locked: started,
    },
    now,
  );
}

export function calculateRiskAmount(metrics: FinancialMetrics) {
  return roundCurrency(metrics.recommendedUnit);
}

export function isValidAtlasPlan(value: unknown): value is AtlasPlan {
  if (!value || typeof value !== "object") return false;

  const plan = value as Partial<AtlasPlan>;

  return (
    typeof plan.id === "string" &&
    typeof plan.candidateId === "string" &&
    typeof plan.sport === "string" &&
    typeof plan.league === "string" &&
    typeof plan.selection === "string" &&
    typeof plan.market === "string" &&
    typeof plan.odds === "number" &&
    isAtlasPlanStatus(plan.status) &&
    (plan.package === "free" || plan.package === "exclusive" || plan.package === "premium" || plan.package === "unlimited") &&
    typeof plan.recommendedUnit === "number" &&
    typeof plan.riskAmount === "number" &&
    typeof plan.startTime === "string" &&
    typeof plan.createdAt === "string" &&
    typeof plan.updatedAt === "string" &&
    (plan.source === "signals" || plan.source === "top3" || plan.source === "top5" || plan.source === "topsignal" || plan.source === "manual") &&
    typeof plan.rank === "number" &&
    typeof plan.locked === "boolean" &&
    typeof plan.started === "boolean" &&
    (plan.result === null || plan.result === "won" || plan.result === "lost" || plan.result === "push" || plan.result === "cancelled") &&
    typeof plan.originalRank === "number" &&
    typeof plan.plannedExposure === "number" &&
    Array.isArray(plan.replacementHistory)
  );
}

export function getPlanStatusTone(status: AtlasPlanStatus) {
  if (status === "pending") return "pending";
  if (status === "confirmed" || status === "won") return "positive";
  if (status === "started") return "active";
  if (status === "lost" || status === "removed" || status === "downgraded" || status === "no_eligible_replacement") return "negative";
  return "neutral";
}

export function formatPlanStatus(status: AtlasPlanStatus) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatPlanPackage(planPackage: AtlasPlan["package"]) {
  return planPackage.charAt(0).toUpperCase() + planPackage.slice(1);
}

export function normalizeAtlasPlanFromConfig(config: BankrollConfig, metrics: FinancialMetrics, now = new Date().toISOString()) {
  return syncPlanWithFinancialEngine(isValidAtlasPlan(config.atlasPlan) ? config.atlasPlan : null, metrics, now);
}

function isAtlasPlanStatus(status: unknown): status is AtlasPlanStatus {
  return (
    status === "pending" ||
    status === "confirmed" ||
    status === "started" ||
    status === "won" ||
    status === "lost" ||
    status === "push" ||
    status === "cancelled" ||
    status === "downgraded" ||
    status === "removed" ||
    status === "no_eligible_replacement"
  );
}
