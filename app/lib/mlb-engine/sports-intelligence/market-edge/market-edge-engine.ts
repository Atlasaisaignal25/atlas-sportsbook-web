export const MLB_MARKET_EDGE_RESEARCH_VERSION = "mlb_market_edge_research_v1";
export const MLB_MARKET_EDGE_THRESHOLD_VERSION = "market_edge_thresholds_v1";

export type MarketEdgeMarket = "MONEYLINE" | "RUN_LINE" | "TOTALS";
export type MarketEdgeClassification = "NO_EDGE" | "SMALL_EDGE" | "MODERATE_EDGE" | "HIGH_EDGE" | "EXTREME_EDGE";
export type MarketEdgeDirection = "HOME" | "AWAY" | "OVER" | "UNDER" | "NONE";

export type MarketEdgeInput = {
  officialGameId: string;
  homeTeamId?: string | null;
  homeTeamName: string;
  awayTeamId?: string | null;
  awayTeamName: string;
  homeWinProbability?: number;
  awayWinProbability?: number;
  projectedHomeRuns?: number;
  projectedAwayRuns?: number;
  projectedTotalRuns?: number;
  fairMoneylineHome?: number | null;
  fairMoneylineAway?: number | null;
  projectionCapturedAt?: string;
  market: {
    moneyline?: {
      homeNoVigProbability?: number;
      awayNoVigProbability?: number;
      homePrice?: number | null;
      awayPrice?: number | null;
      sportsbookCount?: number;
      latestUpdatedAt?: string | null;
    };
    runLine?: {
      homeNoVigProbability?: number;
      awayNoVigProbability?: number;
      homePoint?: number | null;
      awayPoint?: number | null;
      sportsbookCount?: number;
      latestUpdatedAt?: string | null;
    };
    totals?: {
      overNoVigProbability?: number;
      underNoVigProbability?: number;
      point?: number | null;
      sportsbookCount?: number;
      latestUpdatedAt?: string | null;
    };
  };
  decision?: string | null;
  asOf?: string;
};

export type MarketEdgeSnapshot = {
  officialGameId: string;
  homeTeamId?: string | null;
  homeTeamName: string;
  awayTeamId?: string | null;
  awayTeamName: string;
  market: MarketEdgeMarket;
  atlasProbability?: number;
  marketProbability?: number;
  edge?: number;
  valuePercent?: number;
  direction: MarketEdgeDirection;
  classification: MarketEdgeClassification;
  marketContext: Record<string, unknown>;
  sourceVersions: Record<string, string | undefined>;
  modelVersion: typeof MLB_MARKET_EDGE_RESEARCH_VERSION;
  capturedAt: string;
};

