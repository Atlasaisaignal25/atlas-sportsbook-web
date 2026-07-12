import crypto from "node:crypto";
import {
  noVigTwoWayProbabilities,
  normalizeMlbMarketName,
} from "@/app/lib/mlb-engine/marketFeatures";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { getRecentSnapshots } from "@/lib/market-impact/odds/snapshotRepository";
import type { OddsSnapshot } from "@/types/oddsMovement";
import { resolveMlbSlateDate, timestampBelongsToMlbSlate } from "@/app/lib/mlb-engine/slate-date";
import {
  buildMarketEdgeSnapshots,
  MLB_MARKET_EDGE_RESEARCH_VERSION,
  summarizeMarketEdge,
  type MarketEdgeInput,
  type MarketEdgeMarket,
  type MarketEdgeSnapshot,
} from "./market-edge-engine";

const TABLE = "mlb_market_edge_research_snapshots";

type ProjectionRow = {
  official_game_id: string;
  home_team_id: string | null;
  home_team_name: string;
  away_team_id: string | null;
  away_team_name: string;
  projected_home_runs: number | string | null;
  projected_away_runs: number | string | null;
  projected_total_runs: number | string | null;
  home_win_probability: number | string | null;
  away_win_probability: number | string | null;
  fair_moneyline_home: number | null;
  fair_moneyline_away: number | null;
  captured_at: string;
};

