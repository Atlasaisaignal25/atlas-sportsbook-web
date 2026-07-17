export type AtlasDistributionProduct =
  | "master_signal_pool"
  | "initial_premium_pool"
  | "signals_detected"
  | "exclusive_top3"
  | "dynamic_candidate_pool"
  | "top_signal"
  | "premium"
  | "unlimited";

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
  initialRank: number;
  dynamicRank: number;
  distributionProduct: AtlasDistributionProduct;
  distributionBucket: AtlasDistributionProduct;
  sourceRank: number | null;
};

export type SportProductDistribution<T extends DistributionItemBase> = {
  sport: string;
  masterSignalPool: Array<DistributedProductRow<T>>;
  initialPremiumPool: Array<DistributedProductRow<T>>;
  signalsDetected: Array<DistributedProductRow<T>>;
  exclusiveTop3: Array<DistributedProductRow<T>>;
  dynamicCandidatePool: Array<DistributedProductRow<T>>;
  dynamicRanking: Array<DistributedProductRow<T>>;
  topSignal: DistributedProductRow<T> | null;
  premium: Array<DistributedProductRow<T>>;
  unlimited: Array<DistributedProductRow<T>>;
};

export type UniversalProductDistribution<T extends DistributionItemBase> = {
  sports: Array<SportProductDistribution<T>>;
  masterSignalPool: Array<DistributedProductRow<T>>;
  initialPremiumPool: Array<DistributedProductRow<T>>;
  signalsDetected: Array<DistributedProductRow<T>>;
  exclusiveTop3: Array<DistributedProductRow<T>>;
  dynamicCandidatePool: Array<DistributedProductRow<T>>;
  dynamicRanking: Array<DistributedProductRow<T>>;
  topSignal: Array<DistributedProductRow<T>>;
  premium: Array<DistributedProductRow<T>>;
  unlimited: Array<DistributedProductRow<T>>;
};

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rowSport(row: DistributionItemBase) {
  return String(row.sport ?? "UNKNOWN").toUpperCase();
}

function rowId(row: DistributionItemBase) {
  const id = row.game_id ?? row.gameId ?? row.id;
  if (id !== null && id !== undefined && String(id).trim()) return String(id);

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

function buildSportDistribution<T extends DistributionItemBase>(
  sport: string,
  rows: T[],
): SportProductDistribution<T> {
  const masterSignalPool = sortMasterRows(dedupeRows(rows)).map((row, index) =>
    markRow(row, index + 1, index + 1, "master_signal_pool"),
  );
  const initialPremiumPool = masterSignalPool.slice(0, 3).map((row) => ({
    ...row,
    distributionProduct: "initial_premium_pool" as const,
    distributionBucket: "initial_premium_pool" as const,
  }));
  const signalsDetected = masterSignalPool.slice(3).map((row) => ({
    ...row,
    distributionProduct: "signals_detected" as const,
    distributionBucket: "signals_detected" as const,
  }));
  const exclusiveTop3 = signalsDetected.slice(0, 3).map((row, index) => ({
    ...row,
    rank: index + 1,
    currentRank: index + 1,
    distributionProduct: "exclusive_top3" as const,
    distributionBucket: "exclusive_top3" as const,
  }));
  const dynamicCandidatePool = sortMasterRows([...initialPremiumPool, ...signalsDetected]).map((row, index) => ({
    ...row,
    dynamicRank: index + 1,
    distributionProduct: "dynamic_candidate_pool" as const,
    distributionBucket: "dynamic_candidate_pool" as const,
  }));

  const dynamicRanking = dynamicCandidatePool;
  const topSignal = dynamicRanking[0]
    ? {
        ...dynamicRanking[0],
        rank: 1,
        currentRank: 1,
        distributionProduct: "top_signal" as const,
        distributionBucket: "top_signal" as const,
      }
    : null;
  const premium = dynamicRanking.slice(1, 4).map((row, index) => ({
    ...row,
    rank: index + 1,
    currentRank: index + 1,
    distributionProduct: "premium" as const,
    distributionBucket: "premium" as const,
  }));
  const unlimited = dynamicRanking.map((row) => ({
    ...row,
    distributionProduct: "unlimited" as const,
    distributionBucket: "unlimited" as const,
  }));

  return {
    sport,
    masterSignalPool,
    initialPremiumPool,
    signalsDetected,
    exclusiveTop3,
    dynamicCandidatePool,
    dynamicRanking,
    topSignal,
    premium,
    unlimited,
  };
}

export function buildUniversalProductDistribution<T extends DistributionItemBase>(
  rows: T[],
): UniversalProductDistribution<T> {
  const bySport = new Map<string, T[]>();
  for (const row of rows) {
    const sport = rowSport(row);
    bySport.set(sport, [...(bySport.get(sport) ?? []), row]);
  }

  const sports = Array.from(bySport.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sport, sportRows]) => buildSportDistribution(sport, sportRows));

  return {
    sports,
    masterSignalPool: sports.flatMap((sport) => sport.masterSignalPool),
    initialPremiumPool: sports.flatMap((sport) => sport.initialPremiumPool),
    signalsDetected: sports.flatMap((sport) => sport.signalsDetected),
    exclusiveTop3: sports.flatMap((sport) => sport.exclusiveTop3),
    dynamicCandidatePool: sports.flatMap((sport) => sport.dynamicCandidatePool),
    dynamicRanking: sports.flatMap((sport) => sport.dynamicRanking),
    topSignal: sports.flatMap((sport) => (sport.topSignal ? [sport.topSignal] : [])),
    premium: sports.flatMap((sport) => sport.premium),
    unlimited: sports.flatMap((sport) => sport.unlimited),
  };
}
