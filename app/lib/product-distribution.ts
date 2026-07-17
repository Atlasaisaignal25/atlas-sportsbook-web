export type AtlasDistributionProduct =
  | "master_signal_pool"
  | "initial_reserved_pool"
  | "signals_detected"
  | "exclusive_top3"
  | "dynamic_candidate_pool"
  | "top_signal"
  | "premium"
  | "unlimited";

/**
 * Universal Product Distribution Engine contract.
 *
 * Detection engines own only the initial ranked input.
 * This module owns only product distribution. It never recalculates confidence,
 * never changes base ranking inputs, and never writes to storage.
 *
 * Product source rules:
 * - FREE: frozen Signals Detected, sourced only from Master Signal Pool ranks 4+.
 * - EXCLUSIVE: frozen Top 3, sourced only from frozen Signals Detected.
 * - DYNAMIC CANDIDATE POOL: sourced only from Initial Reserved Pool + Signals Detected.
 * - TOP SIGNAL: position 1 of the future Dynamic Ranking.
 * - PREMIUM: positions 2, 3 and 4 of the future Dynamic Ranking.
 * - UNLIMITED: complete future Dynamic Ranking.
 *
 * Dynamic Validation Engine integration point:
 * it may read dynamicCandidatePool only. It must never read or mutate
 * Signals Detected, Exclusive, or Detection Engine output directly.
 */

export type DistributionItemBase = {
  sport?: string | null;
  game_id?: string | number | null;
  gameId?: string | number | null;
  id?: string | number | null;
  rank?: string | number | null;
  score?: string | number | null;
  internal_score?: string | number | null;
  pick_ranking?: string | number | null;
  start_time?: string | null;
  startTime?: string | null;
  away_team?: string | null;
  awayTeam?: string | null;
  home_team?: string | null;
  homeTeam?: string | null;
  pick?: string | null;
  selection?: string | null;
  market?: string | null;
};

export type DistributedProductRow<T extends DistributionItemBase> = T & {
  readonly initialRank: number;
  readonly dynamicRank: number;
  readonly distributionProduct: AtlasDistributionProduct;
  readonly distributionBucket: AtlasDistributionProduct;
  readonly sourceRank: number | null;
};

export type SportProductDistribution<T extends DistributionItemBase> = {
  readonly sport: string;
  readonly masterSignalPool: ReadonlyArray<DistributedProductRow<T>>;
  readonly initialReservedPool: ReadonlyArray<DistributedProductRow<T>>;
  readonly signalsDetected: ReadonlyArray<DistributedProductRow<T>>;
  readonly exclusiveTop3: ReadonlyArray<DistributedProductRow<T>>;
  readonly dynamicCandidatePool: ReadonlyArray<DistributedProductRow<T>>;
  readonly dynamicRanking: ReadonlyArray<DistributedProductRow<T>>;
  readonly topSignal: DistributedProductRow<T> | null;
  readonly premium: ReadonlyArray<DistributedProductRow<T>>;
  readonly unlimited: ReadonlyArray<DistributedProductRow<T>>;
};

export type UniversalProductDistribution<T extends DistributionItemBase> = {
  readonly sports: ReadonlyArray<SportProductDistribution<T>>;
  readonly masterSignalPool: ReadonlyArray<DistributedProductRow<T>>;
  readonly initialReservedPool: ReadonlyArray<DistributedProductRow<T>>;
  readonly signalsDetected: ReadonlyArray<DistributedProductRow<T>>;
  readonly exclusiveTop3: ReadonlyArray<DistributedProductRow<T>>;
  readonly dynamicCandidatePool: ReadonlyArray<DistributedProductRow<T>>;
  readonly dynamicRanking: ReadonlyArray<DistributedProductRow<T>>;
  readonly topSignal: ReadonlyArray<DistributedProductRow<T>>;
  readonly premium: ReadonlyArray<DistributedProductRow<T>>;
  readonly unlimited: ReadonlyArray<DistributedProductRow<T>>;
};

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rowSport(row: DistributionItemBase) {
  return String(row.sport ?? "UNKNOWN").toUpperCase();
}

function rowId(row: DistributionItemBase) {
  const away = row.away_team ?? row.awayTeam;
  const home = row.home_team ?? row.homeTeam;
  const start = row.start_time ?? row.startTime;
  if (away && home && start) {
    return [
      rowSport(row),
      away,
      home,
      start,
    ]
      .map((part) => String(part).toLowerCase().trim())
      .join("|");
  }

  const id = row.game_id ?? row.gameId ?? row.id;
  if (id !== null && id !== undefined && String(id).trim()) return `${rowSport(row)}|${String(id)}`;

  return [
    rowSport(row),
    row.away_team ?? row.awayTeam ?? "",
    row.home_team ?? row.homeTeam ?? "",
    row.start_time ?? row.startTime ?? "",
    row.pick ?? row.selection ?? "",
    row.market ?? "",
  ]
    .map((part) => String(part).toLowerCase().trim())
    .join("|");
}

function rowRank(row: DistributionItemBase) {
  return numberValue(row.rank);
}

function rowScore(row: DistributionItemBase) {
  return numberValue(row.score) ?? numberValue(row.internal_score) ?? numberValue(row.pick_ranking);
}

function rowStartTime(row: DistributionItemBase) {
  const date = new Date(row.start_time ?? row.startTime ?? 0);
  return Number.isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();
}