export type MarketEdgeCaptureResult = {
  asOf: string;
  gamesInspected: number;
  gamesAnalyzed: number;
  marketEdges: MarketEdgeSnapshot[];
  summaries: Array<{
    officialGameId: string;
    homeTeamName: string;
    awayTeamName: string;
    bestMarket: MarketEdgeMarket | null;
    bestEdge?: number;
    confidence: string;
    decisionAlignment: string;
  }>;
  providerErrors: string[];
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function snapshotHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function rowNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function gameKey(homeTeam: string, awayTeam: string) {
  return `${normalizeMlbMarketName(homeTeam)}|${normalizeMlbMarketName(awayTeam)}`;
}

function outcomeKey(snapshot: OddsSnapshot) {
  const point = snapshot.point === undefined || snapshot.point === null ? "" : String(Number(snapshot.point));
  return `${normalizeMlbMarketName(snapshot.outcomeName)}:${point}`;
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function latestIso(values: Array<string | undefined | null>) {
  return values
    .filter((value): value is string => Boolean(value))
    .toSorted((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function latestByBookOutcome(snapshots: OddsSnapshot[]) {
  const latest = new Map<string, OddsSnapshot>();
  for (const snapshot of snapshots.toSorted((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())) {
    const key = `${snapshot.bookmaker}:${snapshot.marketKey}:${outcomeKey(snapshot)}`;
    if (!latest.has(key)) latest.set(key, snapshot);
  }
  return Array.from(latest.values());
}

function twoWayNoVig(first?: OddsSnapshot, second?: OddsSnapshot) {
  if (!first || !second) return null;
  if (typeof first.price !== "number" || typeof second.price !== "number") return null;
  return noVigTwoWayProbabilities(first.price, second.price);
}

function noVigPct(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? Number((value * 100).toFixed(2)) : undefined;
}

function buildMarketInputFromSnapshots(projection: ProjectionRow, snapshots: OddsSnapshot[]): MarketEdgeInput["market"] {
  const latest = latestByBookOutcome(snapshots);
  const homeName = normalizeMlbMarketName(projection.home_team_name);
  const awayName = normalizeMlbMarketName(projection.away_team_name);

  const h2hSamples = latest.filter((snapshot) => snapshot.marketKey === "h2h");
  const moneylineHome: number[] = [];
  const moneylineAway: number[] = [];
  const homePrices: number[] = [];
  const awayPrices: number[] = [];
  const h2hBooks = new Set<string>();
  for (const bookmaker of new Set(h2hSamples.map((snapshot) => snapshot.bookmaker))) {
    const rows = h2hSamples.filter((snapshot) => snapshot.bookmaker === bookmaker);
    const home = rows.find((snapshot) => normalizeMlbMarketName(snapshot.outcomeName) === homeName);
    const away = rows.find((snapshot) => normalizeMlbMarketName(snapshot.outcomeName) === awayName);
    const noVig = twoWayNoVig(home, away);
    if (!noVig) continue;
    moneylineHome.push(noVig.first);
    moneylineAway.push(noVig.second);
    if (typeof home?.price === "number") homePrices.push(home.price);
    if (typeof away?.price === "number") awayPrices.push(away.price);
    h2hBooks.add(bookmaker);
  }

  const spreadSamples = latest.filter((snapshot) => snapshot.marketKey === "spreads");
  const runLineCandidates = new Map<string, { home: number[]; away: number[]; homePoint?: number; awayPoint?: number; books: Set<string>; updates: string[] }>();
  for (const bookmaker of new Set(spreadSamples.map((snapshot) => snapshot.bookmaker))) {
    const rows = spreadSamples.filter((snapshot) => snapshot.bookmaker === bookmaker);
    const homeRows = rows.filter((snapshot) => normalizeMlbMarketName(snapshot.outcomeName) === homeName);
    for (const home of homeRows) {
      const away = rows.find((snapshot) => normalizeMlbMarketName(snapshot.outcomeName) === awayName && Number(snapshot.point) === -Number(home.point));
      const noVig = twoWayNoVig(home, away);
      if (!noVig) continue;
      const key = `${home.point ?? ""}:${away?.point ?? ""}`;
      const current = runLineCandidates.get(key) ?? { home: [], away: [], homePoint: home.point, awayPoint: away?.point, books: new Set<string>(), updates: [] };
      current.home.push(noVig.first);
      current.away.push(noVig.second);
      current.books.add(bookmaker);
      current.updates.push(home.capturedAt, away?.capturedAt ?? "");
      runLineCandidates.set(key, current);
    }
  }
  const runLine = Array.from(runLineCandidates.values()).toSorted((a, b) => b.books.size - a.books.size)[0];

  const totalSamples = latest.filter((snapshot) => snapshot.marketKey === "totals");
  const totalCandidates = new Map<string, { over: number[]; under: number[]; point?: number; books: Set<string>; updates: string[] }>();
  for (const bookmaker of new Set(totalSamples.map((snapshot) => snapshot.bookmaker))) {
    const rows = totalSamples.filter((snapshot) => snapshot.bookmaker === bookmaker);
    const overRows = rows.filter((snapshot) => normalizeMlbMarketName(snapshot.outcomeName) === "over");
    for (const over of overRows) {
      const under = rows.find((snapshot) => normalizeMlbMarketName(snapshot.outcomeName) === "under" && Number(snapshot.point) === Number(over.point));
      const noVig = twoWayNoVig(over, under);
      if (!noVig) continue;
      const key = String(over.point ?? "");
      const current = totalCandidates.get(key) ?? { over: [], under: [], point: over.point, books: new Set<string>(), updates: [] };
      current.over.push(noVig.first);
      current.under.push(noVig.second);
      current.books.add(bookmaker);
      current.updates.push(over.capturedAt, under?.capturedAt ?? "");
      totalCandidates.set(key, current);
    }
  }
  const totals = Array.from(totalCandidates.values()).toSorted((a, b) => b.books.size - a.books.size)[0];

  return {
    moneyline: moneylineHome.length && moneylineAway.length ? {
      homeNoVigProbability: noVigPct(median(moneylineHome)),
      awayNoVigProbability: noVigPct(median(moneylineAway)),
      homePrice: median(homePrices) ?? null,
      awayPrice: median(awayPrices) ?? null,
      sportsbookCount: h2hBooks.size,
      latestUpdatedAt: latestIso(h2hSamples.map((snapshot) => snapshot.capturedAt)),
    } : undefined,
    runLine: runLine ? {
      homeNoVigProbability: noVigPct(median(runLine.home)),
      awayNoVigProbability: noVigPct(median(runLine.away)),
      homePoint: runLine.homePoint ?? null,
      awayPoint: runLine.awayPoint ?? null,
      sportsbookCount: runLine.books.size,
      latestUpdatedAt: latestIso(runLine.updates),
    } : undefined,
    totals: totals ? {
      overNoVigProbability: noVigPct(median(totals.over)),
      underNoVigProbability: noVigPct(median(totals.under)),
      point: totals.point ?? null,
      sportsbookCount: totals.books.size,
      latestUpdatedAt: latestIso(totals.updates),
    } : undefined,
  };
}

async function loadCanonicalProjectionRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_projection_research_snapshots")
    .select("official_game_id,home_team_id,home_team_name,away_team_id,away_team_name,projected_home_runs,projected_away_runs,projected_total_runs,home_win_probability,away_win_probability,fair_moneyline_home,fair_moneyline_away,captured_at")
    .eq("model_version", "mlb_projection_research_v1")
    .eq("slate_date", resolveMlbSlateDate())
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ProjectionRow[];
}

async function loadCanonicalDecisionRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_decision_research_snapshots")
    .select("official_game_id,decision")
    .eq("model_version", "mlb_decision_engine_v1")
    .eq("slate_date", resolveMlbSlateDate())
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  if (error) return new Map<string, string>();
  return new Map<string, string>((data ?? []).map((row: any) => [String(row.official_game_id), String(row.decision)]));
}

export async function buildMarketEdgeResearchSnapshots(asOf = new Date().toISOString()): Promise<MarketEdgeCaptureResult> {
  const [projections, oddsSnapshots, decisionByGame] = await Promise.all([
    loadCanonicalProjectionRows(),
    getRecentSnapshots("MLB", 360),
    loadCanonicalDecisionRows(),
  ]);
  const oddsByGame = new Map<string, OddsSnapshot[]>();
  const slateDate = resolveMlbSlateDate();
  for (const snapshot of oddsSnapshots.filter((snapshot) => timestampBelongsToMlbSlate(snapshot.commenceTime, slateDate))) {
    const key = gameKey(snapshot.homeTeam, snapshot.awayTeam);
    oddsByGame.set(key, [...(oddsByGame.get(key) ?? []), snapshot]);
  }

  const marketEdges: MarketEdgeSnapshot[] = [];
  const summaries: MarketEdgeCaptureResult["summaries"] = [];

  for (const projection of projections) {
    const snapshots = oddsByGame.get(gameKey(projection.home_team_name, projection.away_team_name)) ?? [];
    if (!snapshots.length) continue;
    const input: MarketEdgeInput = {
      officialGameId: projection.official_game_id,
      homeTeamId: projection.home_team_id,
      homeTeamName: projection.home_team_name,
      awayTeamId: projection.away_team_id,
      awayTeamName: projection.away_team_name,
      homeWinProbability: rowNumber(projection.home_win_probability),
      awayWinProbability: rowNumber(projection.away_win_probability),
      projectedHomeRuns: rowNumber(projection.projected_home_runs),
      projectedAwayRuns: rowNumber(projection.projected_away_runs),
      projectedTotalRuns: rowNumber(projection.projected_total_runs),
      fairMoneylineHome: projection.fair_moneyline_home,
      fairMoneylineAway: projection.fair_moneyline_away,
      projectionCapturedAt: projection.captured_at,
      market: buildMarketInputFromSnapshots(projection, snapshots),
      decision: decisionByGame.get(projection.official_game_id),
      asOf,
    };
    const edges = buildMarketEdgeSnapshots(input);
    const summary = summarizeMarketEdge(edges, input.decision);
    marketEdges.push(...edges);
    summaries.push({
      officialGameId: projection.official_game_id,
      homeTeamName: projection.home_team_name,
      awayTeamName: projection.away_team_name,
      ...summary,
    });
  }

  return {
    asOf,
    gamesInspected: projections.length,
    gamesAnalyzed: summaries.length,
    marketEdges,
    summaries,
    providerErrors: [],
  };
}

export function buildMarketEdgeRows(edges: MarketEdgeSnapshot[]) {
  const slateDate = resolveMlbSlateDate();
  return edges.map((edge) => {
    const payload = {
      officialGameId: edge.officialGameId,
      market: edge.market,
      atlasProbability: edge.atlasProbability,
      marketProbability: edge.marketProbability,
      edge: edge.edge,
      direction: edge.direction,
      classification: edge.classification,
      modelVersion: edge.modelVersion,
      slateDate,
    };
    return {
      slate_date: slateDate,
      official_game_id: edge.officialGameId,
      home_team_id: edge.homeTeamId ?? null,
      home_team_name: edge.homeTeamName,
      away_team_id: edge.awayTeamId ?? null,
      away_team_name: edge.awayTeamName,
      market: edge.market,
      atlas_probability: edge.atlasProbability ?? null,
      market_probability: edge.marketProbability ?? null,
      edge: edge.edge ?? null,
      value_percent: edge.valuePercent ?? null,
      direction: edge.direction,
      classification: edge.classification,
      market_context: edge.marketContext,
      source_versions: edge.sourceVersions,
      model_version: edge.modelVersion,
      snapshot_hash: snapshotHash(payload),
      canonical: true,
      captured_at: edge.capturedAt,
      source_updated_at: edge.marketContext?.latestUpdatedAt ?? edge.capturedAt,
      freshness_status: "FRESH",
      freshness_reason: "CAPTURED_FOR_CURRENT_ET_SLATE",
    };
  });
}

export async function insertMarketEdgeSnapshotsDeduped(edges: MarketEdgeSnapshot[]) {
  const rows = buildMarketEdgeRows(edges);
  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "snapshot_hash", ignoreDuplicates: true })
    .select("id");
  if (error) return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };
  const hashes = rows.map((row) => row.snapshot_hash);
  const quotedHashes = hashes.map((hash) => `"${hash}"`).join(",");
  const markOld = await supabase
    .from(TABLE)
    .update({
      canonical: false,
      superseded_at: new Date().toISOString(),
      invalid_reason: "SUPERSEDED_BY_MLB_MARKET_EDGE_RESEARCH_CAPTURE",
    })
    .eq("model_version", MLB_MARKET_EDGE_RESEARCH_VERSION)
    .eq("slate_date", rows[0]?.slate_date)
    .not("snapshot_hash", "in", `(${quotedHashes})`)
    .eq("canonical", true);
  if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };
  const markCurrent = await supabase
    .from(TABLE)
    .update({ canonical: true, superseded_at: null, invalid_reason: null, freshness_status: "FRESH", freshness_reason: "CAPTURED_FOR_CURRENT_ET_SLATE" })
    .in("snapshot_hash", hashes);
  if (markCurrent.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };
  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] as string[] };
}

