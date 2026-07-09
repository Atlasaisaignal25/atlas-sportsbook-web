import type { PrecisionCandidate, PrecisionMarket, PrecisionSport } from "@/app/lib/precision-engine";
import type { CandidateMarket, CandidatePick, CandidateSport } from "../types";

const sportMap: Record<CandidateSport, PrecisionSport> = {
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  nfl: "NFL",
  soccer: "SOCCER",
};

const marketMap: Partial<Record<CandidateMarket, PrecisionMarket>> = {
  h2h: "h2h",
  spread: "spreads",
  total: "totals",
};

function rawValue<T>(raw: unknown, snakeKey: string, camelKey: string): T | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return (record[snakeKey] ?? record[camelKey] ?? null) as T | null;
}

function normalizeModelFactors(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return null;
}

export function candidatePickToPrecisionCandidate(
  candidate: CandidatePick,
  date: string
): PrecisionCandidate {
  const raw = candidate.raw;

  return {
    id: candidate.id,
    sport: sportMap[candidate.sport],
    date,
    gameId: candidate.gameId,
    awayTeam: candidate.awayTeam,
    homeTeam: candidate.homeTeam,
    pick: candidate.selection,
    market: marketMap[candidate.market] ?? candidate.market,
    line: candidate.line,
    odds: candidate.odds,
    startTime: candidate.commenceTime,
    status: candidate.status,
    confidence: candidate.confidence ?? rawValue<number>(raw, "confidence", "confidence"),
    internalScore:
      candidate.valuePriority ??
      rawValue<number>(raw, "internal_score", "internalScore") ??
      rawValue<number>(raw, "value_priority", "valuePriority"),
    edge: candidate.edge ?? rawValue<number>(raw, "edge", "edge"),
    analysisSummary: rawValue<string>(raw, "analysis_summary", "analysisSummary"),
    confidenceLabel: rawValue<string>(raw, "confidence_label", "confidenceLabel"),
    edgeLabel: rawValue<string>(raw, "edge_label", "edgeLabel"),
    riskNote: rawValue<string>(raw, "risk_note", "riskNote"),
    modelFactors: normalizeModelFactors(rawValue<unknown>(raw, "model_factors", "modelFactors")),
  };
}

export function candidatePicksToPrecisionCandidates(
  candidates: CandidatePick[],
  date: string
): PrecisionCandidate[] {
  return candidates.map((candidate) => candidatePickToPrecisionCandidate(candidate, date));
}