function sortMasterRows<T extends DistributionItemBase>(rows: T[]) {
  return rows.slice().sort((a, b) => {
    const rankDiff = (rowRank(a) ?? Number.MAX_SAFE_INTEGER) - (rowRank(b) ?? Number.MAX_SAFE_INTEGER);
    if (rankDiff !== 0) return rankDiff;

    const scoreDiff = (rowScore(b) ?? -1) - (rowScore(a) ?? -1);
    if (scoreDiff !== 0) return scoreDiff;

    return rowStartTime(a) - rowStartTime(b);
  });
}

function dedupeRows<T extends DistributionItemBase>(rows: T[]) {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const id = rowId(row);
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, row);
      continue;
    }

    const existingRank = rowRank(existing) ?? Number.MAX_SAFE_INTEGER;
    const rowRankValue = rowRank(row) ?? Number.MAX_SAFE_INTEGER;
    if (rowRankValue < existingRank) byId.set(id, row);
  }
  return Array.from(byId.values());
}

function markRow<T extends DistributionItemBase>(
  row: T,
  initialRank: number,
  dynamicRank: number,
  product: AtlasDistributionProduct,
): DistributedProductRow<T> {
  return {
    ...row,
    initialRank,
    dynamicRank,
    distributionProduct: product,
    distributionBucket: product,
    sourceRank: rowRank(row),
  };
}

function freezeRows<T extends DistributionItemBase>(
  rows: Array<DistributedProductRow<T>>,
): ReadonlyArray<DistributedProductRow<T>> {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

function buildSportDistribution<T extends DistributionItemBase>(
  sport: string,
  rows: T[],
): SportProductDistribution<T> {
  const masterSignalPool = freezeRows(sortMasterRows(dedupeRows(rows)).map((row, index) =>
    markRow(row, index + 1, index + 1, "master_signal_pool"),
  ));
  const initialReservedPool = freezeRows(masterSignalPool.slice(0, 3).map((row) => ({
    ...row,
    distributionProduct: "initial_reserved_pool" as const,
    distributionBucket: "initial_reserved_pool" as const,
  })));
  const signalsDetected = freezeRows(masterSignalPool.slice(3).map((row) => ({
    ...row,
    distributionProduct: "signals_detected" as const,
    distributionBucket: "signals_detected" as const,
  })));
  const exclusiveTop3 = freezeRows(signalsDetected.slice(0, 3).map((row, index) => ({
    ...row,
    rank: index + 1,
    currentRank: index + 1,
    distributionProduct: "exclusive_top3" as const,
    distributionBucket: "exclusive_top3" as const,
  })));
  // Dynamic Validation Engine will attach here in the next phase.
  // It must read only this pool and must not mutate Signals Detected or Exclusive.
  const dynamicCandidatePool = freezeRows(sortMasterRows([...initialReservedPool, ...signalsDetected]).map((row, index) => ({
    ...row,
    dynamicRank: index + 1,
    distributionProduct: "dynamic_candidate_pool" as const,
    distributionBucket: "dynamic_candidate_pool" as const,
  })));

  const dynamicRanking = dynamicCandidatePool;
  const topSignal = dynamicRanking[0]
    ? Object.freeze(Object.assign({}, dynamicRanking[0], {
        rank: 1,
        currentRank: 1,
        distributionProduct: "top_signal" as const,
        distributionBucket: "top_signal" as const,
      }))
    : null;
  const premium = freezeRows(dynamicRanking.slice(1, 4).map((row, index) => Object.assign({}, row, {
    rank: index + 1,
    currentRank: index + 1,
    distributionProduct: "premium" as const,
    distributionBucket: "premium" as const,
  })));
  const unlimited = freezeRows(dynamicRanking.map((row) => Object.assign({}, row, {
    distributionProduct: "unlimited" as const,
    distributionBucket: "unlimited" as const,
  })));

  return Object.freeze({
    sport,
    masterSignalPool,
    initialReservedPool,
    signalsDetected,
    exclusiveTop3,
    dynamicCandidatePool,
    dynamicRanking,
    topSignal,
    premium,
    unlimited,
  });
}

export function buildUniversalProductDistribution<T extends DistributionItemBase>(
  rows: T[],
): UniversalProductDistribution<T> {
  const bySport = new Map<string, T[]>();
  for (const row of rows) {
    const sport = rowSport(row);
    bySport.set(sport, [...(bySport.get(sport) ?? []), row]);
  }

  const sports = Object.freeze(Array.from(bySport.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sport, sportRows]) => buildSportDistribution(sport, sportRows)));

  return Object.freeze({
    sports,
    masterSignalPool: freezeRows(sports.flatMap((sport) => sport.masterSignalPool)),
    initialReservedPool: freezeRows(sports.flatMap((sport) => sport.initialReservedPool)),
    signalsDetected: freezeRows(sports.flatMap((sport) => sport.signalsDetected)),
    exclusiveTop3: freezeRows(sports.flatMap((sport) => sport.exclusiveTop3)),
    dynamicCandidatePool: freezeRows(sports.flatMap((sport) => sport.dynamicCandidatePool)),
    dynamicRanking: freezeRows(sports.flatMap((sport) => sport.dynamicRanking)),
    topSignal: freezeRows(sports.flatMap((sport) => (sport.topSignal ? [sport.topSignal] : []))),
    premium: freezeRows(sports.flatMap((sport) => sport.premium)),
    unlimited: freezeRows(sports.flatMap((sport) => sport.unlimited)),
  });
}