function countBy(rows: any[], keyName: string) {
  return rows.reduce((acc: Record<string, number>, row) => {
    const value = row[keyName] ?? "UNAVAILABLE";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getMarketEdgeResearchStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("model_version", MLB_MARKET_EDGE_RESEARCH_VERSION);
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, errors: [error.message] };
  const { count: canonicalSnapshots } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("model_version", MLB_MARKET_EDGE_RESEARCH_VERSION)
    .eq("slate_date", resolveMlbSlateDate())
    .eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("official_game_id,home_team_name,away_team_name,market,atlas_probability,market_probability,edge,value_percent,direction,classification,market_context,captured_at,slate_date,freshness_status,freshness_reason")
    .eq("model_version", MLB_MARKET_EDGE_RESEARCH_VERSION)
    .eq("slate_date", resolveMlbSlateDate())
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(300);
  const rows = data ?? [];
  const bestEdges = [...rows]
    .filter((row: any) => typeof row.edge === "number")
    .toSorted((a: any, b: any) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0))
    .slice(0, 10);
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    latestCapture: rows[0]?.captured_at as string | undefined,
    gamesAnalyzed: new Set(rows.map((row: any) => row.official_game_id)).size,
    edgeDistribution: countBy(rows, "classification"),
    marketDistribution: countBy(rows, "market"),
    bestMarket: bestEdges[0]?.market ?? null,
    bestEdge: bestEdges[0]?.edge ?? null,
    bestEdges,
    examples: rows.slice(0, 5),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}
