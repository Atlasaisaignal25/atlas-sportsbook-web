import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  normalizeMlbMarketName,
} from "@/app/lib/mlb-engine/marketFeatures";
import { getRecentSnapshots } from "@/lib/market-impact/odds/snapshotRepository";
import type { OddsSnapshot } from "@/types/oddsMovement";
import {
  computeClosingMetrics,
  gradeUnits,
  gradeValidationMarket,
  MLB_VALIDATION_HISTORY_VERSION,
  noVigForSelectedPrice,
  round,
  teamsKey,
  toNumber,
  type ClosingEvidence,
  type FinalScoreEvidence,
  type ValidationMarket,
  type ValidationPregameSnapshot,
  type ValidationSelection,
} from "./validation-history-engine";

const TABLE = "mlb_research_validation_history";

type MarketEdgeRow = {
  official_game_id: string;
  home_team_name: string;
  away_team_name: string;
  market: ValidationMarket;
  atlas_probability: number | string | null;
  market_probability: number | string | null;
  edge: number | string | null;
  direction: ValidationSelection;
  classification: string | null;
  market_context: Record<string, unknown> | null;
  source_versions: Record<string, unknown> | null;
  model_version: string;
  snapshot_hash: string;
  captured_at: string;
};

type ProjectionRow = {
  official_game_id: string;
  projected_home_runs: number | string | null;
  projected_away_runs: number | string | null;
  projected_total_runs: number | string | null;
  model_version: string;
  feature_hash: string;
  captured_at: string;
};

type DecisionRow = {
  official_game_id: string;
  consensus_grade: string | null;
  consensus_score: number | string | null;
  conviction_grade: string | null;
  conviction_score: number | string | null;
  decision: string | null;
  decision_confidence_score: number | string | null;
  no_pick: boolean | null;
  model_version: string;
  feature_hash: string;
  captured_at: string;
};

type ValidationRow = {
  id: string;
  game_id: string;
  game_date: string | null;
  home_team: string;
  away_team: string;
  market: ValidationMarket;
  selection: ValidationSelection;
  market_probability: number | string | null;
  market_line: number | string | null;
  market_price: number | string | null;
  result: string;
  feature_hash: string;
  pregame_snapshot_at: string;
};

type OddsRow = {
  sport: string;
  event_id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmaker: string;
  market_key: string;
  outcome_name: string;
  point: number | string | null;
  price: number | string | null;
  captured_at: string;
};

type CompletedGame = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  completed: boolean;
  commenceTime?: string | null;
};

export type ValidationHistoryCaptureResult = {
  asOf: string;
  gamesInspected: number;
  recordsBuilt: number;
  inserted: number;
  skipped: number;
  errors: string[];
  examples: ValidationPregameSnapshot[];
};

export type ValidationHistoryGradeResult = {
  asOf: string;
  inspected: number;
  graded: number;
  stillPending: number;
  closingUpdated: number;
  examples: Array<Record<string, unknown>>;
  errors: string[];
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

function featureHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2, 4);
}

