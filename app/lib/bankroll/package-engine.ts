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
  eventId: string | null;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  market: string;
  odds: number;
  status: AtlasPlanStatus;
  rank: number;
  source: AtlasPlanSource;
  startTime: string;
};

const SOCCER_SPORT: AtlasPlanSport = "SOCCER";
const SOCCER_PREMIUM_LIMIT = 3;
const SOCCER_EXCLUSIVE_LIMIT = 3;

export type AtlasPackageSourcePick = {
  id: string;
  sport: AtlasPlanSport;
  league?: string;
  eventId?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  selection: string;
  market: string;
  odds: number;
  status: AtlasPlanStatus;
  rank?: number;
  startTime: string;
};

export type AtlasPackageSources = {
  signals: AtlasPackageSourcePick[];
  top3: AtlasPackageSourcePick[];
  top5: AtlasPackageSourcePick[];
};

export const DEFAULT_MEMBERSHIP_CONTEXT: MembershipContext = {
  package: "premium",
  selectedSport: "MLB",
  availableSports: ["MLB"],
};

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

export function buildPlans(
  membership: MembershipContext,
  metrics: FinancialMetrics,
  now = new Date().toISOString(),
  sources?: AtlasPackageSources,
): AtlasPlanCollection {
  const normalizedMembership = normalizeMembershipContext(membership);
  const candidates = getTopCandidatesForMembership(normalizedMembership, sources);
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
  sources?: AtlasPackageSources,
): AtlasPlanCollection {
  const normalizedMembership = normalizeMembershipContext(membership);
  const candidates = getPlanCandidatesForMembership(normalizedMembership, now, sources);
  const baseCollection = isValidAtlasPlanCollection(collection)
    ? collection
    : buildPlans(normalizedMembership, metrics, now, sources);

  if (normalizedMembership.package === "free") {
    return {
      ...baseCollection,
      plans: [],
      primaryPlan: null,
      manualSelectionRequired: true,
      updatedAt: now,
    };
  }

  const expectedPlans = buildPlans(normalizedMembership, metrics, baseCollection.createdAt, sources);
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

export function getPlanCandidatesForMembership(
  membership: MembershipContext,
  now = new Date().toISOString(),
  sources?: AtlasPackageSources,
): AtlasPlanCandidate[] {
  const normalizedMembership = normalizeMembershipContext(membership);

  return getCandidatesForMembership(normalizedMembership, sources).map((candidate) => toAtlasPlanCandidate(candidate, normalizedMembership.package, now));
}

export function getTrackingCandidatesForMembership(
  membership: MembershipContext,
  now = new Date().toISOString(),
  sources?: AtlasPackageSources,
): AtlasPlanCandidate[] {
  const normalizedMembership = normalizeMembershipContext(membership);

  return getCandidatesForMembership(normalizedMembership, sources, true).map((candidate) => toAtlasPlanCandidate(candidate, normalizedMembership.package, now));
}

export function normalizeAtlasPackageSources(sources?: AtlasPackageSources): { signals: PackagePlanCandidate[]; top3: PackagePlanCandidate[]; top5: PackagePlanCandidate[] } {
  return {
    signals: (sources?.signals ?? []).map((pick) => toCandidate(pick, "signals")).filter((candidate): candidate is PackagePlanCandidate => Boolean(candidate)),
    top3: (sources?.top3 ?? []).map((pick) => toCandidate(pick, "top3")).filter((candidate): candidate is PackagePlanCandidate => Boolean(candidate)),
    top5: (sources?.top5 ?? []).map((pick) => toCandidate(pick, "top5")).filter((candidate): candidate is PackagePlanCandidate => Boolean(candidate)),
  };
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

function getCandidatesForMembership(membership: MembershipContext, sources?: AtlasPackageSources, includeFreeSignals = false) {
  const liveSources = normalizeAtlasPackageSources(sources);

  if (membership.package === "free") {
    if (!includeFreeSignals) return [];
    const sports = resolveSports(membership, liveSources.signals);
    return [
      ...pickCandidatesBySports(liveSources.signals, sports.filter((sport) => sport !== SOCCER_SPORT), Number.POSITIVE_INFINITY),
      ...(sports.includes(SOCCER_SPORT) ? getSoccerFreeCandidates(liveSources) : []),
    ].sort(sortCandidatesForDisplay);
  }

  if (membership.package === "exclusive") {
    const sports = resolveSports(membership, [...liveSources.top3, ...liveSources.signals]);
    return [
      ...pickCandidatesBySports(liveSources.top3, sports.filter((sport) => sport !== SOCCER_SPORT), 3),
      ...(sports.includes(SOCCER_SPORT) ? getSoccerExclusiveCandidates(liveSources) : []),
    ].sort(sortCandidatesForDisplay);
  }

  if (membership.package === "unlimited") {
    const sports = resolveSports(membership, liveSources.top5);
    return [
      ...pickCandidatesBySports(liveSources.top5, sports.filter((sport) => sport !== SOCCER_SPORT), 5),
      ...(sports.includes(SOCCER_SPORT) ? getSoccerPremiumCandidates(liveSources) : []),
    ].sort(sortCandidatesForDisplay);
  }

  const sports = membership.selectedSport ? [membership.selectedSport] : resolveSports(membership, liveSources.top5).slice(0, 1);
  return [
    ...pickCandidatesBySports(liveSources.top5, sports.filter((sport) => sport !== SOCCER_SPORT), 5),
    ...(sports.includes(SOCCER_SPORT) ? getSoccerPremiumCandidates(liveSources) : []),
  ].sort(sortCandidatesForDisplay);
}

function getTopCandidatesForMembership(membership: MembershipContext, sources?: AtlasPackageSources) {
  const candidates = getCandidatesForMembership(membership, sources);
  return pickTopOnePerSport(candidates, resolveSports(membership, candidates));
}

function pickCandidatesBySports(candidates: PackagePlanCandidate[], sports: AtlasPlanSport[], maxRank: number) {
  return candidates
    .filter((candidate) => sports.includes(candidate.sport) && candidate.rank <= maxRank)
    .sort((a, b) => a.sport.localeCompare(b.sport) || a.rank - b.rank);
}

function getSoccerTopSignalCandidate(liveSources: ReturnType<typeof normalizeAtlasPackageSources>) {
  return liveSources.top5
    .filter((candidate) => candidate.sport === SOCCER_SPORT)
    .sort((a, b) => a.rank - b.rank)[0] ?? null;
}

function getSoccerPremiumCandidates(liveSources: ReturnType<typeof normalizeAtlasPackageSources>) {
  const topSignal = getSoccerTopSignalCandidate(liveSources);
  const topSignalKey = candidateKey(topSignal);

  return liveSources.top5
    .filter((candidate) => candidate.sport === SOCCER_SPORT && candidateKey(candidate) !== topSignalKey)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, SOCCER_PREMIUM_LIMIT)
    .map((candidate, index) => ({ ...candidate, rank: index + 1, source: "top5" as AtlasPlanSource }));
}

function getSoccerFreeCandidates(liveSources: ReturnType<typeof normalizeAtlasPackageSources>) {
  const excludedKeys = new Set([
    candidateKey(getSoccerTopSignalCandidate(liveSources)),
    ...getSoccerPremiumCandidates(liveSources).map(candidateKey),
  ].filter(Boolean));

  return liveSources.signals
    .filter((candidate) => candidate.sport === SOCCER_SPORT && !excludedKeys.has(candidateKey(candidate)))
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .map((candidate, index) => ({ ...candidate, rank: index + 1, source: "signals" as AtlasPlanSource }));
}

function getSoccerExclusiveCandidates(liveSources: ReturnType<typeof normalizeAtlasPackageSources>) {
  const top5RankByKey = new Map(
    liveSources.top5
      .filter((candidate) => candidate.sport === SOCCER_SPORT)
      .map((candidate) => [candidateKey(candidate), candidate.rank]),
  );

  return getSoccerFreeCandidates(liveSources)
    .sort((a, b) => {
      const aRank = top5RankByKey.get(candidateKey(a)) ?? Number.POSITIVE_INFINITY;
      const bRank = top5RankByKey.get(candidateKey(b)) ?? Number.POSITIVE_INFINITY;
      return aRank - bRank || new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    })
    .slice(0, SOCCER_EXCLUSIVE_LIMIT)
    .map((candidate, index) => ({ ...candidate, rank: index + 1, source: "top3" as AtlasPlanSource }));
}

function candidateKey(candidate: PackagePlanCandidate | null | undefined) {
  return candidate?.eventId || candidate?.id || "";
}

function sortCandidatesForDisplay(a: PackagePlanCandidate, b: PackagePlanCandidate) {
  return a.sport.localeCompare(b.sport) || a.rank - b.rank || new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
}

function pickTopOnePerSport(candidates: PackagePlanCandidate[], sports: AtlasPlanSport[]) {
  return sports
    .map((sport) => candidates
      .filter((candidate) => candidate.sport === sport)
      .sort((a, b) => a.rank - b.rank)[0])
    .filter((candidate): candidate is PackagePlanCandidate => Boolean(candidate));
}

function resolveSports(membership: MembershipContext, candidates: PackagePlanCandidate[]) {
  if (membership.availableSports.length > 0) return membership.availableSports;
  return Array.from(new Set(candidates.map((candidate) => candidate.sport))).sort((a, b) => a.localeCompare(b));
}

function toCandidate(pick: AtlasPackageSourcePick, source: AtlasPlanSource): PackagePlanCandidate | null {
  if (!pick.id || !pick.selection || !pick.market || !Number.isFinite(pick.odds)) return null;

  return {
    id: pick.id,
    sport: pick.sport,
    league: pick.league ?? pick.sport,
    eventId: pick.eventId ?? pick.id,
    homeTeam: pick.homeTeam ?? "",
    awayTeam: pick.awayTeam ?? "",
    selection: pick.selection,
    market: pick.market,
    odds: pick.odds,
    status: pick.status,
    rank: pick.rank ?? 1,
    source,
    startTime: pick.startTime,
  };
}

function toAtlasPlanCandidate(candidate: PackagePlanCandidate, planPackage: AtlasPlanPackage, now: string): AtlasPlanCandidate {
  return {
    candidateId: candidate.id,
    sport: candidate.sport,
    league: candidate.league,
    selection: candidate.selection,
    market: candidate.market,
    odds: candidate.odds,
    status: candidate.status,
    package: planPackage,
    startTime: candidate.startTime || now,
    source: candidate.source,
    rank: candidate.rank,
  };
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
    startTime: candidate.startTime || now,
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
