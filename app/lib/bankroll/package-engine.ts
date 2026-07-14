import { calculateRiskAmount, isValidAtlasPlan, updateAtlasPlan } from "./atlas-plan";
import { evaluateCollectionReplacements, lockStartedPlans } from "./replacement-engine";
import type {
  AtlasPlan,
  AtlasPlanCandidate,
  AtlasPlanCollection,
  AtlasPlanPackage,
  AtlasPlanSource,
  AtlasPlanStatus,
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
  status: AtlasPlanStatus;
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
  createCandidate("signals-mlb-3", "MLB", "Mets ML", "Moneyline", -112, "signals", 310, 3),
  createCandidate("signals-nba-1", "NBA", "Celtics ML", "Moneyline", -130, "signals", 220),
  createCandidate("signals-nba-2", "NBA", "Knicks ML", "Moneyline", -118, "signals", 260, 2),
  createCandidate("signals-nba-3", "NBA", "Lakers ML", "Moneyline", -110, "signals", 320, 3),
  createCandidate("signals-nfl-1", "NFL", "Chiefs ML", "Moneyline", -125, "signals", 310),
  createCandidate("signals-nfl-2", "NFL", "Eagles ML", "Moneyline", -115, "signals", 360, 2),
  createCandidate("signals-nfl-3", "NFL", "Bills ML", "Moneyline", -105, "signals", 410, 3),
  createCandidate("signals-nhl-1", "NHL", "Rangers ML", "Moneyline", -118, "signals", 280),
  createCandidate("signals-nhl-2", "NHL", "Bruins ML", "Moneyline", -112, "signals", 340, 2),
  createCandidate("signals-nhl-3", "NHL", "Stars ML", "Moneyline", -108, "signals", 390, 3),
];

const premiumTopFiveMock: PackagePlanCandidate[] = [
  createCandidate("premium-mlb-1", "MLB", "Dodgers ML", "Moneyline", -135, "top5", 180),
  createCandidate("premium-mlb-2", "MLB", "Braves ML", "Moneyline", -122, "top5", 240, 2),
  createCandidate("premium-mlb-3", "MLB", "Phillies ML", "Moneyline", -118, "top5", 300, 3),
  createCandidate("premium-mlb-4", "MLB", "Padres ML", "Moneyline", -108, "top5", 360, 4),
  createCandidate("premium-mlb-5", "MLB", "Orioles ML", "Moneyline", 102, "top5", 420, 5),
  createCandidate("premium-nba-1", "NBA", "Celtics ML", "Moneyline", -140, "top5", 210),
  createCandidate("premium-nba-2", "NBA", "Nuggets ML", "Moneyline", -130, "top5", 270, 2),
  createCandidate("premium-nba-3", "NBA", "Knicks ML", "Moneyline", -120, "top5", 330, 3),
  createCandidate("premium-nba-4", "NBA", "Lakers ML", "Moneyline", -112, "top5", 390, 4),
  createCandidate("premium-nba-5", "NBA", "Suns ML", "Moneyline", 105, "top5", 450, 5),
  createCandidate("premium-nfl-1", "NFL", "Chiefs ML", "Moneyline", -135, "top5", 300),
  createCandidate("premium-nfl-2", "NFL", "Eagles ML", "Moneyline", -128, "top5", 360, 2),
  createCandidate("premium-nfl-3", "NFL", "Bills ML", "Moneyline", -116, "top5", 420, 3),
  createCandidate("premium-nfl-4", "NFL", "Ravens ML", "Moneyline", -110, "top5", 480, 4),
  createCandidate("premium-nfl-5", "NFL", "Lions ML", "Moneyline", 100, "top5", 540, 5),
  createCandidate("premium-nhl-1", "NHL", "Rangers ML", "Moneyline", -125, "top5", 270),
  createCandidate("premium-nhl-2", "NHL", "Bruins ML", "Moneyline", -120, "top5", 330, 2),
  createCandidate("premium-nhl-3", "NHL", "Stars ML", "Moneyline", -112, "top5", 390, 3),
  createCandidate("premium-nhl-4", "NHL", "Avalanche ML", "Moneyline", -106, "top5", 450, 4),
  createCandidate("premium-nhl-5", "NHL", "Panthers ML", "Moneyline", 104, "top5", 510, 5),
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
  const candidates = getTopCandidatesForMembership(normalizedMembership);
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
  const candidates = getPlanCandidatesForMembership(normalizedMembership, now);
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
          candidateId: existingPlan.candidateId,
          selection: existingPlan.selection,
          market: existingPlan.market,
          odds: existingPlan.odds,
          startTime: existingPlan.startTime,
          source: existingPlan.source,
          rank: existingPlan.rank,
          originalRank: existingPlan.originalRank,
          replacementHistory: existingPlan.replacementHistory,
          createdAt: existingPlan.createdAt,
          started: existingPlan.started,
          locked: existingPlan.locked,
          result: existingPlan.result,
          completedAt: existingPlan.completedAt ?? null,
          profit: existingPlan.profit ?? 0,
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
  const lockedPlans = lockStartedPlans(plans, now);
  const replacedPlans = evaluateCollectionReplacements(lockedPlans, candidates, normalizedMembership, metrics, now);

  return {
    plans: replacedPlans,
    primaryPlan: selectPrimaryPlan(replacedPlans, now),
    manualSelectionRequired: false,
    createdAt: baseCollection.createdAt,
    updatedAt: now,
  };
}