function latestIso(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .toSorted((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

function dateET(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function latestByBookOutcome(snapshots: OddsSnapshot[]) {
  const latest = new Map<string, OddsSnapshot>();
  for (const snapshot of snapshots.toSorted((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())) {
    const key = [
      snapshot.bookmaker,
      snapshot.marketKey,
      normalizeMlbMarketName(snapshot.outcomeName),
      snapshot.point ?? "",
    ].join(":");
    if (!latest.has(key)) latest.set(key, snapshot);
  }
  return Array.from(latest.values());
}

function sideOutcomeName(
  market: ValidationMarket,
  selection: ValidationSelection,
  homeTeam: string,
  awayTeam: string,
) {
  if (market === "MONEYLINE" || market === "RUN_LINE") {
    if (selection === "HOME") return normalizeMlbMarketName(homeTeam);
    if (selection === "AWAY") return normalizeMlbMarketName(awayTeam);
  }
  if (market === "TOTALS") return normalizeMlbMarketName(selection);
  return "";
}

function oppositeOutcomeName(
  market: ValidationMarket,
  selection: ValidationSelection,
  homeTeam: string,
  awayTeam: string,
) {
  if (market === "MONEYLINE" || market === "RUN_LINE") {
    if (selection === "HOME") return normalizeMlbMarketName(awayTeam);
    if (selection === "AWAY") return normalizeMlbMarketName(homeTeam);
  }
  if (market === "TOTALS") return selection === "OVER" ? "under" : selection === "UNDER" ? "over" : "";
  return "";
}

function marketKeyFor(market: ValidationMarket) {
  if (market === "MONEYLINE") return "h2h";
  if (market === "RUN_LINE") return "spreads";
  return "totals";
}

function marketLineFromContext(edge: MarketEdgeRow) {
  const context = edge.market_context ?? {};
  if (edge.market === "RUN_LINE") {
    return edge.direction === "HOME"
      ? toNumber(context.homePoint)
      : edge.direction === "AWAY"
        ? toNumber(context.awayPoint)
        : null;
  }
  if (edge.market === "TOTALS") return toNumber(context.point);
  return null;
}

function marketPriceFromContext(edge: MarketEdgeRow) {
  const context = edge.market_context ?? {};
  if (edge.market !== "MONEYLINE") return null;
  return edge.direction === "HOME"
    ? toNumber(context.homePrice)
    : edge.direction === "AWAY"
      ? toNumber(context.awayPrice)
      : null;
}

function priceEvidenceFromSnapshots(params: {
  snapshots: OddsSnapshot[];
  market: ValidationMarket;
  selection: ValidationSelection;
  homeTeam: string;
  awayTeam: string;
  line?: number | null;
}) {
  if (params.selection === "NONE") return { price: null, probability: null, timestamp: null };
  const latest = latestByBookOutcome(params.snapshots);
  const marketKey = marketKeyFor(params.market);
  const selectedName = sideOutcomeName(params.market, params.selection, params.homeTeam, params.awayTeam);
  const oppositeName = oppositeOutcomeName(params.market, params.selection, params.homeTeam, params.awayTeam);
  const selectedPrices: number[] = [];
  const selectedProbabilities: number[] = [];
  const timestamps: string[] = [];

  for (const bookmaker of new Set(latest.map((snapshot) => snapshot.bookmaker))) {
    const rows = latest.filter((snapshot) => snapshot.bookmaker === bookmaker && snapshot.marketKey === marketKey);
    const selected = rows.find((snapshot) => {
      const sameOutcome = normalizeMlbMarketName(snapshot.outcomeName) === selectedName;
      const samePoint = params.line === null || params.line === undefined || snapshot.point === undefined || Number(snapshot.point) === Number(params.line);
      return sameOutcome && samePoint;
    });
    const opposite = rows.find((snapshot) => {
      const sameOutcome = normalizeMlbMarketName(snapshot.outcomeName) === oppositeName;
      if (params.market === "RUN_LINE" && selected?.point !== undefined) return sameOutcome && Number(snapshot.point) === -Number(selected.point);
      if (params.market === "TOTALS" && selected?.point !== undefined) return sameOutcome && Number(snapshot.point) === Number(selected.point);
      return sameOutcome;
    });
    const price = toNumber(selected?.price);
    if (price === null) continue;
    selectedPrices.push(price);
    const probability = noVigForSelectedPrice(price, toNumber(opposite?.price));
    if (probability !== null) selectedProbabilities.push(probability);
    timestamps.push(selected?.capturedAt ?? "", opposite?.capturedAt ?? "");
  }

  return {
    price: median(selectedPrices),
    probability: median(selectedProbabilities),
    timestamp: latestIso(timestamps),
  };
}

async function loadCanonicalMarketEdges() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_market_edge_research_snapshots")
    .select("official_game_id,home_team_name,away_team_name,market,atlas_probability,market_probability,edge,direction,classification,market_context,source_versions,model_version,snapshot_hash,captured_at")
    .eq("model_version", "mlb_market_edge_research_v1")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as MarketEdgeRow[];
}

async function loadCanonicalProjectionRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_projection_research_snapshots")
    .select("official_game_id,projected_home_runs,projected_away_runs,projected_total_runs,model_version,feature_hash,captured_at")
    .eq("model_version", "mlb_projection_research_v1")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return new Map<string, ProjectionRow>(((data ?? []) as ProjectionRow[]).map((row) => [row.official_game_id, row]));
}

async function loadCanonicalDecisionRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_decision_research_snapshots")
    .select("official_game_id,consensus_grade,consensus_score,conviction_grade,conviction_score,decision,decision_confidence_score,no_pick,model_version,feature_hash,captured_at")
    .eq("model_version", "mlb_decision_engine_v1")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return new Map<string, DecisionRow>(((data ?? []) as DecisionRow[]).map((row) => [row.official_game_id, row]));
}

function buildRows(snapshots: ValidationPregameSnapshot[]) {
  return snapshots.map((snapshot) => {
    const payload = {
      gameId: snapshot.gameId,
      market: snapshot.market,
      selection: snapshot.selection,
      atlasProbability: snapshot.atlasProbability,
      marketProbability: snapshot.marketProbability,
      edge: snapshot.edge,
      edgeClassification: snapshot.edgeClassification,
      marketLine: snapshot.marketLine,
      marketPrice: snapshot.marketPrice,
      decision: snapshot.decision,
      noPick: snapshot.noPick,
      modelVersions: snapshot.modelVersions,
    };
    return {
      game_id: snapshot.gameId,
      game_date: snapshot.gameDate ?? null,
      home_team: snapshot.homeTeam,
      away_team: snapshot.awayTeam,
      market: snapshot.market,
      selection: snapshot.selection,
      atlas_probability: snapshot.atlasProbability ?? null,
      market_probability: snapshot.marketProbability ?? null,
      edge: snapshot.edge ?? null,
      edge_classification: snapshot.edgeClassification ?? null,
      projected_home_runs: snapshot.projectedHomeRuns ?? null,
      projected_away_runs: snapshot.projectedAwayRuns ?? null,
      projected_total: snapshot.projectedTotal ?? null,
      decision: snapshot.decision ?? null,
      consensus: snapshot.consensus ?? null,
      consensus_score: snapshot.consensusScore ?? null,
      conviction: snapshot.conviction ?? null,
      conviction_score: snapshot.convictionScore ?? null,
      confidence: snapshot.confidence ?? null,
      no_pick: snapshot.noPick,
      market_line: snapshot.marketLine ?? null,
      market_price: snapshot.marketPrice ?? null,
      result: "PENDING",
      model_versions: snapshot.modelVersions,
      source_snapshot_hashes: snapshot.sourceSnapshotHashes,
      pregame_snapshot_at: snapshot.pregameSnapshotAt,
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: snapshot.pregameSnapshotAt,
      updated_at: new Date().toISOString(),
    };
  });
}

export async function buildValidationPregameSnapshots(asOf = new Date().toISOString()) {
  const [edges, projections, decisions, oddsSnapshots] = await Promise.all([
    loadCanonicalMarketEdges(),
    loadCanonicalProjectionRows(),
    loadCanonicalDecisionRows(),
    getRecentSnapshots("MLB", 720).catch(() => []),
  ]);

  const oddsByGame = new Map<string, OddsSnapshot[]>();
  for (const snapshot of oddsSnapshots) {
    const key = teamsKey(snapshot.homeTeam, snapshot.awayTeam);
    oddsByGame.set(key, [...(oddsByGame.get(key) ?? []), snapshot]);
  }

  const records = edges.map((edge): ValidationPregameSnapshot => {
    const projection = projections.get(edge.official_game_id);
    const decision = decisions.get(edge.official_game_id);
    const line = marketLineFromContext(edge);
    const contextPrice = marketPriceFromContext(edge);
    const snapshotPrices = priceEvidenceFromSnapshots({
      snapshots: oddsByGame.get(teamsKey(edge.home_team_name, edge.away_team_name)) ?? [],
      market: edge.market,
      selection: edge.direction,
      homeTeam: edge.home_team_name,
      awayTeam: edge.away_team_name,
      line,
    });
    const pregameSnapshotAt = latestIso([
      edge.captured_at,
      projection?.captured_at,
      decision?.captured_at,
      snapshotPrices.timestamp,
      asOf,
    ]) ?? asOf;

    return {
      gameId: edge.official_game_id,
      gameDate: dateET(pregameSnapshotAt),
      homeTeam: edge.home_team_name,
      awayTeam: edge.away_team_name,
      market: edge.market,
      selection: edge.direction,
      atlasProbability: toNumber(edge.atlas_probability),
      marketProbability: toNumber(edge.market_probability),
      edge: toNumber(edge.edge),
      edgeClassification: edge.classification,
      projectedHomeRuns: toNumber(projection?.projected_home_runs),
      projectedAwayRuns: toNumber(projection?.projected_away_runs),
      projectedTotal: toNumber(projection?.projected_total_runs),
      decision: decision?.decision ?? null,
      consensus: decision?.consensus_grade ?? null,
      consensusScore: toNumber(decision?.consensus_score),
      conviction: decision?.conviction_grade ?? null,
      convictionScore: toNumber(decision?.conviction_score),
      confidence: toNumber(decision?.decision_confidence_score),
      noPick: Boolean(decision?.no_pick),
      marketLine: line,
      marketPrice: contextPrice ?? snapshotPrices.price,
      modelVersions: {
        validation: MLB_VALIDATION_HISTORY_VERSION,
        marketEdge: edge.model_version,
        projection: projection?.model_version ?? null,
        decision: decision?.model_version ?? null,
      },
      sourceSnapshotHashes: {
        marketEdge: edge.snapshot_hash,
        projection: projection?.feature_hash ?? null,
        decision: decision?.feature_hash ?? null,
      },
      pregameSnapshotAt,
    };
  });

  return { asOf, gamesInspected: new Set(edges.map((edge) => edge.official_game_id)).size, records };
}

export async function insertValidationPregameSnapshotsDeduped(records: ValidationPregameSnapshot[]) {
  const rows = buildRows(records);
  if (!rows.length) return { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "feature_hash", ignoreDuplicates: true })
    .select("id,game_id,market,feature_hash");
  if (error) return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };

  const hashes = rows.map((row) => row.feature_hash);
  const markCurrent = await supabase
    .from(TABLE)
    .update({ canonical: true, superseded_at: null, invalid_reason: null, updated_at: new Date().toISOString() })
    .in("feature_hash", hashes);
  if (markCurrent.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };

  for (const row of rows) {
    await supabase
      .from(TABLE)
      .update({
        canonical: false,
        superseded_at: new Date().toISOString(),
        invalid_reason: "SUPERSEDED_BY_MLB_VALIDATION_HISTORY_CAPTURE",
        updated_at: new Date().toISOString(),
      })
      .eq("game_id", row.game_id)
      .eq("market", row.market)
      .neq("feature_hash", row.feature_hash)
      .eq("canonical", true)
      .eq("result", "PENDING");
  }

  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] as string[] };
}

