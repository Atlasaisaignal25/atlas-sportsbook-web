import type {
  PrecisionCandidate,
  PrecisionDecision,
  PrecisionPreview,
  PrecisionSport,
} from "./types";
import { buildPrecisionTimeline } from "./timeline";

const MIN_PRECISION_ODDS = -150;
const MAX_PRECISION_ODDS = 120;

function normalizeMarket(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isHalfPointLine(value: unknown) {
  const line = Number(value);
  if (!Number.isFinite(line)) return false;

  return Math.abs(line % 1) === 0.5;
}

function isOddsQualified(value: unknown) {
  const odds = Number(value);

  return (
    Number.isFinite(odds) &&
    odds >= MIN_PRECISION_ODDS &&
    odds <= MAX_PRECISION_ODDS
  );
}

function isLineQualified(candidate: PrecisionCandidate) {
  const market = normalizeMarket(candidate.market);

  if (market === "h2h") return true;
  if (market === "totals") return isHalfPointLine(candidate.line);
  if (candidate.sport === "SOCCER" && market === "spreads") {
    return isHalfPointLine(candidate.line);
  }

  return market === "spreads";
}

function isMarketQualified(candidate: PrecisionCandidate) {
  const market = normalizeMarket(candidate.market);
  return market === "h2h" || market === "spreads" || market === "totals";
}

function isStartTimeQualified(candidate: PrecisionCandidate) {
  if (!candidate.startTime) return true;

  const start = new Date(candidate.startTime).getTime();
  if (!Number.isFinite(start)) return false;

  return start > Date.now();
}

function impliedProbabilityScore(odds: number) {
  const impliedProbability =
    odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);

  return Math.round(impliedProbability * 10000);
}

function marketWeight(candidate: PrecisionCandidate) {
  const market = normalizeMarket(candidate.market);

  if (market === "spreads") return 340;
  if (market === "totals") return 300;
  if (market === "h2h") return 250;

  return 0;
}

function priceValueScore(odds: number) {
  if (odds > 0) return 240 + Math.min(odds, MAX_PRECISION_ODDS);
  return Math.max(0, odds + Math.abs(MIN_PRECISION_ODDS)) + 140;
}

function sourceModelScore(candidate: PrecisionCandidate) {
  const score = Number(
    candidate.internalScore ??
      candidate.confidence ??
      candidate.edge ??
      0
  );

  if (!Number.isFinite(score) || score <= 0) return 0;

  return Math.min(Math.round(score), 10000);
}

function timingScore(candidate: PrecisionCandidate) {
  if (!candidate.startTime) return 0;

  const start = new Date(candidate.startTime).getTime();
  if (!Number.isFinite(start)) return 0;

  const hoursUntilStart = (start - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilStart < 0) return -1000;
  if (hoursUntilStart <= 2) return 180;
  if (hoursUntilStart <= 8) return 130;
  if (hoursUntilStart <= 18) return 80;

  return 20;
}

export function getPrecisionFilters(candidate: PrecisionCandidate) {
  return {
    oddsQualified: isOddsQualified(candidate.odds),
    lineQualified: isLineQualified(candidate),
    marketQualified: isMarketQualified(candidate),
    startTimeQualified: isStartTimeQualified(candidate),
  };
}

export function isPrecisionQualified(candidate: PrecisionCandidate) {
  const filters = getPrecisionFilters(candidate);

  return (
    filters.oddsQualified &&
    filters.lineQualified &&
    filters.marketQualified &&
    filters.startTimeQualified
  );
}

export function scorePrecisionCandidate(candidate: PrecisionCandidate) {
  const odds = Number(candidate.odds);

  if (!isOddsQualified(odds)) return 0;

  return (
    impliedProbabilityScore(odds) +
    marketWeight(candidate) +
    priceValueScore(odds) +
    Math.round(sourceModelScore(candidate) * 0.22) +
    timingScore(candidate)
  );
}

function releaseAt(candidate: PrecisionCandidate) {
  if (!candidate.startTime) return null;

  const start = new Date(candidate.startTime).getTime();
  if (!Number.isFinite(start)) return null;

  return new Date(start - 60 * 60 * 1000).toISOString();
}

function buildReasons(candidate: PrecisionCandidate, score: number) {
  const market = normalizeMarket(candidate.market);
  const odds = Number(candidate.odds);
  const reasons = [
    `Precision score ${score} from candidate pool, independent from Top 5 ranking.`,
    `Odds ${odds > 0 ? `+${odds}` : odds} qualified inside Atlas precision range.`,
    `${market || "market"} profile passed product-specific filters.`,
  ];

  if (candidate.analysisSummary) {
    reasons.push(candidate.analysisSummary);
  }

  if (candidate.modelFactors?.length) {
    reasons.push(...candidate.modelFactors.slice(0, 3));
  }

  return reasons;
}

function makeDecision(
  product: "top_signal" | "top_play",
  candidate: PrecisionCandidate
): PrecisionDecision {
  const precisionScore = scorePrecisionCandidate(candidate);
  const timeline = buildPrecisionTimeline({ candidate, qualified: true });

  return {
    product,
    sport: candidate.sport,
    candidate,
    precisionScore,
    releaseAt: releaseAt(candidate),
    timeline,
    filters: getPrecisionFilters(candidate),
    reasons: buildReasons(candidate, precisionScore),
  };
}

function sortCandidates(candidates: PrecisionCandidate[]) {
  return [...candidates].sort((a, b) => {
    const scoreDifference = scorePrecisionCandidate(b) - scorePrecisionCandidate(a);
    if (scoreDifference !== 0) return scoreDifference;

    const aStart = a.startTime ? new Date(a.startTime).getTime() : Number.POSITIVE_INFINITY;
    const bStart = b.startTime ? new Date(b.startTime).getTime() : Number.POSITIVE_INFINITY;

    return aStart - bStart;
  });
}

export function selectTopSignalForSport(
  candidates: PrecisionCandidate[],
  sport: PrecisionSport
) {
  const best = sortCandidates(
    candidates.filter((candidate) => candidate.sport === sport && isPrecisionQualified(candidate))
  )[0];

  return best ? makeDecision("top_signal", best) : null;
}

export function selectTopPlay(candidates: PrecisionCandidate[]) {
  const best = sortCandidates(candidates.filter(isPrecisionQualified))[0];

  return best ? makeDecision("top_play", best) : null;
}

export function buildPrecisionPreview(
  candidates: PrecisionCandidate[],
  date: string
): PrecisionPreview {
  const qualified = candidates.filter(isPrecisionQualified);
  const sports = Array.from(new Set(candidates.map((candidate) => candidate.sport)));
  const topSignalsBySport: PrecisionPreview["topSignalsBySport"] = {};

  for (const sport of sports) {
    const signal = selectTopSignalForSport(candidates, sport);
    if (signal) topSignalsBySport[sport] = signal;
  }

  return {
    date,
    candidateCount: candidates.length,
    qualifiedCount: qualified.length,
    topSignalsBySport,
    topPlay: selectTopPlay(candidates),
  };
}
