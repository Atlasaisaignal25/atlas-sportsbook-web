import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { ATLAS_CORE_MLB_VERSION, currentHourET, getAtlasCoreMlbConfig, todayET } from "./atlas-core-config";
import { captureValidationHistory, gradeValidationHistory } from "@/app/lib/mlb-engine/sports-intelligence/validation-history/validation-history-repository";
import { calculatePerformanceAnalytics } from "@/app/lib/mlb-engine/sports-intelligence/performance/performance-analytics-repository";
import { analyzeLearningInsights } from "@/app/lib/mlb-engine/sports-intelligence/learning/learning-repository";

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
};

type ProjectionRow = {
  official_game_id: string;
  projection_availability: string | null;
  feature_hash: string | null;
  model_version: string | null;
  captured_at: string;
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
  const [edges, decisions, projections, odds] = await Promise.all([
    supabase
      .from("mlb_market_edge_research_snapshots")
      .select("official_game_id,home_team_name,away_team_name,market,atlas_probability,market_probability,edge,value_percent,direction,classification,market_context,source_versions,snapshot_hash,captured_at")
      .eq("model_version", "mlb_market_edge_research_v1")
      .eq("canonical", true)
      .limit(300),
    supabase
      .from("mlb_decision_research_snapshots")
      .select("official_game_id,decision,consensus_grade,consensus_score,conviction_grade,conviction_score,decision_confidence_score,no_pick,feature_hash,model_version,captured_at")
      .eq("model_version", "mlb_decision_engine_v1")
      .eq("canonical", true)
      .limit(300),
    supabase
      .from("mlb_projection_research_snapshots")
      .select("official_game_id,projection_availability,feature_hash,model_version,captured_at")
      .eq("model_version", "mlb_projection_research_v1")
      .eq("canonical", true)
      .limit(300),
    supabase
      .from("market_odds_snapshots")
      .select("event_id,commence_time,home_team,away_team,market_key,outcome_name,point,price,captured_at")
      .eq("sport", "MLB")
      .order("captured_at", { ascending: false })
      .limit(5000),
  ]);
  if (edges.error) throw edges.error;
  if (decisions.error) throw decisions.error;
  if (projections.error) throw projections.error;
  const decisionByGame = new Map(((decisions.data ?? []) as DecisionRow[]).map((row) => [row.official_game_id, row]));
  const projectionByGame = new Map(((projections.data ?? []) as ProjectionRow[]).map((row) => [row.official_game_id, row]));
  const oddsByTeams = new Map<string, OddsRow>();
  const oddsRows = (odds.data ?? []) as OddsRow[];
  for (const row of oddsRows) {
    const key = teamsKey(row.home_team, row.away_team);
    if (!oddsByTeams.has(key)) oddsByTeams.set(key, row);
  }
  return {
    edges: (edges.data ?? []) as MarketEdgeRow[],
    decisionByGame,
    projectionByGame,
    oddsByTeams,
    oddsRows,
  };
}

function gameStart(edge: MarketEdgeRow, oddsByTeams: Map<string, OddsRow>) {
  return oddsByTeams.get(teamsKey(edge.home_team_name, edge.away_team_name))?.commence_time ?? null;
}

function isOpportunity(edge: MarketEdgeRow) {
  return edge.direction !== "NONE" && (numberValue(edge.edge) ?? 0) > 0 && edge.classification !== "NO_EDGE";
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
  const byGame = new Map<string, MarketEdgeRow>();
  const ranked = edges
    .filter(isOpportunity)
    .toSorted((a, b) => {
      const edgeDiff = (numberValue(b.edge) ?? 0) - (numberValue(a.edge) ?? 0);
      if (edgeDiff !== 0) return edgeDiff;
      return (numberValue(b.value_percent) ?? 0) - (numberValue(a.value_percent) ?? 0);
    });

  for (const edge of ranked) {
    if (!byGame.has(edge.official_game_id)) byGame.set(edge.official_game_id, edge);
  }

  return Array.from(byGame.values());
}

export async function runAtlasCoreMorningScan(params: { force?: boolean } = {}) {
  const config = getAtlasCoreMlbConfig();
  if (!config.enabled || config.legacyRollbackEnabled) return { enabled: false, skipped: true, reason: "Atlas Core MLB disabled or rollback enabled." };
  if (!params.force && currentHourET() !== config.morningScanHourEt) {
    return { enabled: true, skipped: true, reason: "Morning scan runs only at 7:00 AM ET." };
  }
  const { edges, projectionByGame, decisionByGame, oddsByTeams, oddsRows } = await loadCanonicalRows();
  const date = todayET();
  const scanAt = new Date().toISOString();
  const opportunities = selectMorningOpportunities(edges);
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
        frozenBy: "7AM_MORNING_SCAN",
        opportunityClassification: edge.classification,
        detectedPick: pickLabel(edge),
        detectedMarket: pickMarket(edge.market),
        detectedLine: pickLine(edge),
        detectedOdds: pickOdds(edge, oddsRows),
        detectedDirection: edge.direction,
        detectedEdge: numberValue(edge.edge),
        detectedAt: scanAt,
      },
      frozen: true,
      updated_at: scanAt,
    };
  });
  if (rows.length === 0) return { enabled: true, scanned: edges.length, inserted: 0, skippedDuplicates: 0 };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("atlas_core_mlb_signals")
    .upsert(rows, { onConflict: "date,game_id" })
    .select("id");
  if (error) throw error;
  return { enabled: true, scanned: edges.length, signalsDetected: rows.length, upserted: data?.length ?? 0 };
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
  if (projection?.projection_availability !== "AVAILABLE") warnings.push("Projection unavailable or partial.");
  else reasons.push("Projection AVAILABLE");
  if (!decision || decision.no_pick || String(decision.decision ?? "").includes("NO_PICK")) warnings.push("Decision is NO_PICK or unavailable.");
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
  const { edges, decisionByGame, projectionByGame, oddsByTeams, oddsRows } = await loadCanonicalRows();
  const selectedMarkets = selectHighestProbabilityMarketByGame(edges);
  const candidates = selectedMarkets
    .map((edge) => {
      const decision = decisionByGame.get(edge.official_game_id);
      const projection = projectionByGame.get(edge.official_game_id);
      return { edge, decision, projection, gate: gate(edge, decision, projection) };
    })
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
      updated_at: now,
    };
  });
  const supabase = getSupabaseAdmin();
  if (rows.length) {
    const { error } = await supabase.from("atlas_core_mlb_picks").upsert(rows, { onConflict: "date,game_id" });
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
  return { enabled: true, candidates: candidates.length, publishedTop5: rows.length, topSignalPublished: Boolean(topSignalId), topSignalGameId: topSignalId };
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
    supabase.from("atlas_core_mlb_signals").select("id", { count: "exact", head: true }).eq("date", date),
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