export async function captureValidationHistory(): Promise<ValidationHistoryCaptureResult> {
  const capture = await buildValidationPregameSnapshots();
  const storage = await insertValidationPregameSnapshotsDeduped(capture.records);
  return {
    asOf: capture.asOf,
    gamesInspected: capture.gamesInspected,
    recordsBuilt: capture.records.length,
    inserted: storage.inserted,
    skipped: storage.skipped,
    errors: storage.errors,
    examples: capture.records.slice(0, 5),
  };
}

function fromOddsRow(row: OddsRow): OddsSnapshot {
  return {
    sport: "MLB",
    eventId: row.event_id,
    commenceTime: row.commence_time,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    bookmaker: row.bookmaker,
    marketKey: row.market_key as OddsSnapshot["marketKey"],
    outcomeName: row.outcome_name,
    point: toNumber(row.point) ?? undefined,
    price: toNumber(row.price) ?? undefined,
    capturedAt: row.captured_at,
  };
}

async function loadLatestOddsForTeams(homeTeam: string, awayTeam: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("market_odds_snapshots")
    .select("sport,event_id,commence_time,home_team,away_team,bookmaker,market_key,outcome_name,point,price,captured_at")
    .eq("sport", "MLB")
    .order("captured_at", { ascending: false })
    .limit(5000);
  if (error) return [];
  return ((data ?? []) as OddsRow[])
    .map((row: OddsRow) => fromOddsRow(row))
    .filter((snapshot: OddsSnapshot) => teamsKey(snapshot.homeTeam, snapshot.awayTeam) === teamsKey(homeTeam, awayTeam));
}

