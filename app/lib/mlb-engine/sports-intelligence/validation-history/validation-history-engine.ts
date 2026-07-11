import {
  americanOddsToImpliedProbability,
  noVigTwoWayProbabilities,
  normalizeMlbMarketName,
} from "@/app/lib/mlb-engine/marketFeatures";

export const MLB_VALIDATION_HISTORY_VERSION = "mlb_validation_history_v1";

export type ValidationMarket = "MONEYLINE" | "RUN_LINE" | "TOTALS";
export type ValidationSelection = "HOME" | "AWAY" | "OVER" | "UNDER" | "NONE";
export type ValidationResult = "WON" | "LOST" | "PUSH" | "VOID" | "PENDING";

export type ValidationPregameSnapshot = {
  recordType?: "OFFICIAL" | "RESEARCH";
  officialPickId?: string | null;
  oddsEventId?: string | null;
  gameId: string;
  gameDate?: string | null;
  homeTeam: string;
  awayTeam: string;
  market: ValidationMarket;
  selection: ValidationSelection;
  atlasProbability?: number | null;
  marketProbability?: number | null;
  edge?: number | null;
  edgeClassification?: string | null;
  projectedHomeRuns?: number | null;
  projectedAwayRuns?: number | null;
  projectedTotal?: number | null;
  decision?: string | null;
  consensus?: string | null;
  consensusScore?: number | null;
  conviction?: string | null;
  convictionScore?: number | null;
  confidence?: number | null;
  noPick: boolean;
  marketLine?: number | null;
  marketPrice?: number | null;
  publishedPrice?: number | null;
  officialRank?: number | null;
  isTopSignal?: boolean;
  officialStatus?: string | null;
  officialPublishedAt?: string | null;
  modelVersions: Record<string, unknown>;
  sourceSnapshotHashes: Record<string, unknown>;
  pregameSnapshotAt: string;
};

export type ClosingEvidence = {
  closingLine?: number | null;
  closingPrice?: number | null;
  closingNoVigProbability?: number | null;
  closingTimestamp?: string | null;
};

export type FinalScoreEvidence = {
  homeScore?: number | null;
  awayScore?: number | null;
  completed: boolean;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function americanOddsProfit(price?: number | null) {
  if (!isNumber(price) || price === 0) return null;
  return price > 0 ? round(price / 100, 4) : round(100 / Math.abs(price), 4);
}

export function gradeValidationMarket(params: {
  market: ValidationMarket;
  selection: ValidationSelection;
  marketLine?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
}): ValidationResult {
  const homeScore = toNumber(params.homeScore);
  const awayScore = toNumber(params.awayScore);
  if (homeScore === null || awayScore === null) return "PENDING";
  if (params.selection === "NONE") return "VOID";

  if (params.market === "MONEYLINE") {
    if (homeScore === awayScore) return "PUSH";
    if (params.selection === "HOME") return homeScore > awayScore ? "WON" : "LOST";
    if (params.selection === "AWAY") return awayScore > homeScore ? "WON" : "LOST";
    return "VOID";
  }

  if (params.market === "RUN_LINE") {
    const line = toNumber(params.marketLine);
    if (line === null) return "PENDING";
    if (params.selection === "HOME") {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
    if (params.selection === "AWAY") {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }
    return "VOID";
  }

  if (params.market === "TOTALS") {
    const line = toNumber(params.marketLine);
    if (line === null) return "PENDING";
    const total = homeScore + awayScore;
    if (params.selection === "OVER") {
      if (total > line) return "WON";
      if (total < line) return "LOST";
      return "PUSH";
    }
    if (params.selection === "UNDER") {
      if (total < line) return "WON";
      if (total > line) return "LOST";
      return "PUSH";
    }
  }

  return "VOID";
}

export function gradeUnits(result: ValidationResult, marketPrice?: number | null) {
  if (result === "WON") return americanOddsProfit(marketPrice);
  if (result === "LOST") return -1;
  if (result === "PUSH" || result === "VOID") return 0;
  return null;
}

export function computeClosingMetrics(params: {
  marketProbability?: number | null;
  marketLine?: number | null;
  marketPrice?: number | null;
  closing?: ClosingEvidence | null;
}) {
  const closing = params.closing ?? {};
  const closingProbability = toNumber(closing.closingNoVigProbability);
  const marketProbability = toNumber(params.marketProbability);
  const closingLine = toNumber(closing.closingLine);
  const marketLine = toNumber(params.marketLine);
  const closingPrice = toNumber(closing.closingPrice);
  const marketPrice = toNumber(params.marketPrice);

  return {
    clvProbability:
      closingProbability !== null && marketProbability !== null
        ? round(closingProbability - marketProbability, 4)
        : null,
    clvPrice:
      closingPrice !== null && marketPrice !== null
        ? round(closingPrice - marketPrice, 4)
        : null,
    lineMovement:
      closingLine !== null && marketLine !== null
        ? round(closingLine - marketLine, 4)
        : null,
    priceMovement:
      closingPrice !== null && marketPrice !== null
        ? round(closingPrice - marketPrice, 4)
        : null,
  };
}

export function noVigForSelectedPrice(
  selectedPrice?: number | null,
  oppositePrice?: number | null,
) {
  if (!isNumber(selectedPrice) || !isNumber(oppositePrice)) {
    return selectedPrice === null || selectedPrice === undefined
      ? null
      : americanOddsToImpliedProbability(selectedPrice);
  }
  const probabilities = noVigTwoWayProbabilities(selectedPrice, oppositePrice);
  return probabilities?.first ?? null;
}

export function teamsKey(homeTeam: string, awayTeam: string) {
  return `${normalizeMlbMarketName(homeTeam)}|${normalizeMlbMarketName(awayTeam)}`;
}
