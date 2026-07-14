import { calculateRiskAmount, isValidAtlasPlan, updateAtlasPlan } from "./atlas-plan";
import type {
  AtlasPlan,
  AtlasPlanCollection,
  AtlasPlanPackage,
  AtlasPlanSource,
  AtlasPlanSport,
  FinancialMetrics,
  MembershipContext,
} from "./types";

type PackagePlanCandidate = {
  id: string;
  sport: AtlasPlanSport;
  league: string;
  selection: string;
  market: string;
  odds: number;
  rank: number;
  source: AtlasPlanSource;
  startsInMinutes: number;
};

export const DEFAULT_MEMBERSHIP_CONTEXT: MembershipContext = {
  package: "premium",
  selectedSport: "MLB",
  availableSports: ["MLB"],
};

const ALL_SIGNAL_SPORTS: AtlasPlanSport[] = ["MLB", "NBA", "NFL", "NHL"];
const ALL_PREMIUM_SPORTS: AtlasPlanSport[] = ["MLB", "NBA", "NFL", "NHL"];

const signalsDetectedMock: PackagePlanCandidate[] = [
  createCandidate("signals-mlb-1", "MLB", "Dodgers ML", "Moneyline", -135, "signals", 190),
  createCandidate("signals-mlb-2", "MLB", "Yankees ML", "Moneyline", -120, "signals", 260, 2),
  createCandidate("signals-nba-1", "NBA", "Celtics ML", "Moneyline", -130, "signals", 220),
  createCandidate("signals-nfl-1", "NFL", "Chiefs ML", "Moneyline", -125, "signals", 310),
  createCandidate("signals-nhl-1", "NHL", "Rangers ML", "Moneyline", -118, "signals", 280),
];

const premiumTopFiveMock: PackagePlanCandidate[] = [
  createCandidate("premium-mlb-1", "MLB", "Dodgers ML", "Moneyline", -135, "top5", 180),
  createCandidate("premium-mlb-2", "MLB", "Braves ML", "Moneyline", -122, "top5", 240, 2),
  createCandidate("premium-nba-1", "NBA", "Celtics ML", "Moneyline", -140, "top5", 210),
  createCandidate("premium-nfl-1", "NFL", "Chiefs ML", "Moneyline", -135, "top5", 300),
  createCandidate("premium-nhl-1", "NHL", "Rangers ML", "Moneyline", -125, "top5", 270),
];

export function getDefaultMembershipContext(): MembershipContext {
  return { ...DEFAULT_MEMBERSHIP_CONTEXT, availableSports: [...DEFAULT_MEMBERSHIP_CONTEXT.availableSports] };
}

export function normalizeMembershipContext(value: unknown): MembershipContext {
  if (!isValidMembershipContext(value)) return getDefaultMembershipContext();

  return {
    package: value.package,
    selectedSport: value.selectedSport,
    availableSports: [...value.availableSports],
  };
}

export function buildPlans(membership: MembershipContext, metrics: FinancialMetrics, now = new Date().toISOString()): AtlasPlanCollection {
  const normalizedMembership = normalizeMembershipContext(membership);
  const candidates = getCandidatesForMembership(normalizedMembership);
  const plans = candidates.map((candidate) => createPlanFromCandidate(candidate, normalizedMembership.package, metrics, now));

  return {
    plans,
    primaryPlan: selectPrimaryPlan(plans, now),
    manualSelectionRequired: normalizedMembership.package === "free",
    createdAt: now,
    updatedAt: now,
  };
}

export function syncPlans(
  collection: AtlasPlanCollection | null | undefined,
  membership: MembershipContext,
  metrics: FinancialMetrics,
  now = new Date().toISOString(),
): AtlasPlanCollection {
  const normalizedMembership = normalizeMembershipContext(membership);
  const baseCollection = isValidAtlasPlanCollection(collection)
    ? collection
    : buildPlans(normalizedMembership, metrics, now);

  if (normalizedMembership.package === "free") {
    return {
      ...baseCollection,
      plans: [],
      primaryPlan: null,
      manualSelectionRequired: true,
      updatedAt: now,
    };
  }

  const expectedPlans = buildPlans(normalizedMembership, metrics, baseCollection.createdAt);
  const existingById = new Map(baseCollection.plans.map((plan) => [plan.id, plan]));
  const plans = expectedPlans.plans.map((expectedPlan) => {
    const existingPlan = existingById.get(expectedPlan.id);
    const nextPlan = existingPlan
      ? {
          ...expectedPlan,
          status: existingPlan.status,
          createdAt: existingPlan.createdAt,
          started: existingPlan.started,
          locked: existingPlan.locked,
          result: existingPlan.result,
        }
      : expectedPlan;

    return updateAtlasPlan(
      nextPlan,
      {
        recommendedUnit: metrics.recommendedUnit,
        riskAmount: calculateRiskAmount(metrics),
        started: nextPlan.status === "started" || nextPlan.started,
      },
      now,
    );
  });

  return {
    plans,
    primaryPlan: selectPrimaryPlan(plans, now),
    manualSelectionRequired: false,
    createdAt: baseCollection.createdAt,
    updatedAt: now,
  };
}