export type MarketEdgeSummary = {
  bestMarket: MarketEdgeMarket | null;
  bestEdge?: number;
  confidence: "High" | "Medium" | "Low" | "Unavailable";
  decisionAlignment: "YES" | "NO" | "UNKNOWN";
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampProbability(value?: number) {
  if (!isNumber(value)) return undefined;
  if (value > 1) return Math.min(1, Math.max(0, value / 100));
  return Math.min(1, Math.max(0, value));
}

export function classifyMarketEdge(edge?: number): MarketEdgeClassification {
  if (!isNumber(edge)) return "NO_EDGE";
  if (edge <= 0) return "NO_EDGE";
  if (edge >= 0.12) return "EXTREME_EDGE";
  if (edge >= 0.08) return "HIGH_EDGE";
  if (edge >= 0.05) return "MODERATE_EDGE";
  if (edge >= 0.025) return "SMALL_EDGE";
  return "NO_EDGE";
}

function confidenceFrom(classification: MarketEdgeClassification) {
  if (classification === "EXTREME_EDGE" || classification === "HIGH_EDGE") return "High";
  if (classification === "MODERATE_EDGE") return "Medium";
  if (classification === "SMALL_EDGE" || classification === "NO_EDGE") return "Low";
  return "Unavailable";
}

function betterEdge(first: MarketEdgeSnapshot, second: MarketEdgeSnapshot) {
  return (first.edge ?? -1) >= (second.edge ?? -1) ? first : second;
}

function marketEdge(
  input: MarketEdgeInput,
  market: MarketEdgeMarket,
  direction: MarketEdgeDirection,
  atlasProbability?: number,
  marketProbability?: number,
  marketContext: Record<string, unknown> = {},
): MarketEdgeSnapshot {
  const atlas = clampProbability(atlasProbability);
  const marketProb = clampProbability(marketProbability);
  const edge = isNumber(atlas) && isNumber(marketProb) ? round(atlas - marketProb, 4) : undefined;
  const valuePercent = isNumber(edge) ? round(edge * 100, 2) : undefined;
  return {
    officialGameId: input.officialGameId,
    homeTeamId: input.homeTeamId,
    homeTeamName: input.homeTeamName,
    awayTeamId: input.awayTeamId,
    awayTeamName: input.awayTeamName,
    market,
    atlasProbability: atlas,
    marketProbability: marketProb,
    edge,
    valuePercent,
    direction: edge === undefined || edge <= 0.0001 ? "NONE" : direction,
    classification: classifyMarketEdge(edge),
    marketContext,
    sourceVersions: {
      model: MLB_MARKET_EDGE_RESEARCH_VERSION,
      thresholds: MLB_MARKET_EDGE_THRESHOLD_VERSION,
      projection: "mlb_projection_research_v1",
      market: "market_odds_snapshots",
    },
    modelVersion: MLB_MARKET_EDGE_RESEARCH_VERSION,
    capturedAt: input.asOf ?? new Date().toISOString(),
  };
}

function totalAtlasProbability(input: MarketEdgeInput, side: "OVER" | "UNDER") {
  if (!isNumber(input.projectedTotalRuns) || !isNumber(input.market.totals?.point)) return undefined;
  const delta = input.projectedTotalRuns - input.market.totals.point;
  const probability = 0.5 + Math.max(-0.18, Math.min(0.18, delta * 0.045));
  return side === "OVER" ? probability : 1 - probability;
}

function runLineAtlasProbability(input: MarketEdgeInput, side: "HOME" | "AWAY") {
  if (!isNumber(input.projectedHomeRuns) || !isNumber(input.projectedAwayRuns)) return undefined;
  const homePoint = input.market.runLine?.homePoint;
  const awayPoint = input.market.runLine?.awayPoint;
  const projectedMarginHome = input.projectedHomeRuns - input.projectedAwayRuns;
  if (side === "HOME" && isNumber(homePoint)) {
    return 0.5 + Math.max(-0.2, Math.min(0.2, (projectedMarginHome + homePoint) * 0.06));
  }
  if (side === "AWAY" && isNumber(awayPoint)) {
    return 0.5 + Math.max(-0.2, Math.min(0.2, (-projectedMarginHome + awayPoint) * 0.06));
  }
  return undefined;
}

export function buildMarketEdgeSnapshots(input: MarketEdgeInput): MarketEdgeSnapshot[] {
  const snapshots: MarketEdgeSnapshot[] = [];
  const moneyline = input.market.moneyline;
  if (moneyline) {
    const homeEdge = marketEdge(input, "MONEYLINE", "HOME", input.homeWinProbability, moneyline.homeNoVigProbability, {
      homePrice: moneyline.homePrice,
      awayPrice: moneyline.awayPrice,
      sportsbookCount: moneyline.sportsbookCount,
      latestUpdatedAt: moneyline.latestUpdatedAt,
    });
    const awayEdge = marketEdge(input, "MONEYLINE", "AWAY", input.awayWinProbability, moneyline.awayNoVigProbability, {
      homePrice: moneyline.homePrice,
      awayPrice: moneyline.awayPrice,
      sportsbookCount: moneyline.sportsbookCount,
      latestUpdatedAt: moneyline.latestUpdatedAt,
    });
    snapshots.push(betterEdge(homeEdge, awayEdge));
  }

  const runLine = input.market.runLine;
  if (runLine) {
    const homeEdge = marketEdge(input, "RUN_LINE", "HOME", runLineAtlasProbability(input, "HOME"), runLine.homeNoVigProbability, {
      homePoint: runLine.homePoint,
      awayPoint: runLine.awayPoint,
      sportsbookCount: runLine.sportsbookCount,
      latestUpdatedAt: runLine.latestUpdatedAt,
    });
    const awayEdge = marketEdge(input, "RUN_LINE", "AWAY", runLineAtlasProbability(input, "AWAY"), runLine.awayNoVigProbability, {
      homePoint: runLine.homePoint,
      awayPoint: runLine.awayPoint,
      sportsbookCount: runLine.sportsbookCount,
      latestUpdatedAt: runLine.latestUpdatedAt,
    });
    snapshots.push(betterEdge(homeEdge, awayEdge));
  }

  const totals = input.market.totals;
  if (totals) {
    const overEdge = marketEdge(input, "TOTALS", "OVER", totalAtlasProbability(input, "OVER"), totals.overNoVigProbability, {
      point: totals.point,
      sportsbookCount: totals.sportsbookCount,
      latestUpdatedAt: totals.latestUpdatedAt,
    });
    const underEdge = marketEdge(input, "TOTALS", "UNDER", totalAtlasProbability(input, "UNDER"), totals.underNoVigProbability, {
      point: totals.point,
      sportsbookCount: totals.sportsbookCount,
      latestUpdatedAt: totals.latestUpdatedAt,
    });
    snapshots.push(betterEdge(overEdge, underEdge));
  }

  return snapshots.toSorted((first, second) => (second.edge ?? -1) - (first.edge ?? -1));
}

export function summarizeMarketEdge(edges: MarketEdgeSnapshot[], decision?: string | null): MarketEdgeSummary {
  const best = edges.find((edge) => isNumber(edge.edge));
  if (!best) return { bestMarket: null, confidence: "Unavailable", decisionAlignment: "UNKNOWN" };
  const decisionText = String(decision ?? "");
  const aligns =
    best.direction === "HOME" ? decisionText.includes("HOME")
      : best.direction === "AWAY" ? decisionText.includes("AWAY")
        : best.direction === "OVER" ? decisionText.includes("OVER")
          : best.direction === "UNDER" ? decisionText.includes("UNDER")
            : false;
  return {
    bestMarket: best.market,
    bestEdge: best.edge,
    confidence: confidenceFrom(best.classification),
    decisionAlignment: decisionText ? (aligns ? "YES" : "NO") : "UNKNOWN",
  };
}
