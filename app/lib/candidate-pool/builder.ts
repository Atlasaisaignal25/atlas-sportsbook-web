import { DEFAULT_CANDIDATE_STATUS } from "./constants";
import {
  hasValidCommenceTime,
  hasValidOdds,
  hasValidTeams,
  isGameStarted,
  isSupportedCandidateMarket,
} from "./guards";
import {
  buildCandidateId,
  normalizeCandidateSource,
  normalizeMarket,
  normalizeSport,
  normalizeTeamName,
} from "./normalizers";
import type {
  BuildCandidatePoolInput,
  CandidatePick,
  CandidatePoolResult,
  CandidateRejection,
  CandidateRiskFlag,
  CandidateSport,
  RawCandidateInput,
} from "./types";

function toIsoString(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function toSafeIsoString(value: string | Date | null) {
  if (!value || !hasValidCommenceTime(value)) return "";
  return toIsoString(value);
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTags(value: RawCandidateInput["tags"]) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function impliedProbabilityFromAmericanOdds(odds: number | null) {
  if (odds === null || odds === 0) return null;
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

function getRawCommenceTime(raw: RawCandidateInput) {
  return raw.commenceTime ?? raw.commence_time ?? raw.startTime ?? raw.start_time ?? null;
}

function getRawMarket(raw: RawCandidateInput) {
  return raw.market ?? raw.marketKey ?? raw.market_key ?? null;
}

function getRawSelection(raw: RawCandidateInput) {
  return raw.selection ?? raw.pick ?? raw.outcome ?? null;
}

function getRawLine(raw: RawCandidateInput) {
  return raw.line ?? raw.point ?? null;
}

function getRawOdds(raw: RawCandidateInput) {
  return raw.odds ?? raw.price ?? null;
}

function getRawGameId(raw: RawCandidateInput, index: number) {
  return (
    raw.gameId ??
    raw.sourceGameId ??
    raw.id ??
    [
      normalizeTeamName(raw.awayTeam ?? raw.away_team),
      normalizeTeamName(raw.homeTeam ?? raw.home_team),
      getRawCommenceTime(raw) ? String(getRawCommenceTime(raw)) : "",
      index,
    ]
      .filter(Boolean)
      .join("|")
  );
}

function rejectCandidate(params: {
  rejections: CandidateRejection[];
  sport: CandidateSport;
  candidateId?: string | null;
  gameId?: string | null;
  reason: CandidateRiskFlag;
  details?: string | Record<string, unknown> | null;
}) {
  params.rejections.push({
    candidateId: params.candidateId ?? null,
    sport: params.sport,
    gameId: params.gameId ?? null,
    reason: params.reason,
    details: params.details ?? null,
  });
}

function normalizeRawCandidate(params: {
  raw: RawCandidateInput;
  fallbackSport: CandidateSport;
  fallbackSource: string;
  generatedAt: string;
  index: number;
}) {
  const sport = normalizeSport(params.raw.sport) ?? params.fallbackSport;
  const source = normalizeCandidateSource(params.raw.source ?? params.fallbackSource);
  const gameId = String(getRawGameId(params.raw, params.index));
  const sourceGameId = params.raw.sourceGameId ?? params.raw.id ?? null;
  const commenceTimeValue = getRawCommenceTime(params.raw);
  const homeTeam = normalizeTeamName(params.raw.homeTeam ?? params.raw.home_team);
  const awayTeam = normalizeTeamName(params.raw.awayTeam ?? params.raw.away_team);
  const market = normalizeMarket(getRawMarket(params.raw));
  const selection = normalizeTeamName(getRawSelection(params.raw));
  const line = toNullableNumber(getRawLine(params.raw));
  const odds = toNullableNumber(getRawOdds(params.raw));
  const bookmaker = params.raw.bookmaker ?? params.raw.sportsbook ?? null;
  const id = buildCandidateId({
    sport,
    gameId,
    market,
    selection,
    line,
    bookmaker,
  });

  return {
    candidate: {
      id,
      sport,
      source,
      sourceGameId,
      gameId,
      commenceTime: toSafeIsoString(commenceTimeValue),
      homeTeam,
      awayTeam,
      league: params.raw.league ?? null,
      market,
      selection,
      line,
      odds,
      bookmaker,
      bookCount: toNullableNumber(params.raw.bookCount ?? params.raw.book_count),
      averagePrice: toNullableNumber(params.raw.averagePrice ?? params.raw.average_price),
      bestPrice: toNullableNumber(params.raw.bestPrice ?? params.raw.best_price ?? odds),
      priceSpread: toNullableNumber(params.raw.priceSpread ?? params.raw.price_spread),
      impliedProbability: impliedProbabilityFromAmericanOdds(odds),
      edge: null,
      confidence: null,
      valuePriority: null,
      marketConsensus: null,
      steamScore: null,
      sharpScore: null,
      liquidityScore: null,
      rlmScore: null,
      closingLineProjection: null,
      riskFlags: [],
      tags: normalizeTags(params.raw.tags),
      status: DEFAULT_CANDIDATE_STATUS,
      createdAt: params.generatedAt,
      updatedAt: params.generatedAt,
      raw: params.raw.raw ?? params.raw,
    } satisfies CandidatePick,
    rawCommenceTime: commenceTimeValue,
  };
}

export function buildCandidatePool(input: BuildCandidatePoolInput): CandidatePoolResult {
  const sport = normalizeSport(input.sport);
  const generatedAt = input.generatedAt ? toIsoString(input.generatedAt) : new Date().toISOString();
  const now = input.now ?? new Date();
  const warnings = input.sources.flatMap((source) => source.warnings ?? []);
  const rejections: CandidateRejection[] = [];
  const candidates: CandidatePick[] = [];
  const seenCandidateIds = new Set<string>();
  const seenGameIds = new Set<string>();
  let totalRawCandidates = 0;

  if (!sport) {
    throw new Error("Candidate Pool requires a supported sport.");
  }

  input.sources.forEach((sourceInput) => {
    const sourceRows = sourceInput.candidates ?? sourceInput.games ?? [];

    sourceRows.forEach((raw, index) => {
      totalRawCandidates += 1;

      const { candidate, rawCommenceTime } = normalizeRawCandidate({
        raw,
        fallbackSport: sport,
        fallbackSource: sourceInput.source,
        generatedAt,
        index,
      });

      seenGameIds.add(candidate.gameId);

      if (!hasValidTeams(candidate.homeTeam, candidate.awayTeam)) {
        rejectCandidate({
          rejections,
          sport,
          candidateId: candidate.id,
          gameId: candidate.gameId,
          reason: "missing_team",
          details: { homeTeam: candidate.homeTeam, awayTeam: candidate.awayTeam },
        });
        return;
      }

      if (!hasValidCommenceTime(rawCommenceTime)) {
        rejectCandidate({
          rejections,
          sport,
          candidateId: candidate.id,
          gameId: candidate.gameId,
          reason: "invalid_time",
          details: { commenceTime: rawCommenceTime },
        });
        return;
      }

      if (isGameStarted(candidate.commenceTime, now)) {
        rejectCandidate({
          rejections,
          sport,
          candidateId: candidate.id,
          gameId: candidate.gameId,
          reason: "game_started",
          details: { commenceTime: candidate.commenceTime },
        });
        return;
      }

      if (!isSupportedCandidateMarket(candidate.market)) {
        rejectCandidate({
          rejections,
          sport,
          candidateId: candidate.id,
          gameId: candidate.gameId,
          reason: "unsupported_market",
          details: { market: candidate.market },
        });
        return;
      }

      if (!hasValidOdds(candidate.odds)) {
        rejectCandidate({
          rejections,
          sport,
          candidateId: candidate.id,
          gameId: candidate.gameId,
          reason: "missing_odds",
          details: { odds: candidate.odds },
        });
        return;
      }

      if (!candidate.selection) {
        rejectCandidate({
          rejections,
          sport,
          candidateId: candidate.id,
          gameId: candidate.gameId,
          reason: "unknown",
          details: "Candidate selection is required.",
        });
        return;
      }

      if (seenCandidateIds.has(candidate.id)) {
        rejectCandidate({
          rejections,
          sport,
          candidateId: candidate.id,
          gameId: candidate.gameId,
          reason: "duplicate_candidate",
          details: "A candidate with this normalized identity already exists.",
        });
        return;
      }

      seenCandidateIds.add(candidate.id);
      candidates.push({
        ...candidate,
        status: "normalized",
      });
    });
  });

  return {
    sport,
    date: input.date,
    generatedAt,
    totalGames: seenGameIds.size,
    totalCandidates: totalRawCandidates,
    eligibleCandidates: candidates.length,
    rejectedCandidates: rejections.length,
    candidates,
    rejections,
    warnings,
  };
}