export function selectPrimaryPlan(plans: AtlasPlan[], now = new Date().toISOString()) {
  const nowTime = new Date(now).getTime();

  return [...plans]
    .filter((plan) => !plan.started && plan.status !== "started" && new Date(plan.startTime).getTime() > nowTime)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] ?? null;
}

export function calculatePackageExposure(metrics: FinancialMetrics) {
  return metrics.exposure.value;
}

export function isValidAtlasPlanCollection(value: unknown): value is AtlasPlanCollection {
  if (!value || typeof value !== "object") return false;

  const collection = value as Partial<AtlasPlanCollection>;

  return (
    Array.isArray(collection.plans) &&
    collection.plans.every(isValidAtlasPlan) &&
    (collection.primaryPlan === null || isValidAtlasPlan(collection.primaryPlan)) &&
    typeof collection.manualSelectionRequired === "boolean" &&
    typeof collection.createdAt === "string" &&
    typeof collection.updatedAt === "string"
  );
}

function getCandidatesForMembership(membership: MembershipContext) {
  if (membership.package === "free") return [];

  if (membership.package === "exclusive") {
    return pickTopOnePerSport(signalsDetectedMock, membership.availableSports.length > 0 ? membership.availableSports : ALL_SIGNAL_SPORTS);
  }

  if (membership.package === "unlimited") {
    return pickTopOnePerSport(premiumTopFiveMock, membership.availableSports.length > 0 ? membership.availableSports : ALL_PREMIUM_SPORTS);
  }

  return pickTopOnePerSport(premiumTopFiveMock, membership.selectedSport ? [membership.selectedSport] : ["MLB"]);
}

function pickTopOnePerSport(candidates: PackagePlanCandidate[], sports: AtlasPlanSport[]) {
  return sports
    .map((sport) => candidates
      .filter((candidate) => candidate.sport === sport)
      .sort((a, b) => a.rank - b.rank)[0])
    .filter((candidate): candidate is PackagePlanCandidate => Boolean(candidate));
}

function createPlanFromCandidate(
  candidate: PackagePlanCandidate,
  planPackage: AtlasPlanPackage,
  metrics: FinancialMetrics,
  now: string,
): AtlasPlan {
  return {
    id: `atlas-plan-${planPackage}-${candidate.id}`,
    sport: candidate.sport,
    league: candidate.league,
    selection: candidate.selection,
    market: candidate.market,
    odds: candidate.odds,
    status: "pending",
    package: planPackage,
    recommendedUnit: metrics.recommendedUnit,
    riskAmount: calculateRiskAmount(metrics),
    startTime: new Date(new Date(now).getTime() + candidate.startsInMinutes * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now,
    source: candidate.source,
    rank: candidate.rank,
    locked: false,
    started: false,
    result: null,
  };
}

function createCandidate(
  id: string,
  sport: AtlasPlanSport,
  selection: string,
  market: string,
  odds: number,
  source: AtlasPlanSource,
  startsInMinutes: number,
  rank = 1,
): PackagePlanCandidate {
  return {
    id,
    sport,
    league: sport,
    selection,
    market,
    odds,
    rank,
    source,
    startsInMinutes,
  };
}

function isValidMembershipContext(value: unknown): value is MembershipContext {
  if (!value || typeof value !== "object") return false;

  const membership = value as Partial<MembershipContext>;

  return (
    isAtlasPlanPackage(membership.package) &&
    (membership.selectedSport === null || isAtlasPlanSport(membership.selectedSport)) &&
    Array.isArray(membership.availableSports) &&
    membership.availableSports.every(isAtlasPlanSport)
  );
}

function isAtlasPlanPackage(value: unknown): value is AtlasPlanPackage {
  return value === "free" || value === "exclusive" || value === "premium" || value === "unlimited";
}

function isAtlasPlanSport(value: unknown): value is AtlasPlanSport {
  return value === "MLB" || value === "NBA" || value === "NFL" || value === "NHL" || value === "SOCCER";
}
