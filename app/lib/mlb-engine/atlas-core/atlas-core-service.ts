import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { ATLAS_CORE_MLB_VERSION, currentHourET, getAtlasCoreMlbConfig, todayET } from "./atlas-core-config";
import { isFreshForMlbSlate, resolveMlbSlateDate, resolveMlbSlateWindow, timestampBelongsToMlbSlate } from "@/app/lib/mlb-engine/slate-date";
import { captureValidationHistory, gradeValidationHistory } from "@/app/lib/mlb-engine/sports-intelligence/validation-history/validation-history-repository";
import { calculatePerformanceAnalytics } from "@/app/lib/mlb-engine/sports-intelligence/performance/performance-analytics-repository";
import { analyzeLearningInsights } from "@/app/lib/mlb-engine/sports-intelligence/learning/learning-repository";
import { buildMlbProjectionResearchSnapshots, insertProjectionResearchSnapshotsDeduped } from "@/app/lib/mlb-engine/sports-intelligence/projection-research/projection-research-repository";
import { buildDecisionResearchSnapshots, insertDecisionResearchSnapshotsDeduped } from "@/app/lib/mlb-engine/sports-intelligence/decision-research/decision-research-repository";
import { buildMarketEdgeResearchSnapshots, insertMarketEdgeSnapshotsDeduped } from "@/app/lib/mlb-engine/sports-intelligence/market-edge/market-edge-repository";

const SIGNAL_ENGINE_RECALC_MINUTES = Number(process.env.ATLAS_SIGNAL_ENGINE_RECALC_MINUTES ?? 60);
const SIGNAL_ENGINE_FREEZE_BEFORE_START_MINUTES = Number(process.env.ATLAS_SIGNAL_ENGINE_FREEZE_BEFORE_START_MINUTES ?? 60);
const SIGNAL_ENGINE_VALIDATE_BEFORE_START_MINUTES = Number(process.env.ATLAS_SIGNAL_ENGINE_VALIDATE_BEFORE_START_MINUTES ?? 30);
const TOP_SIGNAL_MIN_ODDS = Number(process.env.ATLAS_TOP_SIGNAL_MIN_ODDS ?? -160);
const TOP_SIGNAL_MAX_ODDS = Number(process.env.ATLAS_TOP_SIGNAL_MAX_ODDS ?? 120);

type MarketEdgeRow = {
  official_game_id: string;
  home_team_name: string;
  away_team_name: string;
  market: "MONEYLINE" | "RUN_LINE" | "TOTALS";
  atlas_probability: number | string | null;
  market_probability: number | string | null;
  edge: number | string | null;
  value_percent: number | string | null;
  direction: "HOME" | "AWAY" | "OVER" | "UNDER" | "NONE";
  classification: string | null;
  market_context: Record<string, any> | null;
  source_versions: Record<string, unknown> | null;
  snapshot_hash: string | null;
  captured_at: string;
  slate_date?: string | null;
  freshness_status?: string | null;
  freshness_reason?: string | null;
};

type DecisionRow = {
  official_game_id: string;
  decision: string | null;
  consensus_grade: string | null;
  consensus_score: number | string | null;
  conviction_grade: string | null;
  conviction_score: number | string | null;
  decision_confidence_score: number | string | null;
  no_pick: boolean | null;
  feature_hash: string | null;
  model_version: string | null;
  captured_at: string;
  slate_date?: string | null;
  freshness_status?: string | null;
  freshness_reason?: string | null;
};

type ProjectionRow = {
  official_game_id: string;
  projection_availability: string | null;
  feature_hash: string | null;
  model_version: string | null;
  captured_at: string;
  slate_date?: string | null;
  freshness_status?: string | null;
  freshness_reason?: string | null;
};

