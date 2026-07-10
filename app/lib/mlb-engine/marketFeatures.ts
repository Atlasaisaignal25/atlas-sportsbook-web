import type {
  ConsensusMovement,
  OddsMarketKey,
  OddsMovement,
  OddsSnapshot,
} from "@/types/oddsMovement";
import { buildConsensusMovement } from "@/lib/market-impact/odds/buildConsensusMovement";
import { calculateOddsMovement } from "@/lib/market-impact/odds/calculateOddsMovement";

export type OutcomeMarketFeatures = {
  bookCount: number;
  averagePrice: number | null;
  medianPrice: number | null;
  bestPrice: number | null;
  worstPrice: number | null;
  priceSpread: number | null;
  noVigProbabilityPct: number | null;
  latestUpdatedAt: string | null;
  isStale: boolean;
};

export type MarketMovementFeatures = {
  eventId: string;
  marketKey: OddsMarketKey;
  outcomeName: string;
  direction: ConsensusMovement["direction"];
  impact: ConsensusMovement["impact"];
  status: ConsensusMovement["status"];
  sportsbookCount: number;
  monitoredSportsbookCount: number;
  consensusPercent: number;
  magnitudeScore: number;
  movementStartedAt: string;
  detectedAt: string;
};

type OddsOutcome = {
  name?: string;
  price?: number;
  point?: number;
};

type OddsMarket = {
  key?: string;
  outcomes?: OddsOutcome[];
  last_update?: string;
};

type OddsBookmaker = {
  key?: string;
  title?: string;
  last_update?: string;
  markets?: OddsMarket[];
};

const MLB_STALE_ODDS_MINUTES = 240;