async function closingEvidenceFor(row: ValidationRow): Promise<ClosingEvidence | null> {
  const snapshots = await loadLatestOddsForTeams(row.home_team, row.away_team);
  if (!snapshots.length) return null;
  const evidence = priceEvidenceFromSnapshots({
    snapshots,
    market: row.market,
    selection: row.selection,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    line: toNumber(row.market_line),
  });
  if (evidence.price === null && evidence.probability === null) return null;
  return {
    closingLine: toNumber(row.market_line),
    closingPrice: evidence.price,
    closingNoVigProbability: evidence.probability,
    closingTimestamp: evidence.timestamp,
  };
}

function normalizeScoreName(value: string) {
  return normalizeMlbMarketName(value).replace(/\bthe\b/g, "").trim();
}

function scoreDate(value?: string | null) {
  return dateET(value) ?? dateET();
}

async function fetchCompletedScores(): Promise<CompletedGame[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];
  const response = await fetch(
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/scores?daysFrom=3&apiKey=${apiKey}`,
    { cache: "no-store" },
  );
  if (!response.ok) return [];
  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((game: any) => game?.completed === true)
    .map((game: any) => ({
      homeTeam: String(game.home_team ?? ""),
      awayTeam: String(game.away_team ?? ""),
      homeScore: toNumber(game.scores?.find((score: any) => normalizeScoreName(score.name) === normalizeScoreName(game.home_team))?.score),
      awayScore: toNumber(game.scores?.find((score: any) => normalizeScoreName(score.name) === normalizeScoreName(game.away_team))?.score),
      completed: true,
      commenceTime: game.commence_time ?? null,
    }));
}

function findFinalScore(row: ValidationRow, completedGames: CompletedGame[]): FinalScoreEvidence {
  const rowDate = row.game_date ?? scoreDate(row.pregame_snapshot_at);
  const match = completedGames.find((game) => {
    const sameDate = scoreDate(game.commenceTime) === rowDate;
    const sameTeams =
      normalizeScoreName(game.homeTeam) === normalizeScoreName(row.home_team) &&
      normalizeScoreName(game.awayTeam) === normalizeScoreName(row.away_team);
    return sameDate && sameTeams && game.completed;
  });
  if (!match) return { completed: false };
  return { completed: true, homeScore: match.homeScore, awayScore: match.awayScore };
}

export async function gradeValidationHistory(): Promise<ValidationHistoryGradeResult> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id,game_id,game_date,home_team,away_team,market,selection,market_probability,market_line,market_price,result,feature_hash,pregame_snapshot_at")
    .eq("canonical", true)
    .in("result", ["PENDING"])
    .order("pregame_snapshot_at", { ascending: false })
    .limit(300);
  if (error) return { asOf: new Date().toISOString(), inspected: 0, graded: 0, stillPending: 0, closingUpdated: 0, examples: [], errors: [error.message] };

  const rows = (data ?? []) as ValidationRow[];
  const scores = await fetchCompletedScores();
  let graded = 0;
  let stillPending = 0;
  let closingUpdated = 0;
  const examples: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const [closing, finalScore] = await Promise.all([
      closingEvidenceFor(row),
      Promise.resolve(findFinalScore(row, scores)),
    ]);
    const result = finalScore.completed
      ? gradeValidationMarket({
          market: row.market,
          selection: row.selection,
          marketLine: toNumber(row.market_line),
          homeScore: finalScore.homeScore,
          awayScore: finalScore.awayScore,
        })
      : "PENDING";
    const units = result === "PENDING" ? null : gradeUnits(result, toNumber(row.market_price));
    const closingMetrics = computeClosingMetrics({
      marketProbability: toNumber(row.market_probability),
      marketLine: toNumber(row.market_line),
      marketPrice: toNumber(row.market_price),
      closing,
    });
    const update = {
      closing_line: closing?.closingLine ?? null,
      closing_price: closing?.closingPrice ?? null,
      closing_no_vig_probability: closing?.closingNoVigProbability ?? null,
      closing_timestamp: closing?.closingTimestamp ?? null,
      clv_probability: closingMetrics.clvProbability,
      clv_price: closingMetrics.clvPrice,
      line_movement: closingMetrics.lineMovement,
      price_movement: closingMetrics.priceMovement,
      result,
      units,
      roi: units,
      final_home_score: finalScore.homeScore ?? null,
      final_away_score: finalScore.awayScore ?? null,
      final_scores: finalScore.completed ? { home: finalScore.homeScore, away: finalScore.awayScore } : {},
      graded_at: result === "PENDING" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase.from(TABLE).update(update).eq("id", row.id);
    if (updateError) {
      examples.push({ gameId: row.game_id, market: row.market, error: updateError.message });
      continue;
    }
    if (result === "PENDING") stillPending += 1;
    else graded += 1;
    if (closing) closingUpdated += 1;
    if (examples.length < 5) examples.push({ gameId: row.game_id, market: row.market, result, closing });
  }

  return {
    asOf: new Date().toISOString(),
    inspected: rows.length,
    graded,
    stillPending,
    closingUpdated,
    examples,
    errors: [],
  };
}

function countBy(rows: any[], keyName: string) {
  return rows.reduce((acc: Record<string, number>, row) => {
    const value = row[keyName] ?? "UNAVAILABLE";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function average(values: Array<number | null>) {
  const real = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!real.length) return null;
  return round(real.reduce((sum, value) => sum + value, 0) / real.length, 4);
}

function roiFor(rows: any[]) {
  const risked = rows.filter((row) => row.result === "WON" || row.result === "LOST").length;
  if (!risked) return null;
  const units = rows.reduce((sum, row) => sum + (toNumber(row.units) ?? 0), 0);
  return round(units / risked, 4);
}

function groupMetric(rows: any[], key: string, metric: "roi" | "clv") {
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const value = String(row[key] ?? "UNAVAILABLE");
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return Object.fromEntries(
    Array.from(grouped.entries()).map(([group, groupRows]) => [
      group,
      metric === "roi"
        ? roiFor(groupRows)
        : average(groupRows.map((row) => toNumber(row.clv_probability))),
    ]),
  );
}

export async function getValidationHistoryStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true });
  if (error) return { healthy: false, totalRecords: 0, errors: [error.message] };

  const { data, error: rowsError } = await supabase
    .from(TABLE)
    .select("game_id,home_team,away_team,market,selection,edge,edge_classification,decision,consensus,conviction,confidence,no_pick,result,units,roi,clv_probability,pregame_snapshot_at,graded_at,feature_hash,canonical")
    .eq("canonical", true)
    .order("pregame_snapshot_at", { ascending: false })
    .limit(1000);

  const statusRows = rowsError ? [] : (data ?? []);
  const gradedRows = statusRows.filter((row: any) => ["WON", "LOST", "PUSH", "VOID"].includes(row.result));
  const won = statusRows.filter((row: any) => row.result === "WON").length;
  const lost = statusRows.filter((row: any) => row.result === "LOST").length;
  const pushes = statusRows.filter((row: any) => row.result === "PUSH").length;

  return {
    healthy: !rowsError,
    totalRecords: count ?? 0,
    canonicalRecords: statusRows.length,
    pending: statusRows.filter((row: any) => row.result === "PENDING").length,
    graded: gradedRows.length,
    wins: won,
    losses: lost,
    pushes,
    voids: statusRows.filter((row: any) => row.result === "VOID").length,
    roi: roiFor(gradedRows),
    averageClv: average(statusRows.map((row: any) => toNumber(row.clv_probability))),
    roiByMarket: groupMetric(gradedRows, "market", "roi"),
    clvByMarket: groupMetric(statusRows, "market", "clv"),
    roiByEdgeClassification: groupMetric(gradedRows, "edge_classification", "roi"),
    resultsByDecision: countBy(statusRows, "decision"),
    resultsByConviction: countBy(statusRows, "conviction"),
    resultsByConfidence: countBy(statusRows, "confidence"),
    resultDistribution: countBy(statusRows, "result"),
    marketDistribution: countBy(statusRows, "market"),
    examples: statusRows.slice(0, 5),
    errors: rowsError ? [rowsError.message] : [] as string[],
  };
}