type OddsRow = {
  event_id: string;
  commence_time: string | null;
  home_team: string;
  away_team: string;
  market_key: string;
  outcome_name: string;
  point: number | string | null;
  price: number | string | null;
  captured_at: string;
};

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeName(value: string) {
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

function teamsKey(homeTeam: string, awayTeam: string) {
  return `${normalizeName(homeTeam)}|${normalizeName(awayTeam)}`;
}

function pickMarket(market: MarketEdgeRow["market"]) {
  if (market === "MONEYLINE") return "h2h";
  if (market === "RUN_LINE") return "spreads";
  return "totals";
}

function pickLine(edge: MarketEdgeRow) {
  const context = edge.market_context ?? {};
  if (edge.market === "RUN_LINE") {
    return edge.direction === "HOME" ? numberValue(context.homePoint) : edge.direction === "AWAY" ? numberValue(context.awayPoint) : null;
  }
  if (edge.market === "TOTALS") return numberValue(context.point);
  return null;
}

function selectedOutcomeName(edge: MarketEdgeRow) {
  if (edge.market === "TOTALS") return edge.direction === "UNDER" ? "under" : "over";
  if (edge.direction === "HOME") return edge.home_team_name;
  if (edge.direction === "AWAY") return edge.away_team_name;
  return "";
}

function pickOdds(edge: MarketEdgeRow, oddsRows: OddsRow[] = []) {
  const context = edge.market_context ?? {};
  const contextPrice =
    edge.direction === "HOME"
      ? numberValue(context.homePrice)
      : edge.direction === "AWAY"
        ? numberValue(context.awayPrice)
        : edge.direction === "OVER"
          ? numberValue(context.overPrice)
          : edge.direction === "UNDER"
            ? numberValue(context.underPrice)
            : null;
  if (contextPrice !== null) return contextPrice;

  const market = pickMarket(edge.market);
  const line = pickLine(edge);
  const teamKey = teamsKey(edge.home_team_name, edge.away_team_name);
  const outcome = normalizeName(selectedOutcomeName(edge));
  const row = oddsRows.find((item) => {
    if (teamsKey(item.home_team, item.away_team) !== teamKey) return false;
    if (item.market_key !== market) return false;
    if (normalizeName(item.outcome_name) !== outcome) return false;
    const point = numberValue(item.point);
    return line === null || point === null || Number(point) === Number(line);
  });

  return numberValue(row?.price);
}

function pickLabel(edge: MarketEdgeRow) {
  if (edge.market === "TOTALS") {
    const line = pickLine(edge);
    return `${edge.direction === "UNDER" ? "Under" : "Over"}${line === null ? "" : ` ${line}`}`;
  }
  const team = edge.direction === "HOME" ? edge.home_team_name : edge.away_team_name;
  if (edge.market === "RUN_LINE") {
    const line = pickLine(edge);
    const lineText = line === null ? "" : ` (${line > 0 ? "+" : ""}${line})`;
    return `${team}${lineText}`;
  }
  return `${team} ML`;
}

function sourceDateFromStart(startTime?: string | null) {
  const date = startTime ? new Date(startTime) : new Date();
  if (Number.isNaN(date.getTime())) return todayET();
  return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function freshnessReason(row: { captured_at?: string | null; slate_date?: string | null; freshness_status?: string | null }, slateDate: string, expectedStatus = "FRESH") {
  if (row.slate_date !== slateDate) return `SLATE_DATE_MISMATCH:${row.slate_date ?? "missing"}`;
  if (!isFreshForMlbSlate(row.captured_at, slateDate)) return `CAPTURED_AT_NOT_CURRENT_SLATE:${row.captured_at ?? "missing"}`;
  if (row.freshness_status && row.freshness_status !== expectedStatus) return `FRESHNESS_STATUS_${row.freshness_status}`;
  return null;
}

function isFreshSnapshot(row: { captured_at?: string | null; slate_date?: string | null; freshness_status?: string | null }, slateDate: string) {
  return freshnessReason(row, slateDate) === null;
}

function rankScore(params: { probability: number | null; edge: number | null; conviction: number | null; consensus: number | null; confidence: number | null }) {
  return Math.round(
    (params.probability ?? 0) * 10000 +
      (params.edge ?? 0) * 100 +
      (params.conviction ?? 0) * 1.2 +
      (params.consensus ?? 0) * 0.9 +
      (params.confidence ?? 0) * 0.8,
  );
}

async function loadCanonicalRows() {
  const supabase = getSupabaseAdmin();
  const { slateDate, startUtc, endUtc } = resolveMlbSlateWindow();
  const [edges, decisions, projections, odds] = await Promise.all([
    supabase
      .from("mlb_market_edge_research_snapshots")
      .select("official_game_id,home_team_name,away_team_name,market,atlas_probability,market_probability,edge,value_percent,direction,classification,market_context,source_versions,snapshot_hash,captured_at,slate_date,freshness_status,freshness_reason")
      .eq("model_version", "mlb_market_edge_research_v1")
      .eq("slate_date", slateDate)
      .eq("canonical", true)
      .gte("captured_at", startUtc)
      .lt("captured_at", endUtc)
      .limit(300),
    supabase
      .from("mlb_decision_research_snapshots")
      .select("official_game_id,decision,consensus_grade,consensus_score,conviction_grade,conviction_score,decision_confidence_score,no_pick,feature_hash,model_version,captured_at,slate_date,freshness_status,freshness_reason")
      .eq("model_version", "mlb_decision_engine_v1")
      .eq("slate_date", slateDate)
      .eq("canonical", true)
      .gte("captured_at", startUtc)
      .lt("captured_at", endUtc)
      .limit(300),
    supabase
      .from("mlb_projection_research_snapshots")
      .select("official_game_id,projection_availability,feature_hash,model_version,captured_at,slate_date,freshness_status,freshness_reason")
      .eq("model_version", "mlb_projection_research_v1")
      .eq("slate_date", slateDate)
      .eq("canonical", true)
      .gte("captured_at", startUtc)
      .lt("captured_at", endUtc)
      .limit(300),
    supabase
      .from("market_odds_snapshots")
      .select("event_id,commence_time,home_team,away_team,market_key,outcome_name,point,price,captured_at")
      .eq("sport", "MLB")
      .gte("commence_time", startUtc)
      .lt("commence_time", endUtc)
      .order("captured_at", { ascending: false })
      .limit(5000),
  ]);
  if (edges.error) throw edges.error;
  if (decisions.error) throw decisions.error;
  if (projections.error) throw projections.error;
  const decisionRows = ((decisions.data ?? []) as DecisionRow[]).filter((row) => isFreshSnapshot(row, slateDate));
  const projectionRows = ((projections.data ?? []) as ProjectionRow[]).filter((row) => isFreshSnapshot(row, slateDate));
  const edgeRows = ((edges.data ?? []) as MarketEdgeRow[]).filter((row) => isFreshSnapshot(row, slateDate));
  const decisionByGame = new Map(decisionRows.map((row) => [row.official_game_id, row]));
  const projectionByGame = new Map(projectionRows.map((row) => [row.official_game_id, row]));
  const oddsByTeams = new Map<string, OddsRow>();
  const oddsRows = ((odds.data ?? []) as OddsRow[]).filter((row) => timestampBelongsToMlbSlate(row.commence_time, slateDate));
  for (const row of oddsRows) {
    const key = teamsKey(row.home_team, row.away_team);
    if (!oddsByTeams.has(key)) oddsByTeams.set(key, row);
  }
  return {
    edges: edgeRows,
    decisionByGame,
    projectionByGame,
    oddsByTeams,
    oddsRows,
    slateDate,
  };
}

function gameStart(edge: MarketEdgeRow, oddsByTeams: Map<string, OddsRow>) {
  return oddsByTeams.get(teamsKey(edge.home_team_name, edge.away_team_name))?.commence_time ?? null;
}

function atlasProbability(edge: MarketEdgeRow) {
  return numberValue(edge.atlas_probability);
}

function probabilityRank(edges: MarketEdgeRow[]) {
  return edges.toSorted((a, b) => {
    const probabilityDiff = (atlasProbability(b) ?? -1) - (atlasProbability(a) ?? -1);
    if (probabilityDiff !== 0) return probabilityDiff;
    return (numberValue(b.edge) ?? -1) - (numberValue(a.edge) ?? -1);
  });
}

function selectHighestProbabilityMarketByGame(edges: MarketEdgeRow[]) {
  const grouped = new Map<string, MarketEdgeRow[]>();
  for (const edge of edges) {
    if (!grouped.has(edge.official_game_id)) grouped.set(edge.official_game_id, []);
    grouped.get(edge.official_game_id)?.push(edge);
  }

  return Array.from(grouped.values())
    .map((gameEdges) => probabilityRank(gameEdges).find((edge) => atlasProbability(edge) !== null))
    .filter((edge): edge is MarketEdgeRow => Boolean(edge));
}

function selectMorningOpportunities(edges: MarketEdgeRow[]) {
  const config = getAtlasCoreMlbConfig();
  return selectHighestProbabilityMarketByGame(edges).filter((edge) => {
    const edgeValue = numberValue(edge.edge) ?? 0;
    return edge.direction !== "NONE" && edgeValue >= config.minFinalPickEdge && edge.classification !== "NO_EDGE";
  });
}

type AtlasCoreCandidate = {
  edge: MarketEdgeRow;
  decision?: DecisionRow;
  projection?: ProjectionRow;
  gate: ReturnType<typeof gate>;
  startTime: string | null;
};

async function buildAtlasCoreCandidates(params: { gameIds?: Set<string>; oddsRange?: { min: number; max: number } } = {}) {
  const { edges, decisionByGame, projectionByGame, oddsByTeams, oddsRows, slateDate } = await loadCanonicalRows();
  const selectedMarkets = selectHighestProbabilityMarketByGame(edges);
  const candidates = selectedMarkets
    .filter((edge) => !params.gameIds || params.gameIds.has(edge.official_game_id))
    .map((edge): AtlasCoreCandidate => {
      const decision = decisionByGame.get(edge.official_game_id);
      const projection = projectionByGame.get(edge.official_game_id);
      const startTime = gameStart(edge, oddsByTeams);
      return { edge, decision, projection, gate: gate(edge, decision, projection), startTime };
    })
    .filter((item) => timestampBelongsToMlbSlate(item.startTime, slateDate))
    .filter((item) => item.gate.passed)
    .filter((item) => {
      if (!params.oddsRange) return true;
      const odds = pickOdds(item.edge, oddsRows);
      return odds !== null && odds >= params.oddsRange.min && odds <= params.oddsRange.max;
    })
    .toSorted((a, b) => b.gate.ranking - a.gate.ranking);

  const onePerGame = new Map<string, AtlasCoreCandidate>();
  for (const item of candidates) {
    if (!onePerGame.has(item.edge.official_game_id)) onePerGame.set(item.edge.official_game_id, item);
  }

  return {
    candidates: Array.from(onePerGame.values()),
    oddsRows,
    slateDate,
  };
}

function firstStartTime(rows: Array<{ start_time?: string | null; startTime?: string | null }>) {
  return rows
    .map((row) => row.start_time ?? row.startTime ?? null)
    .filter((value): value is string => Boolean(value))
    .toSorted((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
}

function shouldFreeze(firstStart: string | null) {
  if (!firstStart) return false;
  return new Date(firstStart).getTime() - Date.now() <= SIGNAL_ENGINE_FREEZE_BEFORE_START_MINUTES * 60 * 1000;
}

function shouldValidate(startTime: string | null) {
  if (!startTime) return false;
  const delta = new Date(startTime).getTime() - Date.now();
  return delta <= SIGNAL_ENGINE_VALIDATE_BEFORE_START_MINUTES * 60 * 1000 && delta >= -15 * 60 * 1000;
}

function operationalPickRow(item: AtlasCoreCandidate, index: number, oddsRows: OddsRow[], params: { date: string; now: string; engineProduct: "EXCLUSIVE_TOP3" | "PREMIUM_TOP5" }) {
  return {
    date: sourceDateFromStart(item.startTime) || params.date,
    game_id: item.edge.official_game_id,
    away_team: item.edge.away_team_name,
    home_team: item.edge.home_team_name,
    start_time: item.startTime,
    sport: "MLB",
    pick: pickLabel(item.edge),
    market: pickMarket(item.edge.market),
    line: pickLine(item.edge),
    odds: pickOdds(item.edge, oddsRows),
    direction: item.edge.direction,
    rank: index + 1,
    status: "UNDER_REVIEW",
    is_top_signal: false,
    pick_ranking: item.gate.ranking,
    edge: item.gate.edgeValue,
    conviction_score: item.gate.conviction,
    conviction_grade: item.decision?.conviction_grade ?? null,
    consensus_score: item.gate.consensus,
    consensus_grade: item.decision?.consensus_grade ?? null,
    confidence: item.gate.confidence,
    validation_reasons: item.gate.reasons,
    warnings: item.gate.warnings,
    source_versions: { atlasCore: ATLAS_CORE_MLB_VERSION, projection: item.projection?.model_version, decision: item.decision?.model_version, marketEdge: item.edge.source_versions },
    source_snapshot_hashes: { projection: item.projection?.feature_hash, decision: item.decision?.feature_hash, marketEdge: item.edge.snapshot_hash },
    published_at: params.now,
    publication_blocked: false,
    publication_block_reason: null,
    engine_product: params.engineProduct,
    ranking_frozen_at: params.now,
    updated_at: params.now,
  };
}

async function insertTop5HistoryRows(params: {
  engine: "EXCLUSIVE_TOP3" | "PREMIUM_TOP5";
  runType: "INTERNAL_RANKING" | "OFFICIAL_FREEZE";
  rows: AtlasCoreCandidate[];
  oddsRows: OddsRow[];
  slateDate: string;
  frozen: boolean;
  published: boolean;
}) {
  if (!params.rows.length) return { inserted: 0, skipped: 0 };
  const supabase = getSupabaseAdmin();
  const runAt = new Date().toISOString();
  const payload = params.rows.map((item, index) => ({
    sport: "MLB",
    slate_date: params.slateDate,
    engine: params.engine,
    run_type: params.runType,
    game_id: item.edge.official_game_id,
    away_team: item.edge.away_team_name,
    home_team: item.edge.home_team_name,
    start_time: item.startTime,
    pick: pickLabel(item.edge),
    market: pickMarket(item.edge.market),
    line: pickLine(item.edge),
    odds: pickOdds(item.edge, params.oddsRows),
    direction: item.edge.direction,
    rank: index + 1,
    status: params.published ? "UNDER_REVIEW" : "INTERNAL",
    atlas_probability: item.gate.probability,
    edge: item.gate.edgeValue,
    score: item.gate.ranking,
    source_snapshot_hashes: { projection: item.projection?.feature_hash, decision: item.decision?.feature_hash, marketEdge: item.edge.snapshot_hash },
    frozen: params.frozen,
    published: params.published,
    run_at: runAt,
  }));
  const { data, error } = await supabase.from("top5_history").upsert(payload, { onConflict: "slate_date,engine,run_type,game_id" }).select("id");
  if (error) throw error;
  return { inserted: data?.length ?? 0, skipped: payload.length - (data?.length ?? 0) };
}

export async function runAtlasCoreMorningScan(params: { force?: boolean } = {}) {
  const config = getAtlasCoreMlbConfig();
  if (!config.enabled || config.legacyRollbackEnabled) return { enabled: false, skipped: true, reason: "Atlas Core MLB disabled or rollback enabled." };
  if (!params.force && currentHourET() !== config.morningScanHourEt) {
    return { enabled: true, skipped: true, reason: "Morning scan runs only at 7:00 AM ET." };
  }
  const { edges, projectionByGame, decisionByGame, oddsByTeams, oddsRows, slateDate } = await loadCanonicalRows();
  const date = todayET();
  const scanAt = new Date().toISOString();
  const opportunities = selectMorningOpportunities(edges).filter((edge) => {
    const startTime = gameStart(edge, oddsByTeams);
    return Boolean(projectionByGame.get(edge.official_game_id)) && Boolean(decisionByGame.get(edge.official_game_id)) && timestampBelongsToMlbSlate(startTime, slateDate);
  });
  const rows = opportunities.map((edge) => {
    const startTime = gameStart(edge, oddsByTeams);
    return {
      date: sourceDateFromStart(startTime) || date,
      game_id: edge.official_game_id,
      away_team: edge.away_team_name,
      home_team: edge.home_team_name,
      start_time: startTime,
      sport: "MLB",
      stage: "SIGNALS_DETECTED",
      morning_scan_at: scanAt,
      source_versions: {
        atlasCore: ATLAS_CORE_MLB_VERSION,
        marketEdge: edge.source_versions,
        projection: projectionByGame.get(edge.official_game_id)?.model_version ?? null,
        decision: decisionByGame.get(edge.official_game_id)?.model_version ?? null,
      },
      metadata: {
        freshnessStatus: "FRESH",
        slateDate,
        frozenBy: "7AM_MORNING_SCAN",
        opportunityClassification: edge.classification,
        detectedPick: pickLabel(edge),
        detectedMarket: pickMarket(edge.market),
        detectedLine: pickLine(edge),
        detectedOdds: pickOdds(edge, oddsRows),
        detectedDirection: edge.direction,
        detectedAtlasProbability: atlasProbability(edge),
        detectedMarketProbability: numberValue(edge.market_probability),
        detectedEdge: numberValue(edge.edge),
        detectedAt: scanAt,
      },
      frozen: true,
      publication_blocked: false,
      publication_block_reason: null,
      updated_at: scanAt,
    };
  });
  const supabase = getSupabaseAdmin();
  if (rows.length === 0) {
    await supabase
      .from("atlas_core_mlb_signals")
      .update({
        stage: "STALE_SOURCE",
        publication_blocked: true,
        publication_block_reason: "BLOCKED_STALE_UPSTREAM",
        metadata: { publicationBlocked: true, publicationBlockReason: "BLOCKED_STALE_UPSTREAM", slateDate },
        updated_at: scanAt,
      })
      .eq("date", date)
      .eq("stage", "SIGNALS_DETECTED");
    return { enabled: true, scanned: edges.length, inserted: 0, skippedDuplicates: 0, publicationBlocked: true, publicationBlockReason: "BLOCKED_STALE_UPSTREAM" };
  }
  const { data, error } = await supabase
    .from("atlas_core_mlb_signals")
    .upsert(rows, { onConflict: "date,game_id" })
    .select("id");
  if (error) throw error;
  const keepIds = rows.map((row) => row.game_id);
  if (keepIds.length) {
    await supabase
      .from("atlas_core_mlb_signals")
      .update({ stage: "SUPERSEDED", updated_at: scanAt })
      .eq("date", date)
      .eq("stage", "SIGNALS_DETECTED")
      .not("game_id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
  }
  return { enabled: true, scanned: edges.length, signalsDetected: rows.length, upserted: data?.length ?? 0, slateDate, freshnessGate: "PASSED" };
}

function gate(edge: MarketEdgeRow, decision?: DecisionRow, projection?: ProjectionRow) {
  const config = getAtlasCoreMlbConfig();
  const reasons: string[] = [];
  const warnings: string[] = [];
  const probability = atlasProbability(edge);
  const edgeValue = numberValue(edge.edge) ?? 0;
  const conviction = numberValue(decision?.conviction_score) ?? 0;
  const consensus = numberValue(decision?.consensus_score) ?? 0;
  const confidence = numberValue(decision?.decision_confidence_score) ?? 0;
  if (probability === null) warnings.push("Atlas probability unavailable.");
  else reasons.push(`Highest probability market selected (${Math.round(probability * 10000) / 100}%).`);
  if (!projection) warnings.push("STALE_PROJECTION_SNAPSHOT");
  else if (projection?.projection_availability !== "AVAILABLE") warnings.push("Projection unavailable or partial.");
  else reasons.push("Projection AVAILABLE");
  if (!decision) warnings.push("STALE_DECISION_SNAPSHOT");
  else if (decision.no_pick || String(decision.decision ?? "").includes("NO_PICK")) warnings.push("Decision is NO_PICK or unavailable.");
  else reasons.push("Decision passed");
  if (edge.direction === "NONE") warnings.push("Selected probability market has no positive market edge direction.");
  if (edgeValue < config.minFinalPickEdge) warnings.push("Edge below Final Pick Gate.");
  else reasons.push("Edge sufficient");
  if (conviction < config.minFinalPickConvictionScore) warnings.push("Conviction below Final Pick Gate.");
  else reasons.push("Conviction sufficient");
  if (consensus < config.minFinalPickConsensusScore) warnings.push("Consensus below Final Pick Gate.");
  else reasons.push("Consensus sufficient");
  const passed = warnings.length === 0;
  return { passed, reasons, warnings, probability, edgeValue, conviction, consensus, confidence, ranking: rankScore({ probability, edge: edgeValue, conviction, consensus, confidence }) };
}

export async function runAtlasCoreLiveValidation() {
  const config = getAtlasCoreMlbConfig();
  if (!config.enabled || config.legacyRollbackEnabled) return { enabled: false, skipped: true, reason: "Atlas Core MLB disabled or rollback enabled." };
  const { edges, decisionByGame, projectionByGame, oddsByTeams, oddsRows, slateDate } = await loadCanonicalRows();
  const selectedMarkets = selectHighestProbabilityMarketByGame(edges);
  const candidates = selectedMarkets
    .map((edge) => {
      const decision = decisionByGame.get(edge.official_game_id);
      const projection = projectionByGame.get(edge.official_game_id);
      const startTime = gameStart(edge, oddsByTeams);
      return { edge, decision, projection, gate: gate(edge, decision, projection), startTime };
    })
    .filter((item) => timestampBelongsToMlbSlate(item.startTime, slateDate))
    .filter((item) => item.gate.passed)
    .toSorted((a, b) => b.gate.ranking - a.gate.ranking);

  const onePerGame = new Map<string, (typeof candidates)[number]>();
  for (const item of candidates) {
    if (!onePerGame.has(item.edge.official_game_id)) onePerGame.set(item.edge.official_game_id, item);
  }
  const top = Array.from(onePerGame.values()).slice(0, 5);
  const date = todayET();
  const now = new Date().toISOString();
  const topSignalId = selectTopSignal(top, config.minTopSignalSeparation)?.edge.official_game_id ?? null;
  const rows = top.map((item, index) => {
    const startTime = gameStart(item.edge, oddsByTeams);
    return {
      date: sourceDateFromStart(startTime) || date,
      game_id: item.edge.official_game_id,
      away_team: item.edge.away_team_name,
      home_team: item.edge.home_team_name,
      start_time: startTime,
      sport: "MLB",
      pick: pickLabel(item.edge),
      market: pickMarket(item.edge.market),
      line: pickLine(item.edge),
      odds: pickOdds(item.edge, oddsRows),
      direction: item.edge.direction,
      rank: index + 1,
      status: "VALIDATED",
      is_top_signal: item.edge.official_game_id === topSignalId,
      pick_ranking: item.gate.ranking,
      edge: item.gate.edgeValue,
      conviction_score: item.gate.conviction,
      conviction_grade: item.decision?.conviction_grade ?? null,
      consensus_score: item.gate.consensus,
      consensus_grade: item.decision?.consensus_grade ?? null,
      confidence: item.gate.confidence,
      validation_reasons: item.gate.reasons,
      warnings: item.gate.warnings,
      source_versions: { atlasCore: ATLAS_CORE_MLB_VERSION, projection: item.projection?.model_version, decision: item.decision?.model_version, marketEdge: item.edge.source_versions },
      source_snapshot_hashes: { projection: item.projection?.feature_hash, decision: item.decision?.feature_hash, marketEdge: item.edge.snapshot_hash },
      published_at: now,
      publication_blocked: false,
      publication_block_reason: null,
      engine_product: "PREMIUM_TOP5",
      ranking_frozen_at: now,
      updated_at: now,
    };
  });
  const supabase = getSupabaseAdmin();
  if (rows.length === 0) {
    await supabase
      .from("atlas_core_mlb_picks")
      .update({
        status: "STALE_SOURCE",
        rank: null,
        is_top_signal: false,
        publication_blocked: true,
        publication_block_reason: "BLOCKED_STALE_UPSTREAM",
        warnings: ["BLOCKED_STALE_UPSTREAM"],
        updated_at: now,
      })
      .eq("date", date)
      .in("status", ["VALIDATED", "CONFIRMED"]);
    return { enabled: true, candidates: candidates.length, publishedTop5: 0, topSignalPublished: false, slateDate, publicationBlocked: true, publicationBlockReason: "BLOCKED_STALE_UPSTREAM" };
  }
  if (rows.length) {
    const { error } = await supabase.from("atlas_core_mlb_picks").upsert(rows, { onConflict: "date,game_id,engine_product" });
    if (error) throw error;
  }
  const keepIds = rows.map((row) => row.game_id);
  if (keepIds.length) {
    await supabase
      .from("atlas_core_mlb_picks")
      .update({ rank: null, is_top_signal: false, updated_at: now })
      .eq("date", date)
      .not("game_id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`)
      .eq("status", "VALIDATED");
  }
  return { enabled: true, candidates: candidates.length, publishedTop5: rows.length, topSignalPublished: Boolean(topSignalId), topSignalGameId: topSignalId, slateDate, freshnessGate: "PASSED" };
}

export async function runSignalsDetectedEngine() {
  const pipeline = await runAtlasCoreDailyPipeline("MORNING");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("atlas_core_mlb_signals")
    .select("id,date,game_id,away_team,home_team,start_time,metadata,morning_scan_at")
    .eq("date", pipeline.slateDate)
    .eq("stage", "SIGNALS_DETECTED")
    .order("start_time", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []).map((row: any, index: number) => ({
    sport: "MLB",
    slate_date: row.date,
    engine: "SIGNALS_DETECTED",
    game_id: row.game_id,
    away_team: row.away_team,
    home_team: row.home_team,
    start_time: row.start_time,
    pick: row.metadata?.detectedPick ?? "Pending",
    market: row.metadata?.detectedMarket ?? null,
    line: row.metadata?.detectedLine ?? null,
    odds: row.metadata?.detectedOdds ?? null,
    direction: row.metadata?.detectedDirection ?? null,
    rank: index + 1,
    status: "FROZEN",
    atlas_probability: row.metadata?.detectedAtlasProbability ?? null,
    edge: row.metadata?.detectedEdge ?? null,
    score: null,
    source_snapshot_hashes: row.metadata ?? {},
    frozen: true,
    published: true,
    run_at: row.morning_scan_at ?? new Date().toISOString(),
  }));
  if (rows.length) {
    const inserted = await supabase.from("signals_detected_history").upsert(rows, { onConflict: "slate_date,engine,game_id" }).select("id");
    if (inserted.error) throw inserted.error;
  }
  return { ...pipeline, signalsDetectedHistory: rows.length, engine: "SIGNALS_DETECTED" };
}

export async function runExclusiveTop3Engine() {
  const supabase = getSupabaseAdmin();
  const slateDate = resolveMlbSlateDate();
  const { data: signals, error } = await supabase
    .from("atlas_core_mlb_signals")
    .select("game_id,start_time")
    .eq("date", slateDate)
    .eq("stage", "SIGNALS_DETECTED")
    .order("start_time", { ascending: true });
  if (error) throw error;
  const frozenSignals = signals ?? [];
  if (!frozenSignals.length) return { enabled: true, engine: "EXCLUSIVE_TOP3", skipped: true, reason: "No frozen Signals Detected list for slate.", slateDate };

  const gameIds = new Set<string>(frozenSignals.map((row: any) => String(row.game_id)));
  const { candidates, oddsRows } = await buildAtlasCoreCandidates({ gameIds });
  const top3 = candidates.slice(0, 3);
  const freezeNow = shouldFreeze(firstStartTime(frozenSignals as any[]));
  await insertTop5HistoryRows({ engine: "EXCLUSIVE_TOP3", runType: freezeNow ? "OFFICIAL_FREEZE" : "INTERNAL_RANKING", rows: top3, oddsRows, slateDate, frozen: freezeNow, published: freezeNow });
  if (!freezeNow) {
    await supabase
      .from("atlas_core_mlb_picks")
      .update({ status: "INTERNAL_CANDIDATE", rank: null, is_top_signal: false, updated_at: new Date().toISOString() })
      .eq("date", slateDate)
      .eq("engine_product", "EXCLUSIVE_TOP3")
      .is("ranking_frozen_at", null);
    return { enabled: true, engine: "EXCLUSIVE_TOP3", internalRanked: top3.length, published: false, recalcMinutes: SIGNAL_ENGINE_RECALC_MINUTES, slateDate };
  }

  const now = new Date().toISOString();
  const existing = await supabase
    .from("atlas_core_mlb_picks")
    .select("id")
    .eq("date", slateDate)
    .eq("engine_product", "EXCLUSIVE_TOP3")
    .not("ranking_frozen_at", "is", null)
    .limit(1);
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length) return { enabled: true, engine: "EXCLUSIVE_TOP3", published: false, frozen: true, reason: "Top 3 already frozen.", slateDate };

  const rows = top3.map((item, index) => operationalPickRow(item, index, oddsRows, { date: slateDate, now, engineProduct: "EXCLUSIVE_TOP3" }));
  if (rows.length) {
    const upsert = await supabase.from("atlas_core_mlb_picks").upsert(rows, { onConflict: "date,game_id,engine_product" });
    if (upsert.error) throw upsert.error;
  }
  return { enabled: true, engine: "EXCLUSIVE_TOP3", published: true, frozen: true, top3: rows.length, slateDate };
}

export async function runPremiumTop5Engine() {
  const supabase = getSupabaseAdmin();
  const slateDate = resolveMlbSlateDate();
  const { candidates, oddsRows } = await buildAtlasCoreCandidates();
  const top5 = candidates.slice(0, 5);
  const freezeNow = shouldFreeze(firstStartTime(top5.map((item) => ({ start_time: item.startTime }))));
  await insertTop5HistoryRows({ engine: "PREMIUM_TOP5", runType: freezeNow ? "OFFICIAL_FREEZE" : "INTERNAL_RANKING", rows: top5, oddsRows, slateDate, frozen: freezeNow, published: freezeNow });
  if (!freezeNow) {
    await supabase
      .from("atlas_core_mlb_picks")
      .update({ status: "INTERNAL_CANDIDATE", rank: null, is_top_signal: false, updated_at: new Date().toISOString() })
      .eq("date", slateDate)
      .eq("engine_product", "PREMIUM_TOP5")
      .is("ranking_frozen_at", null);
    return { enabled: true, engine: "PREMIUM_TOP5", internalRanked: top5.length, published: false, recalcMinutes: SIGNAL_ENGINE_RECALC_MINUTES, slateDate };
  }

  const now = new Date().toISOString();
  const existing = await supabase
    .from("atlas_core_mlb_picks")
    .select("id")
    .eq("date", slateDate)
    .eq("engine_product", "PREMIUM_TOP5")
    .not("ranking_frozen_at", "is", null)
    .limit(1);
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length) return { enabled: true, engine: "PREMIUM_TOP5", published: false, frozen: true, reason: "Top 5 already frozen.", slateDate };

  const rows = top5.map((item, index) => operationalPickRow(item, index, oddsRows, { date: slateDate, now, engineProduct: "PREMIUM_TOP5" }));
  if (rows.length) {
    const upsert = await supabase.from("atlas_core_mlb_picks").upsert(rows, { onConflict: "date,game_id,engine_product" });
    if (upsert.error) throw upsert.error;
  }
  return { enabled: true, engine: "PREMIUM_TOP5", published: true, frozen: true, top5: rows.length, slateDate };
}

export async function runTopSignalEngine() {
  const supabase = getSupabaseAdmin();
  const { candidates, oddsRows, slateDate } = await buildAtlasCoreCandidates({ oddsRange: { min: TOP_SIGNAL_MIN_ODDS, max: TOP_SIGNAL_MAX_ODDS } });
  const leader = candidates[0] ?? null;
  if (!leader) return { enabled: true, engine: "TOP_SIGNAL", published: false, reason: "No candidate inside Top Signal odds range.", slateDate };

  const previous = await supabase
    .from("top_signal_history")
    .select("game_id,consecutive_leader_hours")
    .eq("sport", "MLB")
    .eq("slate_date", slateDate)
    .order("run_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previous.error) throw previous.error;
  const consecutive = previous.data?.game_id === leader.edge.official_game_id ? Number(previous.data.consecutive_leader_hours ?? 0) + 1 : 1;
  const now = new Date().toISOString();
  const readyToPublish = shouldFreeze(leader.startTime);
  const historyRow = {
    sport: "MLB",
    slate_date: slateDate,
    engine: "TOP_SIGNAL",
    game_id: leader.edge.official_game_id,
    away_team: leader.edge.away_team_name,
    home_team: leader.edge.home_team_name,
    start_time: leader.startTime,
    pick: pickLabel(leader.edge),
    market: pickMarket(leader.edge.market),
    line: pickLine(leader.edge),
    odds: pickOdds(leader.edge, oddsRows),
    direction: leader.edge.direction,
    atlas_probability: leader.gate.probability,
    edge: leader.gate.edgeValue,
    score: leader.gate.ranking,
    consecutive_leader_hours: consecutive,
    status: readyToPublish ? "READY" : "CANDIDATE",
    source_snapshot_hashes: { projection: leader.projection?.feature_hash, decision: leader.decision?.feature_hash, marketEdge: leader.edge.snapshot_hash },
    published: readyToPublish,
    run_at: now,
  };
  const insert = await supabase.from("top_signal_history").insert(historyRow).select("id").maybeSingle();
  if (insert.error) throw insert.error;
  return {
    enabled: true,
    engine: "TOP_SIGNAL",
    candidate: historyRow.pick,
    odds: historyRow.odds,
    consecutiveLeaderHours: consecutive,
    published: readyToPublish,
    status: historyRow.status,
    historyId: insert.data?.id ?? null,
    slateDate,
  };
}

export async function runAtlasSignalEnginesValidation() {
  const supabase = getSupabaseAdmin();
  const slateDate = resolveMlbSlateDate();
  const { data, error } = await supabase
    .from("atlas_core_mlb_picks")
    .select("id,start_time,warnings,status,engine_product")
    .eq("date", slateDate)
    .eq("status", "UNDER_REVIEW")
    .in("engine_product", ["EXCLUSIVE_TOP3", "PREMIUM_TOP5"]);
  if (error) throw error;
  const rows = data ?? [];
  let updated = 0;
  for (const row of rows) {
    if (!shouldValidate(row.start_time)) continue;
    const nextStatus = Array.isArray(row.warnings) && row.warnings.length ? "DOWNGRADED" : "CONFIRMED";
    const update = await supabase
      .from("atlas_core_mlb_picks")
      .update({ status: nextStatus, final_validated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (!update.error) updated += 1;
  }
  return { enabled: true, slateDate, checked: rows.length, updated };
}

export async function runAtlasCoreDailyPipeline(mode: "MORNING" | "LIVE") {
  const slateDate = resolveMlbSlateDate();
  const projectionCapture = await buildMlbProjectionResearchSnapshots();
  const projectionStorage = await insertProjectionResearchSnapshotsDeduped(projectionCapture.projections);
  const decisionCapture = await buildDecisionResearchSnapshots();
  const decisionStorage = await insertDecisionResearchSnapshotsDeduped(decisionCapture.decisions);
  const marketEdgeCapture = await buildMarketEdgeResearchSnapshots();
  const marketEdgeStorage = await insertMarketEdgeSnapshotsDeduped(marketEdgeCapture.marketEdges);
  const atlasCore =
    mode === "MORNING"
      ? await runAtlasCoreMorningScan({ force: true })
      : { enabled: true, skipped: true, reason: "LIVE pipeline refreshes upstream only. Signal Engines V2 own publication." };

  return {
    ok: true,
    mode,
    slateDate,
    projection: { games: projectionCapture.projections.length, inserted: projectionStorage.inserted, skipped: projectionStorage.skipped, errors: projectionStorage.errors },
    decision: { games: decisionCapture.decisions.length, inserted: decisionStorage.inserted, skipped: decisionStorage.skipped, errors: decisionStorage.errors },
    marketEdge: { markets: marketEdgeCapture.marketEdges.length, inserted: marketEdgeStorage.inserted, skipped: marketEdgeStorage.skipped, errors: marketEdgeStorage.errors },
    atlasCore,
    pipelineHealth:
      projectionStorage.errors.length === 0 &&
      decisionStorage.errors.length === 0 &&
      marketEdgeStorage.errors.length === 0 &&
      !(atlasCore as any).publicationBlocked,
  };
}

function selectTopSignal<T extends { gate: { ranking: number }; edge: { official_game_id: string } }>(items: T[], minimumSeparation: number) {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return items[0].gate.ranking - items[1].gate.ranking >= minimumSeparation ? items[0] : null;
}

export async function runAtlasCoreFinalValidation() {
  const config = getAtlasCoreMlbConfig();
  if (!config.enabled || config.legacyRollbackEnabled) return { enabled: false, skipped: true, reason: "Atlas Core MLB disabled or rollback enabled." };
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const from = new Date(now + 30 * 60 * 1000).toISOString();
  const to = new Date(now + 45 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("atlas_core_mlb_picks")
    .select("*")
    .eq("date", todayET())
    .eq("status", "VALIDATED")
    .gte("start_time", from)
    .lte("start_time", to);
  if (error) throw error;
  const rows = data ?? [];
  let updated = 0;
  for (const row of rows) {
    const nextStatus = Array.isArray(row.warnings) && row.warnings.length ? "DOWNGRADED" : "CONFIRMED";
    const { error: updateError } = await supabase
      .from("atlas_core_mlb_picks")
      .update({ status: nextStatus, final_validated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (!updateError) updated += 1;
  }
  return { enabled: true, checked: rows.length, updated };
}

export async function runAtlasCorePostgame() {
  const config = getAtlasCoreMlbConfig();
  if (!config.enabled || config.legacyRollbackEnabled) return { enabled: false, skipped: true, reason: "Atlas Core MLB disabled or rollback enabled." };
  const [validationCapture, validationGrade] = await Promise.all([captureValidationHistory(), gradeValidationHistory()]);
  const performance = await calculatePerformanceAnalytics();
  const learning = await analyzeLearningInsights();
  return {
    enabled: true,
    validationCapture,
    validationGrade,
    performance: { sampleSize: performance.snapshot.sampleSize, inserted: performance.inserted, skipped: performance.skipped },
    learning: { sampleSize: learning.analysis.sampleSize, insights: learning.analysis.insights.length, inserted: learning.inserted, skipped: learning.skipped },
  };
}

export async function getAtlasCoreMlbStatus() {
  const supabase = getSupabaseAdmin();
  const date = todayET();
  const [signals, picks] = await Promise.all([
    supabase.from("atlas_core_mlb_signals").select("id", { count: "exact", head: true }).eq("date", date).eq("stage", "SIGNALS_DETECTED"),
    supabase.from("atlas_core_mlb_picks").select("status,is_top_signal", { count: "exact" }).eq("date", date),
  ]);
  const pickRows = picks.data ?? [];
  return {
    config: getAtlasCoreMlbConfig(),
    date,
    signalsDetected: signals.count ?? 0,
    validatedPicks: pickRows.filter((row: any) => ["VALIDATED", "CONFIRMED"].includes(row.status)).length,
    confirmed: pickRows.filter((row: any) => row.status === "CONFIRMED").length,
    downgraded: pickRows.filter((row: any) => row.status === "DOWNGRADED").length,
    removed: pickRows.filter((row: any) => row.status === "REMOVED").length,
    topSignalPublished: pickRows.some((row: any) => row.is_top_signal),
    rollbackAvailable: true,
    legacyEngine: "available via ATLAS_CORE_MLB_ROLLBACK_TO_LEGACY=true",
  };
}