export function selectPrimaryPlan(plans: AtlasPlan[], now = new Date().toISOString()) {
  const nowTime = new Date(now).getTime();

  return [...plans]
    .filter((plan) => !plan.started && (plan.status === "pending" || plan.status === "confirmed") && new Date(plan.startTime).getTime() > nowTime)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] ?? null;
}

export function calculatePackageExposure(metrics: FinancialMetrics) {
  return metrics.exposure.value;
}

export function getPlanCandidatesForMembership(membership: MembershipContext, now = new Date().toISOString()): AtlasPlanCandidate[] {
  const normalizedMembership = normalizeMembershipContext(membership);

  return getCandidatesForMembership(normalizedMembership).map((candidate) => ({
    candidateId: candidate.id,
    sport: candidate.sport,
    league: candidate.league,
    selection: candidate.selection,
    market: candidate.market,
    odds: candidate.odds,
    status: candidate.status,
    package: normalizedMembership.package,
    startTime: new Date(new Date(now).getTime() + candidate.startsInMinutes * 60 * 1000).toISOString(),
    source: candidate.source,
    rank: candidate.rank,
  }));
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
    return pickCandidatesBySports(signalsDetectedMock, membership.availableSports.length > 0 ? membership.availableSports : ALL_SIGNAL_SPORTS, 3);
  }

  if (membership.package === "unlimited") {
    return pickCandidatesBySports(premiumTopFiveMock, membership.availableSports.length > 0 ? membership.availableSports : ALL_PREMIUM_SPORTS, 5);
  }

  return pickCandidatesBySports(premiumTopFiveMock, membership.selectedSport ? [membership.selectedSport] : ["MLB"], 5);
}

function getTopCandidatesForMembership(membership: MembershipContext) {
  return pickTopOnePerSport(getCandidatesForMembership(membership), membership.availableSports.length > 0 ? membership.availableSports : ALL_PREMIUM_SPORTS);
}

function pickCandidatesBySports(candidates: PackagePlanCandidate[], sports: AtlasPlanSport[], maxRank: number) {
  return candidates
    .filter((candidate) => sports.includes(candidate.sport) && candidate.rank <= maxRank)
    .sort((a, b) => a.sport.localeCompare(b.sport) || a.rank - b.rank);
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
    id: `atlas-plan-${planPackage}-${candidate.sport.toLowerCase()}`,
    candidateId: candidate.id,
    sport: candidate.sport,
    league: candidate.league,
    selection: candidate.selection,
    market: candidate.market,
    odds: candidate.odds,
    status: candidate.status,
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
    completedAt: null,
    profit: 0,
    originalRank: candidate.rank,
    plannedExposure: metrics.exposure.value,
    replacementHistory: [],
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
  status: AtlasPlanStatus = "pending",
): PackagePlanCandidate {
  return {
    id,
    sport,
    league: sport,
    selection,
    market,
    odds,
    status,
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