export function normalizeMlbMarketName(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function americanOddsToImpliedProbability(odds: number) {
  if (!Number.isFinite(odds) || odds === 0) return null;
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

export function noVigTwoWayProbabilities(firstOdds: number, secondOdds: number) {
  const first = americanOddsToImpliedProbability(firstOdds);
  const second = americanOddsToImpliedProbability(secondOdds);
  if (first === null || second === null) return null;

  const total = first + second;
  if (!Number.isFinite(total) || total <= 0) return null;

  return {
    first: first / total,
    second: second / total,
    hold: total - 1,
  };
}

export function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;

  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[midpoint];

  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function marketOutcomeFeatureKey(
  marketKey: OddsMarketKey,
  name: string,
  point?: number | null,
) {
  const normalizedPoint = point === null || point === undefined ? "" : String(Number(point));
  return `${marketKey}:${normalizeMlbMarketName(name)}:${normalizedPoint}`;
}

export function marketMovementFeatureKey(
  eventId: string,
  marketKey: OddsMarketKey,
  outcomeName: string,
) {
  return `${eventId}:${marketKey}:${normalizeMlbMarketName(outcomeName)}`;
}

function collectNoVigSamples(marketKey: OddsMarketKey, outcomes: OddsOutcome[]) {
  const samples = new Map<string, number[]>();
  const usable = outcomes.filter((outcome) => {
    if (!outcome.name || !Number.isFinite(Number(outcome.price))) return false;
    return !(marketKey === "h2h" && normalizeMlbMarketName(outcome.name) === "draw");
  });

  const pairs =
    marketKey === "totals"
      ? groupByPoint(usable).filter((group) => group.length === 2)
      : usable.length === 2
        ? [usable]
        : [];

  pairs.forEach(([first, second]) => {
    const noVig = noVigTwoWayProbabilities(Number(first.price), Number(second.price));
    if (!noVig) return;

    const firstKey = marketOutcomeFeatureKey(marketKey, first.name ?? "", first.point);
    const secondKey = marketOutcomeFeatureKey(marketKey, second.name ?? "", second.point);
    samples.set(firstKey, [...(samples.get(firstKey) ?? []), noVig.first]);
    samples.set(secondKey, [...(samples.get(secondKey) ?? []), noVig.second]);
  });

  return samples;
}

function groupByPoint(outcomes: OddsOutcome[]) {
  const groups = new Map<string, OddsOutcome[]>();

  outcomes.forEach((outcome) => {
    const key = outcome.point === undefined ? "none" : String(Number(outcome.point));
    groups.set(key, [...(groups.get(key) ?? []), outcome]);
  });

  return Array.from(groups.values());
}

function latestIso(first: string | null, second: string | null) {
  if (!first) return second;
  if (!second) return first;
  return new Date(first).getTime() >= new Date(second).getTime() ? first : second;
}

function isStale(latestUpdatedAt: string | null, now = new Date()) {
  if (!latestUpdatedAt) return false;
  const updatedMs = new Date(latestUpdatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return false;
  return now.getTime() - updatedMs > MLB_STALE_ODDS_MINUTES * 60000;
}

export function collectOutcomeMarketFeatures(
  bookmakers: OddsBookmaker[] = [],
  marketKey: OddsMarketKey,
  now = new Date(),
) {
  const pricesByKey = new Map<string, number[]>();
  const booksByKey = new Map<string, Set<string>>();
  const noVigByKey = new Map<string, number[]>();
  const latestUpdateByKey = new Map<string, string | null>();

  bookmakers.forEach((bookmaker) => {
    const market = bookmaker.markets?.find((item) => item.key === marketKey);
    if (!market || !Array.isArray(market.outcomes)) return;

    const bookmakerName = bookmaker.title ?? bookmaker.key ?? "Sportsbook";
    const lastUpdate = market.last_update ?? bookmaker.last_update ?? null;
    const noVigSamples = collectNoVigSamples(marketKey, market.outcomes);

    market.outcomes.forEach((outcome) => {
      const price = Number(outcome.price);
      if (!outcome.name || !Number.isFinite(price)) return;
      if (marketKey === "h2h" && normalizeMlbMarketName(outcome.name) === "draw") return;

      const key = marketOutcomeFeatureKey(marketKey, outcome.name, outcome.point);
      pricesByKey.set(key, [...(pricesByKey.get(key) ?? []), price]);

      const books = booksByKey.get(key) ?? new Set<string>();
      books.add(bookmakerName);
      booksByKey.set(key, books);

      const noVig = noVigSamples.get(key);
      if (noVig) noVigByKey.set(key, [...(noVigByKey.get(key) ?? []), ...noVig]);

      latestUpdateByKey.set(key, latestIso(latestUpdateByKey.get(key) ?? null, lastUpdate));
    });
  });

  const features = new Map<string, OutcomeMarketFeatures>();

  pricesByKey.forEach((prices, key) => {
    const bestPrice = Math.max(...prices);
    const worstPrice = Math.min(...prices);
    const averagePrice =
      prices.length > 0
        ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
        : null;
    const medianPrice = median(prices);
    const noVigMedian = median(noVigByKey.get(key) ?? []);
    const latestUpdatedAt = latestUpdateByKey.get(key) ?? null;

    features.set(key, {
      bookCount: booksByKey.get(key)?.size ?? 0,
      averagePrice,
      medianPrice,
      bestPrice: Number.isFinite(bestPrice) ? bestPrice : null,
      worstPrice: Number.isFinite(worstPrice) ? worstPrice : null,
      priceSpread:
        Number.isFinite(bestPrice) && Number.isFinite(worstPrice) ? bestPrice - worstPrice : null,
      noVigProbabilityPct: noVigMedian === null ? null : Number((noVigMedian * 100).toFixed(1)),
      latestUpdatedAt,
      isStale: isStale(latestUpdatedAt, now),
    });
  });

  return features;
}

export function isQualifiedMlbMarketContext(features?: Pick<OutcomeMarketFeatures, "bookCount" | "isStale"> | null) {
  return Boolean(features && features.bookCount >= 2 && !features.isStale);
}

export function buildConsensusMovementFromSnapshots(
  snapshots: OddsSnapshot[],
  monitoredSportsbookCountByEvent = new Map<string, number>(),
) {
  const grouped = new Map<string, OddsSnapshot[]>();

  snapshots.forEach((snapshot) => {
    const key = [
      snapshot.eventId,
      snapshot.bookmaker,
      snapshot.marketKey,
      snapshot.outcomeName,
    ].join(":");
    grouped.set(key, [...(grouped.get(key) ?? []), snapshot]);
  });

  const movements: OddsMovement[] = [];
  grouped.forEach((group) => {
    const sorted = [...group].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    );
    const previous = sorted[0] ?? null;
    const current = sorted[sorted.length - 1];
    if (!current) return;

    const movement = calculateOddsMovement(previous, current);
    if (movement) movements.push(movement);
  });

  return buildConsensusMovement({ movements, monitoredSportsbookCountByEvent });
}

export function buildMarketMovementFeatureMap(consensus: ConsensusMovement[]) {
  const features = new Map<string, MarketMovementFeatures>();

  consensus.forEach((movement) => {
    features.set(
      marketMovementFeatureKey(movement.eventId, movement.marketKey, movement.outcomeName),
      {
        eventId: movement.eventId,
        marketKey: movement.marketKey,
        outcomeName: movement.outcomeName,
        direction: movement.direction,
        impact: movement.impact,
        status: movement.status,
        sportsbookCount: movement.sportsbookCount,
        monitoredSportsbookCount: movement.monitoredSportsbookCount,
        consensusPercent: movement.consensusPercent,
        magnitudeScore: movement.magnitudeScore,
        movementStartedAt: movement.movementStartedAt,
        detectedAt: movement.detectedAt,
      },
    );
  });

  return features;
}
