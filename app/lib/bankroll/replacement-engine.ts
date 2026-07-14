import { calculateRiskAmount, updateAtlasPlan } from "./atlas-plan";
import type {
  AtlasPlan,
  AtlasPlanCandidate,
  AtlasPlanCollection,
  AtlasPlanPackage,
  AtlasPlanSource,
  FinancialMetrics,
  MembershipContext,
  ReplacementReason,
  ReplacementRecord,
} from "./types";

const REPLACEABLE_STATUSES = new Set(["removed", "downgraded", "no_eligible_replacement"]);

export function lockStartedPlans(plans: AtlasPlan[], now = new Date().toISOString()) {
  const nowTime = new Date(now).getTime();

  return plans.map((plan) => {
    if (plan.locked || plan.started) return plan;
    if (new Date(plan.startTime).getTime() > nowTime) return plan;

    return updateAtlasPlan(plan, { status: "started", started: true, locked: true }, now);
  });
}

export function evaluateCollectionReplacements(
  plans: AtlasPlan[],
  candidates: AtlasPlanCandidate[],
  membership: MembershipContext,
  metrics: FinancialMetrics,
  now = new Date().toISOString(),
) {
  if (membership.package === "free") return plans;

  return plans.map((plan) => evaluatePlanReplacement(plan, candidates, membership, metrics, now));
}

export function evaluatePlanReplacement(
  plan: AtlasPlan,
  candidates: AtlasPlanCandidate[],
  membership: MembershipContext,
  metrics: FinancialMetrics,
  now = new Date().toISOString(),
) {
  if (plan.locked || plan.started) {
    return syncPlanMoney(plan, metrics, now);
  }

  const currentCandidate = candidates.find((candidate) => candidate.candidateId === plan.candidateId);
  const reason = getReplacementReason(plan, currentCandidate, now);
  if (!reason) return syncPlanMoney(plan, metrics, now);

  const replacement = findNextEligibleCandidate(plan, candidates, membership, now);
  if (!replacement) {
    return updateAtlasPlan(
      syncPlanMoney(plan, metrics, now),
      {
        status: "no_eligible_replacement",
        started: false,
        locked: false,
      },
      now,
    );
  }

  return replacePlanCandidate(plan, replacement, reason, metrics, now);
}

export function findNextEligibleCandidate(
  plan: AtlasPlan,
  candidates: AtlasPlanCandidate[],
  membership: MembershipContext,
  now = new Date().toISOString(),
) {
  return candidates
    .filter((candidate) => isEligibleReplacementCandidate(candidate, plan, membership, now))
    .sort((a, b) => a.rank - b.rank)[0] ?? null;
}

export function isEligibleReplacementCandidate(
  candidate: AtlasPlanCandidate,
  plan: AtlasPlan,
  membership: MembershipContext,
  now = new Date().toISOString(),
) {
  if (candidate.sport !== plan.sport) return false;
  if (candidate.source !== plan.source) return false;
  if (candidate.package !== plan.package) return false;
  if (candidate.package !== membership.package) return false;
  if (candidate.rank <= plan.rank) return false;
  if (candidate.rank > getMaxReplacementRank(membership.package)) return false;
  if (candidate.status === "removed" || candidate.status === "downgraded" || candidate.status === "started" || candidate.status === "no_eligible_replacement") return false;
  if (new Date(candidate.startTime).getTime() <= new Date(now).getTime()) return false;

  return true;
}

export function replacePlanCandidate(
  plan: AtlasPlan,
  replacement: AtlasPlanCandidate,
  reason: ReplacementReason,
  metrics: FinancialMetrics,
  now = new Date().toISOString(),
) {
  const replacementHistory = appendReplacementRecord(plan.replacementHistory ?? [], createReplacementRecord(plan, replacement, reason, now));

  return updateAtlasPlan(
    plan,
    {
      candidateId: replacement.candidateId,
      sport: replacement.sport,
      league: replacement.league,
      selection: replacement.selection,
      market: replacement.market,
      odds: replacement.odds,
      status: replacement.status,
      startTime: replacement.startTime,
      source: replacement.source,
      rank: replacement.rank,
      recommendedUnit: metrics.recommendedUnit,
      riskAmount: calculateRiskAmount(metrics),
      plannedExposure: metrics.exposure.value,
      started: false,
      locked: false,
      replacementHistory,
    },
    now,
  );
}

export function createReplacementRecord(
  plan: AtlasPlan,
  replacement: AtlasPlanCandidate,
  reason: ReplacementReason,
  replacedAt = new Date().toISOString(),
): ReplacementRecord {
  return {
    originalPickId: plan.candidateId,
    replacementPickId: replacement.candidateId,
    originalRank: plan.rank,
    replacementRank: replacement.rank,
    reason,
    replacedAt,
    sport: plan.sport,
    source: plan.source,
    package: plan.package,
  };
}

export function getReplacementSummary(plan: AtlasPlan) {
  const latest = plan.replacementHistory.at(-1);
  if (!latest) return null;

  return `Replaced from Rank ${latest.originalRank} due to ${formatReplacementReason(latest.reason)}`;
}

export function syncCollectionPlanMoney(collection: AtlasPlanCollection, metrics: FinancialMetrics, now = new Date().toISOString()): AtlasPlanCollection {
  const plans = collection.plans.map((plan) => syncPlanMoney(plan, metrics, now));

  return {
    ...collection,
    plans,
    primaryPlan: collection.primaryPlan ? plans.find((plan) => plan.id === collection.primaryPlan?.id) ?? collection.primaryPlan : null,
    updatedAt: now,
  };
}

function syncPlanMoney(plan: AtlasPlan, metrics: FinancialMetrics, now: string) {
  return updateAtlasPlan(
    plan,
    {
      recommendedUnit: metrics.recommendedUnit,
      riskAmount: calculateRiskAmount(metrics),
      plannedExposure: metrics.exposure.value,
    },
    now,
  );
}

function getReplacementReason(plan: AtlasPlan, currentCandidate: AtlasPlanCandidate | undefined, now: string): ReplacementReason | null {
  if (plan.status === "removed") return "removed";
  if (plan.status === "downgraded") return "downgraded";
  if (!currentCandidate) return "candidate_invalid";
  if (currentCandidate.status === "removed") return "removed";
  if (currentCandidate.status === "downgraded") return "downgraded";
  if (currentCandidate.status === "started" || new Date(currentCandidate.startTime).getTime() <= new Date(now).getTime()) return "started_unavailable";
  if (REPLACEABLE_STATUSES.has(plan.status)) return "candidate_invalid";

  return null;
}

function appendReplacementRecord(history: ReplacementRecord[], record: ReplacementRecord) {
  const exists = history.some(
    (item) =>
      item.originalPickId === record.originalPickId &&
      item.replacementPickId === record.replacementPickId &&
      item.reason === record.reason,
  );

  return exists ? history : [...history, record];
}

function getMaxReplacementRank(planPackage: AtlasPlanPackage) {
  if (planPackage === "exclusive") return 3;
  if (planPackage === "premium" || planPackage === "unlimited") return 5;
  return 1;
}

function formatReplacementReason(reason: ReplacementReason) {
  if (reason === "removed") return "Removed";
  if (reason === "downgraded") return "Downgraded";
  if (reason === "started_unavailable") return "Started";
  return "Candidate Invalid";
}
