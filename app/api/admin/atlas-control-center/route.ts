import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { getAtlasCoreMlbConfig } from "@/app/lib/mlb-engine/atlas-core/atlas-core-config";
import { resolveMlbSlateWindow, timestampBelongsToMlbSlate } from "@/app/lib/mlb-engine/slate-date";

export const dynamic = "force-dynamic";

type DbRow = Record<string, any>;

const ET_TIMEZONE = "America/New_York";
const ENGINE_RECALC_MINUTES = 60;
const TOP_SIGNAL_MIN_ODDS = Number(process.env.TOP_SIGNAL_MIN_ODDS ?? process.env.ATLAS_TOP_SIGNAL_MIN_ODDS ?? -160);
const TOP_SIGNAL_MAX_ODDS = Number(process.env.TOP_SIGNAL_MAX_ODDS ?? process.env.ATLAS_TOP_SIGNAL_MAX_ODDS ?? 120);

function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ET_TIMEZONE });
}

function dateTimeET(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ET_TIMEZONE,
  }).format(date);
}

function timeET(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ET_TIMEZONE,
  }).format(date);
}

function addMinutes(value: string | null | undefined, minutes: number) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function firstStart(rows: DbRow[]) {
  return rows
    .map((row) => row.start_time)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
}

function publicationWindow(startTime?: string | null) {
  if (!startTime) return "Pending schedule";
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return "Pending schedule";
  const open = new Date(start.getTime() - 60 * 60 * 1000);
  const close = new Date(start.getTime() - 30 * 60 * 1000);
  return `${timeET(open.toISOString()) ?? "TBD"} - ${timeET(close.toISOString()) ?? "TBD"} ET`;
}

function finalReview(startTime?: string | null) {
  if (!startTime) return null;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() - 60 * 60 * 1000).toISOString();
}

function num(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function eventName(row: DbRow | null | undefined) {
  if (!row) return "N/A";
  return row.event ?? `${row.away_team ?? row.awayTeam ?? "Away"} @ ${row.home_team ?? row.homeTeam ?? "Home"}`;
}

function marketLabel(row: DbRow | null | undefined) {
  const market = String(row?.market ?? "").toUpperCase();
  if (market === "H2H" || market === "MONEYLINE") return "ML";
  if (market === "SPREADS") return "SPREADS";
  if (market === "TOTALS") return "TOTALS";
  return market || "N/A";
}

function pickLabel(row: DbRow | null | undefined) {
  if (!row) return "N/A";
  const line = num(row.line);
  const lineText = line === null ? "" : ` ${line > 0 ? "+" : ""}${line}`;
  return `${row.pick ?? row.selection ?? "Pending"}${lineText}`;
}

function scoreOf(row: DbRow | null | undefined) {
  return num(row?.score) ?? num(row?.engineScore) ?? num(row?.pick_ranking) ?? 0;
}

function sourceMetadata(params: { engine: string; table: string; rows: DbRow[]; timestampField?: string }) {
  const timestampField = params.timestampField ?? "run_at";
  const latestTimestamp = params.rows
    .map((row) => row[timestampField] ?? row.updated_at ?? row.created_at ?? null)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  return {
    engine: params.engine,
    table: params.table,
    rowCount: params.rows.length,
    latestTimestamp,
  };
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

function edgeMarket(row: DbRow) {
  const market = String(row.market ?? "").toUpperCase();
  if (market === "MONEYLINE") return "h2h";
  if (market === "RUN_LINE") return "spreads";
  return "totals";
}

function edgeLine(row: DbRow) {
  const context = row.market_context ?? {};
  const market = String(row.market ?? "").toUpperCase();
  if (market === "RUN_LINE") {
    return row.direction === "HOME" ? num(context.homePoint) : row.direction === "AWAY" ? num(context.awayPoint) : null;
  }
  if (market === "TOTALS") return num(context.point);
  return null;
}

function edgeOutcome(row: DbRow) {
  const market = String(row.market ?? "").toUpperCase();
  if (market === "TOTALS") return row.direction === "UNDER" ? "under" : "over";
  if (row.direction === "HOME") return row.home_team_name;
  if (row.direction === "AWAY") return row.away_team_name;
  return "";
}

function edgePickLabel(row: DbRow) {
  const market = String(row.market ?? "").toUpperCase();
  if (market === "TOTALS") {
    const line = edgeLine(row);
    return `${row.direction === "UNDER" ? "Under" : "Over"}${line === null ? "" : ` ${line}`}`;
  }
  const team = row.direction === "HOME" ? row.home_team_name : row.away_team_name;
  if (market === "RUN_LINE") {
    const line = edgeLine(row);
    return `${team}${line === null ? "" : ` (${line > 0 ? "+" : ""}${line})`}`;
  }
  return `${team} ML`;
}

function edgeOdds(row: DbRow, oddsRows: DbRow[]) {
  const context = row.market_context ?? {};
  const contextPrice =
    row.direction === "HOME"
      ? num(context.homePrice)
      : row.direction === "AWAY"
        ? num(context.awayPrice)
        : row.direction === "OVER"
          ? num(context.overPrice)
          : row.direction === "UNDER"
            ? num(context.underPrice)
            : null;
  if (contextPrice !== null) return contextPrice;

  const market = edgeMarket(row);
  const line = edgeLine(row);
  const teamKey = teamsKey(row.home_team_name, row.away_team_name);
  const outcome = normalizeName(edgeOutcome(row));
  const odds = oddsRows.find((item) => {
    if (teamsKey(item.home_team, item.away_team) !== teamKey) return false;
    if (item.market_key !== market) return false;
    if (normalizeName(item.outcome_name) !== outcome) return false;
    const point = num(item.point);
    return line === null || point === null || Number(point) === Number(line);
  });
  return num(odds?.price);
}

function topSignalGameStart(row: DbRow, oddsByTeams: Map<string, DbRow>) {
  return oddsByTeams.get(teamsKey(row.home_team_name, row.away_team_name))?.commence_time ?? null;
}

function topSignalMarketStatus(row: DbRow) {
  const context = row.market_context ?? {};
  return String(context.status ?? context.gameStatus ?? context.eventStatus ?? context.state ?? "").toUpperCase();
}

function topSignalMinutesUntilStart(startTime: string | null) {
  if (!startTime) return null;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return null;
  return (start.getTime() - Date.now()) / 60000;
}

function isPregameTopSignalCandidate(row: DbRow, startTime: string | null) {
  const status = topSignalMarketStatus(row);
  const blockedStatuses = new Set(["LIVE", "IN_PROGRESS", "FINAL", "CANCELLED", "CANCELED", "POSTPONED"]);
  if (blockedStatuses.has(status)) return false;
  const allowedStatuses = new Set(["", "PRE_GAME", "PREGAME", "NOT_STARTED", "PENDING", "SCHEDULED"]);
  if (!allowedStatuses.has(status)) return false;
  const minutes = topSignalMinutesUntilStart(startTime);
  return minutes !== null && minutes > 0;
}

function probabilityFirstEdges(edges: DbRow[]) {
  const grouped = new Map<string, DbRow[]>();
  for (const edge of edges) {
    if (!grouped.has(edge.official_game_id)) grouped.set(edge.official_game_id, []);
    grouped.get(edge.official_game_id)?.push(edge);
  }
  return Array.from(grouped.values())
    .map((gameEdges) => gameEdges.toSorted((a, b) => {
      const probabilityDiff = (num(b.atlas_probability) ?? -1) - (num(a.atlas_probability) ?? -1);
      if (probabilityDiff !== 0) return probabilityDiff;
      return (num(b.edge) ?? -1) - (num(a.edge) ?? -1);
    }).find((edge) => num(edge.atlas_probability) !== null))
    .filter((edge): edge is DbRow => Boolean(edge));
}

function topSignalGate(edge: DbRow, decision?: DbRow, projection?: DbRow) {
  const config = getAtlasCoreMlbConfig();
  const probability = num(edge.atlas_probability);
  const edgeValue = num(edge.edge) ?? 0;
  const conviction = num(decision?.conviction_score) ?? 0;
  const consensus = num(decision?.consensus_score) ?? 0;
  const confidence = num(decision?.decision_confidence_score) ?? 0;
  const warnings: string[] = [];
  if (probability === null) warnings.push("Atlas probability unavailable.");
  if (!projection || projection.projection_availability !== "AVAILABLE") warnings.push("Projection unavailable or partial.");
  if (!decision || decision.no_pick || String(decision.decision ?? "").includes("NO_PICK")) warnings.push("Decision is NO_PICK or unavailable.");
  if (edge.direction === "NONE") warnings.push("Selected probability market has no positive market edge direction.");
  if (edgeValue < config.minFinalPickEdge) warnings.push("Edge below Final Pick Gate.");
  if (conviction < config.minFinalPickConvictionScore) warnings.push("Conviction below Final Pick Gate.");
  if (consensus < config.minFinalPickConsensusScore) warnings.push("Consensus below Final Pick Gate.");
  return {
    passed: warnings.length === 0,
    probability,
    edgeValue,
    conviction,
    consensus,
    confidence,
    ranking: Math.round((probability ?? 0) * 10000 + edgeValue * 100 + conviction * 1.2 + consensus * 0.9 + confidence * 0.8),
    warnings,
  };
}

function candidateFromRow(row: DbRow | null | undefined) {
  if (!row) return null;
  return {
    sport: row.sport,
    event: eventName(row),
    awayTeam: row.away_team ?? row.awayTeam ?? null,
    homeTeam: row.home_team ?? row.homeTeam ?? null,
    market: marketLabel(row),
    selection: pickLabel(row),
    odds: num(row.odds),
    atlasProbability: num(row.atlas_probability) ?? num(row.atlasProbability),
    edge: num(row.edge),
    score: scoreOf(row),
    status: row.status,
    gameId: row.game_id ?? row.gameId,
    runAt: row.run_at ?? row.runAt,
  };
}

function delta(current: unknown, previous: unknown) {
  const next = num(current);
  const prev = num(previous);
  if (next === null || prev === null) return null;
  return next - prev;
}

function publicPickRows(rows: DbRow[]) {
  return rows.filter((row) => {
    const status = String(row.status ?? "").toUpperCase();
    return !["INTERNAL_CANDIDATE", "STALE_SOURCE", "REMOVED", "SUPERSEDED"].includes(status);
  });
}

function latestRun(rows: DbRow[], engine: string, runType: string) {
  const matches = rows.filter((row) => row.engine === engine && row.run_type === runType);
  const latest = matches.map((row) => row.run_at).filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  if (!latest) return [];
  return matches.filter((row) => row.run_at === latest).sort((a, b) => Number(a.rank ?? 999) - Number(b.rank ?? 999));
}

function previousRun(rows: DbRow[], engine: string, runType: string, currentRunAt?: string | null) {
  const runTimes = Array.from(
    new Set(rows.filter((row) => row.engine === engine && row.run_type === runType).map((row) => row.run_at).filter(Boolean))
  ).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const currentIndex = currentRunAt ? runTimes.indexOf(currentRunAt) : 0;
  const previous = runTimes[currentIndex + 1];
  if (!previous) return [];
  return rows
    .filter((row) => row.engine === engine && row.run_type === runType && row.run_at === previous)
    .sort((a, b) => Number(a.rank ?? 999) - Number(b.rank ?? 999));
}

function rankingRows(current: DbRow[], previous: DbRow[]) {
  const previousByGame = new Map(previous.map((row) => [String(row.game_id), row]));
  return current.map((row) => {
    const previousRow = previousByGame.get(String(row.game_id)) ?? null;
    const previousRank = previousRow ? Number(previousRow.rank) : null;
    const rank = Number(row.rank ?? 0);
    const positionChange = previousRank === null ? null : previousRank - rank;
    const trendChange = positionChange ?? 0;
    const trend = previousRank === null ? "NEW" : trendChange > 0 ? "UP" : trendChange < 0 ? "DOWN" : "SAME";
    return {
      sport: row.sport,
      event: eventName(row),
      awayTeam: row.away_team ?? null,
      homeTeam: row.home_team ?? null,
      gameId: row.game_id,
      market: marketLabel(row),
      selection: pickLabel(row),
      odds: num(row.odds),
      atlasProbability: num(row.atlas_probability),
      edge: num(row.edge),
      score: scoreOf(row),
      rank,
      previousRank,
      positionChange,
      trend,
      probabilityDelta: previousRow ? delta(row.atlas_probability, previousRow.atlas_probability) : null,
      edgeDelta: previousRow ? delta(row.edge, previousRow.edge) : null,
      scoreDelta: previousRow ? delta(scoreOf(row), scoreOf(previousRow)) : null,
      status: row.status,
      frozen: Boolean(row.frozen),
      published: Boolean(row.published),
      runAt: row.run_at,
      startTime: row.start_time,
    };
  });
}

function rankingMovement(current: ReturnType<typeof rankingRows>, previous: DbRow[]) {
  const currentIds = new Set(current.map((row) => String(row.gameId)));
  const moved = current.map((row) => ({
    timestamp: row.runAt,
    signal: row.selection,
    event: row.previousRank === null
      ? `${row.selection} entered at #${row.rank}`
      : row.trend === "SAME"
        ? `${row.selection} held #${row.rank}`
        : `${row.selection} moved #${row.previousRank} to #${row.rank}`,
    previousRank: row.previousRank,
    newRank: row.rank,
    probabilityDelta: row.probabilityDelta,
    edgeDelta: row.edgeDelta,
    scoreDelta: row.scoreDelta,
    movementType: row.previousRank === null ? "ENTERED" : row.trend === "UP" ? "MOVED UP" : row.trend === "DOWN" ? "MOVED DOWN" : "HELD",
    trend: row.trend,
    positionChange: row.positionChange,
    gameId: row.gameId,
  }));
  const exited = previous
    .filter((row) => !currentIds.has(String(row.game_id)))
    .map((row) => ({
      timestamp: row.run_at,
      signal: pickLabel(row),
      event: `${pickLabel(row)} exited ranking`,
      previousRank: Number(row.rank ?? 0),
      newRank: null,
      probabilityDelta: null,
      edgeDelta: null,
      scoreDelta: null,
      movementType: "EXITED",
      trend: "OUT",
      positionChange: null,
      gameId: row.game_id,
    }));
  return [...moved, ...exited];
}

function stability(latest: DbRow | null, timeline: DbRow[], secondPlace: DbRow | null) {
  if (!latest) return "IDLE";
  const leaderChanges = timeline.reduce((count, row, index) => {
    const prev = timeline[index - 1];
    return prev && prev.game_id !== row.game_id ? count + 1 : count;
  }, 0);
  const consecutive = Number(latest.consecutive_leader_hours ?? 1);
  const separation = secondPlace ? scoreOf(latest) - scoreOf(secondPlace) : null;
  if (consecutive >= 3 && leaderChanges <= 1 && (separation === null || separation >= 2)) return "HIGH";
  if (consecutive >= 2 && leaderChanges <= 3) return "MEDIUM";
  return "LOW";
}

function engineStatus(lastRun: string | null, errors: string[], rowsProcessed: number) {
  if (errors.length) return "ERROR";
  if (!lastRun) return "IDLE";
  const ageMinutes = (Date.now() - new Date(lastRun).getTime()) / 60000;
  if (rowsProcessed === 0) return "PARTIAL";
  if (ageMinutes > 150) return "WARNING";
  return "HEALTHY";
}

function activitySeverity(status: string) {
  const value = status.toUpperCase();
  if (["CONFIRMED", "READY", "PUBLISHED", "FROZEN"].includes(value)) return "SUCCESS";
  if (["DOWNGRADED", "PASSED_OVER", "STALE_SOURCE"].includes(value)) return "WARNING";
  if (["REMOVED", "WITHDRAWN", "ERROR"].includes(value)) return "ERROR";
  return "INFO";
}

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function durationLabel(minutes: number | null) {
  if (minutes === null) return "N/A";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function topSignalSessionNumber(sessionId: unknown) {
  const match = String(sessionId ?? "").match(/session_(\d+)$/i);
  return match ? Number(match[1]) : null;
}

function topSignalStoryStatus(row: DbRow, previous: DbRow | null) {
  const rawStatus = String(row.status ?? "").toUpperCase();
  if (Boolean(row.published)) return "Published";
  if (["REMOVED", "WITHDRAWN"].includes(rawStatus)) return "Removed";
  if (["FAILED", "REVIEW_FAILED", "DOWNGRADED"].includes(rawStatus)) return "Review Failed";
  if (["READY", "CONFIRMED", "VALIDATED"].includes(rawStatus)) return previous ? "Review Passed" : "Leader Established";
  if (!previous) return "Leader Established";
  if (previous.game_id !== row.game_id) return "Leader Replaced";

  const probabilityDelta = delta(row.atlas_probability, previous.atlas_probability);
  if (probabilityDelta !== null && probabilityDelta > 0.0005) return "Confidence Improved";
  if (probabilityDelta !== null && probabilityDelta < -0.0005) return "Confidence Reduced";
  return "Stable";
}

function topSignalSessionLabel(sessionId: unknown, fallbackIndex: number) {
  const parsed = topSignalSessionNumber(sessionId);
  return `SESSION ${parsed ?? fallbackIndex}`;
}

function changeReasons(timeline: DbRow[]) {
  return timeline.map((row, index) => {
    const previous = timeline[index - 1] ?? null;
    const reasons: string[] = [];
    if (previous) {
      const probabilityDelta = delta(row.atlas_probability, previous.atlas_probability);
      const edgeDelta = delta(row.edge, previous.edge);
      const scoreDelta = delta(scoreOf(row), scoreOf(previous));
      if (probabilityDelta !== null && probabilityDelta !== 0) reasons.push(`Atlas Probability ${probabilityDelta > 0 ? "increased" : "decreased"} ${Math.abs(probabilityDelta * 100).toFixed(1)}%.`);
      if (edgeDelta !== null && edgeDelta !== 0) reasons.push(`Edge ${edgeDelta > 0 ? "improved" : "weakened"} ${Math.abs(edgeDelta * 100).toFixed(1)}%.`);
      if (scoreDelta !== null && scoreDelta !== 0) reasons.push(`Engine score moved ${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(1)}.`);
      if (previous.game_id !== row.game_id) reasons.push(`${pickLabel(row)} became leader over ${pickLabel(previous)}.`);
    }
    return {
      timestamp: row.run_at,
      signal: pickLabel(row),
      event: topSignalStoryStatus(row, previous),
      reasons,
    };
  });
}

function volatility(rows: Array<{ trend?: string; probabilityDelta?: number | null; scoreDelta?: number | null }>) {
  const movementCount = rows.filter((row) => row.trend && row.trend !== "SAME").length;
  const deltaCount = rows.filter((row) => Math.abs(row.probabilityDelta ?? 0) > 0 || Math.abs(row.scoreDelta ?? 0) > 0).length;
  const total = movementCount + deltaCount;
  if (total >= 4) return "HIGH";
  if (total >= 2) return "MEDIUM";
  return "LOW";
}

function historyResult(row: DbRow) {
  const result = String(row.result ?? row.outcome ?? "").toUpperCase();
  return ["WON", "LOST", "PUSH"].includes(result) ? result : null;
}

function historyUnits(row: DbRow) {
  const units = num(row.units);
  if (units !== null) return units;
  const result = historyResult(row);
  if (result === "WON") {
    const odds = num(row.odds);
    if (odds === null) return 1;
    return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  }
  if (result === "LOST") return -1;
  if (result === "PUSH") return 0;
  return null;
}

function compactMarket(row: DbRow) {
  const market = marketLabel(row);
  if (market === "ML") return "Moneyline";
  if (market === "SPREADS") return "Spread";
  if (market === "TOTALS") return "Totals";
  return market || "Other";
}

function historyRow(row: DbRow, product: string, sourceTable: string) {
  const result = historyResult(row);
  const units = historyUnits(row);
  return {
    id: row.id,
    product,
    sourceTable,
    sport: row.sport,
    date: row.slate_date ?? row.date ?? row.created_at ?? row.run_at,
    slateDate: row.slate_date ?? row.date ?? null,
    event: eventName(row),
    awayTeam: row.away_team ?? row.awayTeam ?? null,
    homeTeam: row.home_team ?? row.homeTeam ?? null,
    selection: pickLabel(row),
    market: marketLabel(row),
    marketGroup: compactMarket(row),
    line: num(row.line),
    odds: num(row.odds),
    result,
    units,
    roi: units,
    finalScore: row.home_score !== undefined || row.away_score !== undefined
      ? `${row.away_score ?? "-"}-${row.home_score ?? "-"}`
      : row.final_score ?? null,
    status: row.status ?? (row.published ? "Published" : "Pending"),
    published: Boolean(row.published),
    publishedAt: row.publication_time ?? row.run_at ?? row.created_at,
    rank: row.rank ?? null,
    gameId: row.game_id ?? null,
  };
}

function historySummary(rows: ReturnType<typeof historyRow>[]) {
  const graded = rows.filter((row) => row.result);
  const wins = graded.filter((row) => row.result === "WON").length;
  const losses = graded.filter((row) => row.result === "LOST").length;
  const pushes = graded.filter((row) => row.result === "PUSH").length;
  const decisions = wins + losses;
  const units = graded.reduce((sum, row) => sum + (row.units ?? 0), 0);
  const lastResults = graded
    .slice()
    .sort((a, b) => new Date(b.publishedAt ?? b.date ?? 0).getTime() - new Date(a.publishedAt ?? a.date ?? 0).getTime());
  const streakResult = lastResults[0]?.result ?? null;
  let streak = 0;
  for (const row of lastResults) {
    if (row.result !== streakResult || row.result === "PUSH") break;
    streak += 1;
  }
  return {
    record: `${wins}-${losses}${pushes ? `-${pushes}` : ""}`,
    wins,
    losses,
    pushes,
    winRate: decisions ? wins / decisions : null,
    roi: graded.length ? units / graded.length : null,
    units,
    currentStreak: streakResult && streak ? { result: streakResult, count: streak } : null,
    totalSignals: rows.length,
    gradedSignals: graded.length,
  };
}

function marketPerformance(rows: ReturnType<typeof historyRow>[]) {
  const markets = new Map<string, ReturnType<typeof historyRow>[]>();
  for (const row of rows.filter((item) => item.result)) {
    markets.set(row.marketGroup, [...(markets.get(row.marketGroup) ?? []), row]);
  }
  return Array.from(markets.entries()).map(([market, marketRows]) => ({
    market,
    ...historySummary(marketRows),
  })).sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));
}

function historySection(product: string, sourceTable: string, rows: DbRow[]) {
  const normalized = rows.map((row) => historyRow(row, product, sourceTable));
  return {
    source: sourceMetadata({ engine: product, table: sourceTable, rows }),
    rows: normalized,
    summary: historySummary(normalized),
    marketPerformance: marketPerformance(normalized),
  };
}

async function loadTopSignalEligibleCandidates(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  slateDate: string;
  activeSessionId?: string | null;
  publishedGameIds: Set<string>;
}) {
  const { startUtc, endUtc } = resolveMlbSlateWindow();
  const [edges, decisions, projections, odds] = await Promise.all([
    params.supabase
      .from("mlb_market_edge_research_snapshots")
      .select("official_game_id,home_team_name,away_team_name,market,atlas_probability,market_probability,edge,value_percent,direction,classification,market_context,source_versions,snapshot_hash,captured_at,slate_date,freshness_status,freshness_reason")
      .eq("model_version", "mlb_market_edge_research_v1")
      .eq("slate_date", params.slateDate)
      .eq("canonical", true)
      .gte("captured_at", startUtc)
      .lt("captured_at", endUtc)
      .limit(300),
    params.supabase
      .from("mlb_decision_research_snapshots")
      .select("official_game_id,decision,consensus_grade,consensus_score,conviction_grade,conviction_score,decision_confidence_score,no_pick,feature_hash,model_version,captured_at,slate_date,freshness_status,freshness_reason")
      .eq("model_version", "mlb_decision_engine_v1")
      .eq("slate_date", params.slateDate)
      .eq("canonical", true)
      .gte("captured_at", startUtc)
      .lt("captured_at", endUtc)
      .limit(300),
    params.supabase
      .from("mlb_projection_research_snapshots")
      .select("official_game_id,projection_availability,feature_hash,model_version,captured_at,slate_date,freshness_status,freshness_reason")
      .eq("model_version", "mlb_projection_research_v1")
      .eq("slate_date", params.slateDate)
      .eq("canonical", true)
      .gte("captured_at", startUtc)
      .lt("captured_at", endUtc)
      .limit(300),
    params.supabase
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
  if (odds.error) throw odds.error;

  const decisionByGame = new Map(((decisions.data ?? []) as DbRow[]).map((row) => [row.official_game_id, row]));
  const projectionByGame = new Map(((projections.data ?? []) as DbRow[]).map((row) => [row.official_game_id, row]));
  const oddsRows = ((odds.data ?? []) as DbRow[]).filter((row) => timestampBelongsToMlbSlate(row.commence_time, params.slateDate));
  const oddsByTeams = new Map<string, DbRow>();
  for (const row of oddsRows) {
    const key = teamsKey(row.home_team, row.away_team);
    if (!oddsByTeams.has(key)) oddsByTeams.set(key, row);
  }

  return probabilityFirstEdges((edges.data ?? []) as DbRow[])
    .map((edge) => {
      const startTime = topSignalGameStart(edge, oddsByTeams);
      const decision = decisionByGame.get(edge.official_game_id);
      const projection = projectionByGame.get(edge.official_game_id);
      const gate = topSignalGate(edge, decision, projection);
      return { edge, startTime, gate };
    })
    .filter((item) => timestampBelongsToMlbSlate(item.startTime, params.slateDate))
    .filter((item) => item.gate.passed)
    .filter((item) => {
      const oddsValue = edgeOdds(item.edge, oddsRows);
      return oddsValue !== null && oddsValue >= TOP_SIGNAL_MIN_ODDS && oddsValue <= TOP_SIGNAL_MAX_ODDS;
    })
    .filter((item) => !params.publishedGameIds.has(item.edge.official_game_id))
    .filter((item) => isPregameTopSignalCandidate(item.edge, item.startTime))
    .toSorted((a, b) => b.gate.ranking - a.gate.ranking)
    .map((item, index) => ({
      sport: "MLB",
      event: `${item.edge.away_team_name ?? "Away"} @ ${item.edge.home_team_name ?? "Home"}`,
      awayTeam: item.edge.away_team_name ?? null,
      homeTeam: item.edge.home_team_name ?? null,
      gameId: item.edge.official_game_id,
      market: marketLabel({ market: edgeMarket(item.edge) }),
      selection: edgePickLabel(item.edge),
      odds: edgeOdds(item.edge, oddsRows),
      atlasProbability: item.gate.probability,
      edge: item.gate.edgeValue,
      score: item.gate.ranking,
      currentRank: index + 1,
      rank: index + 1,
      status: "ELIGIBLE",
      sessionId: params.activeSessionId ?? null,
      startTime: item.startTime,
      source: {
        engine: "TOP_SIGNAL",
        table: "mlb_market_edge_research_snapshots",
        rowId: item.edge.snapshot_hash ?? item.edge.official_game_id,
      },
    }));
}

export async function GET() {
  const session = await getAdminSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const slateDate = todayET();
  const errors: string[] = [];

  const [
    signalsQuery,
    top5Query,
    topSignalQuery,
    activeSignalsQuery,
    activePicksQuery,
    historySignalsQuery,
    historyTop5Query,
    historyTopSignalQuery,
  ] = await Promise.all([
    supabase.from("signals_detected_history").select("*").eq("slate_date", slateDate).order("rank", { ascending: true }),
    supabase.from("top5_history").select("*").eq("slate_date", slateDate).order("run_at", { ascending: false }).order("rank", { ascending: true }),
    supabase.from("top_signal_history").select("*").eq("slate_date", slateDate).order("run_at", { ascending: false }).limit(48),
    supabase.from("atlas_core_mlb_signals").select("*").eq("date", slateDate).order("start_time", { ascending: true }),
    supabase.from("atlas_core_mlb_picks").select("*").eq("date", slateDate).order("rank", { ascending: true }),
    supabase.from("signals_detected_history").select("*").order("slate_date", { ascending: false }).order("rank", { ascending: true }).limit(2000),
    supabase.from("top5_history").select("*").order("slate_date", { ascending: false }).order("run_at", { ascending: false }).order("rank", { ascending: true }).limit(3000),
    supabase.from("top_signal_history").select("*").order("slate_date", { ascending: false }).order("run_at", { ascending: false }).limit(1000),
  ]);

  for (const [label, result] of Object.entries({
    signals_detected_history: signalsQuery,
    top5_history: top5Query,
    top_signal_history: topSignalQuery,
    atlas_core_mlb_signals: activeSignalsQuery,
    atlas_core_mlb_picks: activePicksQuery,
    history_signals_detected_history: historySignalsQuery,
    history_top5_history: historyTop5Query,
    history_top_signal_history: historyTopSignalQuery,
  })) {
    if (result.error) errors.push(`${label}: ${result.error.message}`);
  }

  const signalsHistory = (signalsQuery.data ?? []) as DbRow[];
  const top5History = (top5Query.data ?? []) as DbRow[];
  const exclusiveHistory = top5History.filter((row) => row.engine === "EXCLUSIVE_TOP3");
  const premiumHistory = top5History.filter((row) => row.engine === "PREMIUM_TOP5");
  const allSignalsHistory = (historySignalsQuery.data ?? []) as DbRow[];
  const allTop5History = (historyTop5Query.data ?? []) as DbRow[];
  const allTopSignalHistory = (historyTopSignalQuery.data ?? []) as DbRow[];
  const allExclusiveHistory = allTop5History.filter((row) => row.engine === "EXCLUSIVE_TOP3" && row.run_type === "OFFICIAL_FREEZE" && row.published);
  const allPremiumHistory = allTop5History.filter((row) => row.engine === "PREMIUM_TOP5" && row.run_type === "OFFICIAL_FREEZE" && row.published);
  const allPublishedTopSignalHistory = allTopSignalHistory.filter((row) => row.engine === "TOP_SIGNAL" && row.published);
  const topSignalTimelineRaw = ((topSignalQuery.data ?? []) as DbRow[]).slice().reverse();
  const activeSignals = (activeSignalsQuery.data ?? []) as DbRow[];
  const activePicks = publicPickRows(activePicksQuery.data ?? []);

  const latestPremiumInternal = latestRun(premiumHistory, "PREMIUM_TOP5", "INTERNAL_RANKING");
  const premiumPrevious = previousRun(premiumHistory, "PREMIUM_TOP5", "INTERNAL_RANKING", latestPremiumInternal[0]?.run_at);
  const latestPremiumFrozen = latestRun(premiumHistory, "PREMIUM_TOP5", "OFFICIAL_FREEZE");
  const latestExclusiveInternal = latestRun(exclusiveHistory, "EXCLUSIVE_TOP3", "INTERNAL_RANKING");
  const exclusivePrevious = previousRun(exclusiveHistory, "EXCLUSIVE_TOP3", "INTERNAL_RANKING", latestExclusiveInternal[0]?.run_at);
  const latestExclusiveFrozen = latestRun(exclusiveHistory, "EXCLUSIVE_TOP3", "OFFICIAL_FREEZE");
  const latestTop5Rows = rankingRows(latestPremiumInternal, premiumPrevious);
  const latestTop3Rows = rankingRows(latestExclusiveInternal, exclusivePrevious);
  const officialTop5Rows = rankingRows(latestPremiumFrozen, []);
  const officialTop3Rows = rankingRows(latestExclusiveFrozen, []);
  const firstStartTime = firstStart([...signalsHistory, ...top5History, ...activeSignals]);
  const topSignalLeader = topSignalTimelineRaw.at(-1) ?? null;
  const officialTopSignalRow = topSignalTimelineRaw.filter((row) => Boolean(row.published)).at(-1) ?? null;
  const topSignalPublishedGameIds = new Set(topSignalTimelineRaw.filter((row) => Boolean(row.published)).map((row) => String(row.game_id)));
  let eligibleTopSignalCandidates: DbRow[] = [];
  try {
    eligibleTopSignalCandidates = await loadTopSignalEligibleCandidates({
      supabase,
      slateDate,
      activeSessionId: topSignalLeader?.session_id ?? null,
      publishedGameIds: topSignalPublishedGameIds,
    });
  } catch (error) {
    errors.push(`top_signal_eligible_candidates: ${error instanceof Error ? error.message : String(error)}`);
  }
  const topSignalSecondPlace =
    eligibleTopSignalCandidates.find((row) => String(row.gameId ?? row.game_id) !== String(topSignalLeader?.game_id ?? "")) ?? null;

  const topSignalTimeline = topSignalTimelineRaw.map((row, index) => {
    const previous = topSignalTimelineRaw[index - 1];
    const status = topSignalStoryStatus(row, previous ?? null);
    const leaderSince = topSignalTimelineRaw.find((item) => item.game_id === row.game_id)?.run_at ?? row.run_at;
    const probabilityDelta = previous ? delta(row.atlas_probability, previous.atlas_probability) : null;
    const edgeDelta = previous ? delta(row.edge, previous.edge) : null;
    const scoreDelta = previous ? delta(scoreOf(row), scoreOf(previous)) : null;
    return {
      timestamp: row.run_at,
      timestampEt: timeET(row.run_at),
      sessionId: row.session_id ?? null,
      sessionLabel: topSignalSessionLabel(row.session_id, index + 1),
      candidate: pickLabel(row),
      sport: row.sport,
      event: eventName(row),
      awayTeam: row.away_team ?? null,
      homeTeam: row.home_team ?? null,
      gameId: row.game_id,
      market: marketLabel(row),
      probability: num(row.atlas_probability),
      edge: num(row.edge),
      score: scoreOf(row),
      probabilityDelta,
      edgeDelta,
      scoreDelta,
      ranking: index + 1,
      leaderSince: row.leader_start ?? leaderSince,
      leaderEnd: row.leader_end ?? null,
      publicationTime: row.publication_time ?? null,
      publicationReason: row.publication_reason ?? null,
      publishWindow: row.publish_window ?? null,
      leaderTime: row.leader_duration ?? durationLabel(minutesBetween(row.leader_start ?? leaderSince, row.run_at)),
      rawStatus: row.status,
      status,
    };
  });
  const topSignalSessions = Array.from(
    topSignalTimeline.reduce((map, row) => {
      const key = row.sessionId ?? `${row.gameId}:${row.candidate}`;
      map.set(key, [...(map.get(key) ?? []), row]);
      return map;
    }, new Map<string, typeof topSignalTimeline>()),
  ).map(([sessionId, rows], index) => {
    const first = rows[0];
    const latest = rows.at(-1) ?? first;
    return {
      sessionId,
      sessionLabel: latest.sessionLabel ?? topSignalSessionLabel(sessionId, index + 1),
      candidate: latest.candidate,
      event: latest.event,
      market: latest.market,
      status: latest.status,
      rawStatus: latest.rawStatus,
      published: latest.status === "Published",
      startedAt: first.timestamp,
      latestAt: latest.timestamp,
      publicationTime: latest.publicationTime,
      publicationReason: latest.publicationReason,
      leaderTime: latest.leaderTime,
      probability: latest.probability,
      edge: latest.edge,
      score: latest.score,
      rows,
    };
  });
  const leaderChangesToday = topSignalTimeline.filter((row) => ["Leader Established", "Leader Replaced"].includes(row.status)).length;
  const longestLeaderStreak = topSignalTimelineRaw.reduce((max, row) => Math.max(max, Number(row.consecutive_leader_hours ?? 1)), 0);
  const topSignalChangeReasons = changeReasons(topSignalTimelineRaw);
  const topSignalCurrentRank = new Map(eligibleTopSignalCandidates.map((row, index) => [String(row.gameId ?? row.game_id), index + 1]));
  const leadersByIdentity = new Map<string, DbRow[]>();
  for (const row of topSignalTimelineRaw) {
    const key = `${row.sport}:${row.game_id}:${marketLabel(row)}:${pickLabel(row)}:${row.line ?? ""}`;
    leadersByIdentity.set(key, [...(leadersByIdentity.get(key) ?? []), row]);
  }
  const leadersToday = Array.from(leadersByIdentity.entries())
    .map(([signalIdentity, rows]) => {
      const first = rows[0];
      const last = rows.at(-1) ?? first;
      const currentCandidate = eligibleTopSignalCandidates.find((row) => String(row.gameId ?? row.game_id) === String(last.game_id)) ?? last;
      const currentRank = topSignalCurrentRank.get(String(last.game_id)) ?? null;
      const previousRank = rows.length > 1 ? topSignalCurrentRank.get(String(rows.at(-2)?.game_id)) ?? null : null;
      const previousDistinctLeader = topSignalTimelineRaw
        .slice()
        .reverse()
        .find((row) => row.game_id !== topSignalLeader?.game_id);
      const trend = last.game_id === topSignalLeader?.game_id
        ? "CURRENT LEADER"
        : previousDistinctLeader?.game_id === last.game_id
          ? "PREVIOUS LEADER"
          : "FORMER LEADER";
      return {
        signalIdentity,
        currentRank,
        previousRank,
        trend,
        firstLedAt: first.run_at,
        lastLedAt: last.run_at,
        totalLeaderCycles: rows.length,
        leaderDuration: `${rows.length} cycle${rows.length === 1 ? "" : "s"}`,
        probability: num(currentCandidate.atlas_probability),
        edge: num(currentCandidate.edge),
        score: scoreOf(currentCandidate),
        event: eventName(currentCandidate),
        awayTeam: currentCandidate.away_team ?? currentCandidate.awayTeam ?? null,
        homeTeam: currentCandidate.home_team ?? currentCandidate.homeTeam ?? null,
        market: marketLabel(currentCandidate),
        selection: pickLabel(currentCandidate),
        odds: num(currentCandidate.odds),
        status: currentCandidate.status,
        gameId: currentCandidate.game_id ?? currentCandidate.gameId,
      };
    })
    .sort((a, b) => (a.currentRank ?? 999) - (b.currentRank ?? 999));

  const signalsWithTop3Rank = signalsHistory.map((row) => {
    const top3 = latestTop3Rows.find((item) => item.gameId === row.game_id) ?? officialTop3Rows.find((item) => item.gameId === row.game_id);
    const active = activeSignals.some((item: DbRow) => item.game_id === row.game_id && item.stage === "SIGNALS_DETECTED");
    const superseded = activeSignals.some((item: DbRow) => item.game_id === row.game_id && item.stage === "SUPERSEDED");
    return {
      sport: row.sport,
      event: eventName(row),
      awayTeam: row.away_team ?? null,
      homeTeam: row.home_team ?? null,
      market: marketLabel(row),
      selection: pickLabel(row),
      odds: num(row.odds),
      atlasProbability: num(row.atlas_probability),
      edge: num(row.edge),
      detectionScore: num(row.score),
      frozenAt: row.run_at,
      active,
      superseded,
      exclusiveTop3Rank: top3?.rank ?? null,
      exclusivePreviousRank: top3?.previousRank ?? null,
      exclusiveTrend: top3?.trend ?? "OUT",
      exclusivePositionChange: top3?.positionChange ?? null,
      exclusiveProbabilityDelta: top3?.probabilityDelta ?? null,
      exclusiveScoreDelta: top3?.scoreDelta ?? null,
      exclusiveStatus: top3?.status ?? "NOT_TOP3",
      status: row.status,
      gameId: row.game_id,
    };
  });

  const activity = [
    ...signalsHistory.map((row) => ({
      timestamp: row.run_at,
      engine: "Signals Detected",
      event: "Signals Detected frozen",
      affectedSignal: pickLabel(row),
      description: `${eventName(row)} frozen for free preview.`,
      severity: "SUCCESS",
    })),
    ...latestTop3Rows.map((row) => ({
      timestamp: row.runAt,
      engine: "Exclusive Top 3",
      event: "Exclusive Top 3 recalculated",
      affectedSignal: `#${row.rank} ${row.selection}`,
      description: `${row.event} is ${row.trend.toLowerCase()} in Exclusive ranking.`,
      severity: "INFO",
    })),
    ...latestTop5Rows.map((row) => ({
      timestamp: row.runAt,
      engine: "Premium Top 5",
      event: "Premium Top 5 recalculated",
      affectedSignal: `#${row.rank} ${row.selection}`,
      description: `${row.event} is ${row.trend.toLowerCase()} in Premium ranking.`,
      severity: "INFO",
    })),
    ...topSignalTimeline.map((row) => ({
      timestamp: row.timestamp,
      engine: "Top Signal",
      event: row.status === "Published" ? "Top Signal published" : row.status,
      affectedSignal: row.candidate,
      description: `${row.event} · ${row.market}`,
      severity: row.status === "Published" ? "SUCCESS" : "INFO",
    })),
    ...activePicks.map((row) => ({
      timestamp: row.final_validated_at ?? row.updated_at ?? row.published_at,
      engine: row.engine_product === "EXCLUSIVE_TOP3" ? "Exclusive Top 3" : "Premium Top 5",
      event: `Signal ${String(row.status ?? "updated").toLowerCase()}`,
      affectedSignal: pickLabel(row),
      description: `${eventName(row)} · ${marketLabel(row)}`,
      severity: activitySeverity(String(row.status ?? "")),
    })),
  ]
    .filter((row) => row.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 40);

  const top5Movement = rankingMovement(latestTop5Rows, premiumPrevious);
  const exclusiveMovement = rankingMovement(latestTop3Rows, exclusivePrevious);
  const topSignalLeaderCandidate = topSignalLeader ? candidateFromRow(topSignalLeader) : null;
  const topSignalSecondCandidate = candidateFromRow(topSignalSecondPlace);
  const leaderScore = topSignalLeader ? scoreOf(topSignalLeader) : null;
  const secondScore = topSignalSecondPlace ? scoreOf(topSignalSecondPlace) : null;
  const edgeMovedWithStableScore = topSignalTimeline.some((row) => Math.abs(row.edgeDelta ?? 0) > 0 && Math.abs(row.scoreDelta ?? 0) === 0);
  const topSignalLeaderSince = topSignalLeader
    ? topSignalTimelineRaw.find((row) => row.game_id === topSignalLeader.game_id)?.run_at ?? topSignalLeader.run_at
    : null;
  const topSignalLeaderTime = durationLabel(minutesBetween(topSignalLeaderSince, new Date().toISOString()));
  const topSignalStrength = {
    leaderScore,
    secondPlaceScore: secondScore,
    scoreGap: leaderScore !== null && secondScore !== null ? leaderScore - secondScore : null,
    probabilityGap: delta(topSignalLeader?.atlas_probability, topSignalSecondPlace?.atlas_probability ?? topSignalSecondPlace?.atlasProbability),
    edgeGap: delta(topSignalLeader?.edge, topSignalSecondPlace?.edge),
    leaderSince: topSignalLeaderSince,
    leaderDuration: topSignalLeaderTime,
    leaderChangesToday,
    longestLeaderStreak,
    currentLeaderStreak: Number(topSignalLeader?.consecutive_leader_hours ?? 0),
    stability: stability(topSignalLeader, topSignalTimelineRaw, topSignalSecondPlace),
    scoreConsistencyNote: edgeMovedWithStableScore
      ? "Edge moved while score stayed unchanged. Current score model can remain stable when weighted inputs offset each other."
      : null,
  };

  const topSignal = topSignalLeader
    ? {
        currentLeader: pickLabel(topSignalLeader),
        sport: topSignalLeader.sport,
        event: eventName(topSignalLeader),
        awayTeam: topSignalLeader.away_team ?? null,
        homeTeam: topSignalLeader.home_team ?? null,
        market: marketLabel(topSignalLeader),
        selection: pickLabel(topSignalLeader),
        odds: num(topSignalLeader.odds),
        atlasProbability: num(topSignalLeader.atlas_probability),
        marketProbability: null,
        edge: num(topSignalLeader.edge),
        engineScore: scoreOf(topSignalLeader),
        leaderSince: topSignalLeaderSince,
        leaderTime: topSignalLeaderTime,
        consecutiveHoursAsLeader: Number(topSignalLeader.consecutive_leader_hours ?? 1),
        stability: stability(topSignalLeader, topSignalTimelineRaw, topSignalSecondPlace),
        nextFinalReview: finalReview(topSignalLeader.start_time),
        estimatedPublicationWindow: publicationWindow(topSignalLeader.start_time),
        candidateStatus: topSignalLeader.status ?? "CANDIDATE",
        secondPlaceCandidate: topSignalSecondCandidate,
        secondPlace: topSignalSecondCandidate,
        strength: topSignalStrength,
        timeline: topSignalTimeline,
        sessions: topSignalSessions,
        changeReasons: topSignalChangeReasons,
        leadersToday,
        engineDetails: {
          strength: topSignalStrength,
          secondPlace: topSignalSecondCandidate,
          timeline: topSignalTimeline,
          sessions: topSignalSessions,
          changeReasons: topSignalChangeReasons,
        },
        leader: topSignalLeaderCandidate,
        leaderSeparation: topSignalStrength.scoreGap,
        lastRun: topSignalLeader.run_at,
      }
    : null;

  const officialTopSignal = officialTopSignalRow
    ? {
        currentLeader: pickLabel(officialTopSignalRow),
        sport: officialTopSignalRow.sport,
        event: eventName(officialTopSignalRow),
        awayTeam: officialTopSignalRow.away_team ?? null,
        homeTeam: officialTopSignalRow.home_team ?? null,
        market: marketLabel(officialTopSignalRow),
        selection: pickLabel(officialTopSignalRow),
        odds: num(officialTopSignalRow.odds),
        atlasProbability: num(officialTopSignalRow.atlas_probability),
        edge: num(officialTopSignalRow.edge),
        engineScore: scoreOf(officialTopSignalRow),
        candidateStatus: officialTopSignalRow.status ?? "PUBLISHED",
        published: Boolean(officialTopSignalRow.published),
        publishedAt: officialTopSignalRow.run_at,
        lastRun: officialTopSignalRow.run_at,
      }
    : null;

  const currentPremiumLastRun = latestPremiumInternal[0]?.run_at ?? null;
  const currentExclusiveLastRun = latestExclusiveInternal[0]?.run_at ?? null;
  const signalsLastRun = signalsHistory.map((row) => row.run_at).filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const validationLastRun = activePicks.map((row) => row.final_validated_at ?? row.updated_at).filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const staleSourceCount = [...activeSignals, ...activePicks].filter((row) => String(row.status ?? row.stage ?? "").toUpperCase() === "STALE_SOURCE").length;
  const blockedPublications = [...activeSignals, ...activePicks].filter((row) => row.publication_blocked).length;

  const healthRows = [
    { engine: "Signals Detected Engine", lastRun: signalsLastRun, nextRun: "Tomorrow 7:00 AM ET", rowsProcessed: signalsHistory.length, errors, lastDuration: null },
    { engine: "Top 3 Exclusive Engine", lastRun: currentExclusiveLastRun, nextRun: dateTimeET(addMinutes(currentExclusiveLastRun, ENGINE_RECALC_MINUTES)), rowsProcessed: latestTop3Rows.length || officialTop3Rows.length, errors: [], lastDuration: null },
    { engine: "Top 5 Premium Engine", lastRun: currentPremiumLastRun, nextRun: dateTimeET(addMinutes(currentPremiumLastRun, ENGINE_RECALC_MINUTES)), rowsProcessed: latestTop5Rows.length || officialTop5Rows.length, errors: [], lastDuration: null },
    { engine: "Top Signal Engine", lastRun: topSignalLeader?.run_at ?? null, nextRun: dateTimeET(addMinutes(topSignalLeader?.run_at, ENGINE_RECALC_MINUTES)), rowsProcessed: topSignalLeader ? 1 : 0, errors: [], lastDuration: null },
    { engine: "Validation Engine", lastRun: validationLastRun, nextRun: "30 min before event", rowsProcessed: activePicks.filter((row) => row.final_validated_at).length, errors: [], lastDuration: null },
    { engine: "Daily Pipeline", lastRun: [signalsLastRun, currentPremiumLastRun, currentExclusiveLastRun, topSignalLeader?.run_at].filter(Boolean).sort().at(-1) ?? null, nextRun: "Hourly", rowsProcessed: signalsHistory.length + latestTop5Rows.length + latestTop3Rows.length + (topSignalLeader ? 1 : 0), errors, lastDuration: null },
    { engine: "Postgame Grading", lastRun: null, nextRun: "Postgame", rowsProcessed: 0, errors: [], lastDuration: null },
  ].map((row) => ({
    ...row,
    status: engineStatus(row.lastRun, row.errors, row.rowsProcessed),
    lastRunEt: dateTimeET(row.lastRun),
    latency: row.lastRun ? `${Math.max(0, Math.round((Date.now() - new Date(row.lastRun).getTime()) / 60000))}m` : "N/A",
    nextIn: row.lastRun && row.nextRun && row.nextRun !== "Hourly" ? row.nextRun : null,
    lastDuration: row.lastDuration,
    errors: row.errors.length,
    staleSourceCount,
    blockedPublications,
  }));

  const operationsTimeline = [
    { stage: "Signals Detected Frozen", scheduledTime: "07:00 AM", lastExecution: signalsLastRun, nextExecution: "Tomorrow 7:00 AM ET", rowsProcessed: signalsHistory.length, result: signalsHistory.length ? "Frozen" : "No rows" },
    { stage: "Exclusive Top 3 Recalculation", scheduledTime: "Hourly", lastExecution: currentExclusiveLastRun, nextExecution: dateTimeET(addMinutes(currentExclusiveLastRun, ENGINE_RECALC_MINUTES)), rowsProcessed: latestTop3Rows.length, result: latestTop3Rows.length ? "Internal ranking" : "No ranking" },
    { stage: "Premium Top 5 Recalculation", scheduledTime: "Hourly", lastExecution: currentPremiumLastRun, nextExecution: dateTimeET(addMinutes(currentPremiumLastRun, ENGINE_RECALC_MINUTES)), rowsProcessed: latestTop5Rows.length, result: latestTop5Rows.length ? "Internal ranking" : "No ranking" },
    { stage: "Top Signal Recalculation", scheduledTime: "Hourly", lastExecution: topSignalLeader?.run_at ?? null, nextExecution: dateTimeET(addMinutes(topSignalLeader?.run_at, ENGINE_RECALC_MINUTES)), rowsProcessed: topSignalLeader ? 1 : 0, result: topSignalLeader?.status ?? "No candidate" },
    { stage: "Exclusive Top 3 Freeze", scheduledTime: "1 hour before first game", lastExecution: latestExclusiveFrozen[0]?.run_at ?? null, nextExecution: firstStartTime ? dateTimeET(finalReview(firstStartTime)) : null, rowsProcessed: officialTop3Rows.length, result: officialTop3Rows.length ? "Frozen" : "Pending" },
    { stage: "Premium Top 5 Freeze", scheduledTime: "1 hour before first game", lastExecution: latestPremiumFrozen[0]?.run_at ?? null, nextExecution: firstStartTime ? dateTimeET(finalReview(firstStartTime)) : null, rowsProcessed: officialTop5Rows.length, result: officialTop5Rows.length ? "Frozen" : "Pending" },
    { stage: "Top Signal Final Review", scheduledTime: "Dynamic", lastExecution: topSignalLeader?.published ? topSignalLeader.run_at : null, nextExecution: dateTimeET(finalReview(topSignalLeader?.start_time)), rowsProcessed: topSignalLeader?.published ? 1 : 0, result: topSignalLeader?.published ? "Published" : "Pending" },
    { stage: "Status Validation", scheduledTime: "30 minutes before each event", lastExecution: validationLastRun, nextExecution: "Per event", rowsProcessed: activePicks.filter((row) => row.final_validated_at).length, result: "Live checks" },
    { stage: "Grading and Performance", scheduledTime: "Postgame", lastExecution: null, nextExecution: "After finals", rowsProcessed: 0, result: "Pending" },
  ].map((row) => ({
    ...row,
    lastExecutionEt: dateTimeET(row.lastExecution),
    health: engineStatus(row.lastExecution, [], row.rowsProcessed),
    duration: null,
    errorCount: 0,
  }));

  const statuses = activePicks.reduce((counts: Record<string, number>, row) => {
    const key = String(row.status ?? "UNKNOWN").toUpperCase();
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  const sportsAvailable = Array.from(new Set([...signalsHistory, ...top5History, ...topSignalTimelineRaw, ...activePicks].map((row) => row.sport).filter(Boolean)));
  const summary = {
    slateDate,
    generatedAt: new Date().toISOString(),
    sportsAvailable,
    gamesInspected: new Set([...signalsHistory, ...top5History, ...activeSignals].map((row) => row.game_id).filter(Boolean)).size,
    signalsDetected: signalsHistory.length,
    exclusiveTop3Candidates: latestTop3Rows.length || officialTop3Rows.length,
    premiumTop5Candidates: latestTop5Rows.length || officialTop5Rows.length,
    topSignalCurrentLeader: topSignal?.currentLeader ?? "NO_QUALIFIED_SIGNAL",
    topSignalPublished: Boolean(officialTopSignal),
    publishedSignals: activePicks.filter((row) => row.published_at).length,
    confirmed: statuses.CONFIRMED ?? 0,
    downgraded: statuses.DOWNGRADED ?? 0,
    withdrawn: (statuses.WITHDRAWN ?? 0) + (statuses.REMOVED ?? 0),
    blocked: blockedPublications,
    staleSources: staleSourceCount,
  };
  const improvingRows = [...latestTop5Rows, ...latestTop3Rows].filter((row) => (row.probabilityDelta ?? 0) > 0 || (row.scoreDelta ?? 0) > 0);
  const weakeningRows = [...latestTop5Rows, ...latestTop3Rows].filter((row) => (row.probabilityDelta ?? 0) < 0 || (row.scoreDelta ?? 0) < 0);
  const marketPulse = {
    topSignalStability: topSignalStrength.stability,
    top5Volatility: volatility(latestTop5Rows),
    exclusiveTop3Volatility: volatility(latestTop3Rows),
    marketMovement: [...latestTop5Rows, ...latestTop3Rows].filter((row) => Math.abs(row.edgeDelta ?? 0) > 0).length,
    signalsImproving: improvingRows.length,
    signalsWeakening: weakeningRows.length,
    leaderChanges: leaderChangesToday,
    qualifiedCandidates: latestPremiumInternal.length,
  };
  const signalsReachedPremium = new Set(allPremiumHistory.map((row) => String(row.game_id)));
  const signalsReachedTopSignal = new Set(allPublishedTopSignalHistory.map((row) => String(row.game_id)));
  const signalsAnalyticsRows = allSignalsHistory.map((row) => ({
    ...historyRow(row, "SIGNALS_DETECTED", "signals_detected_history"),
    reachedPremium: signalsReachedPremium.has(String(row.game_id)),
    reachedTopSignal: signalsReachedTopSignal.has(String(row.game_id)),
  }));
  const signalsDetectedCount = signalsAnalyticsRows.length;
  const signalsValidatedCount = signalsAnalyticsRows.filter((row) => row.reachedPremium || row.reachedTopSignal).length;
  const historyCenter = {
    topSignal: historySection("TOP_SIGNAL", "top_signal_history", allPublishedTopSignalHistory),
    premiumTop5: historySection("PREMIUM_TOP5", "top5_history", allPremiumHistory),
    exclusiveTop3: historySection("EXCLUSIVE_TOP3", "top5_history", allExclusiveHistory),
    signalsAnalytics: {
      source: sourceMetadata({ engine: "SIGNALS_DETECTED", table: "signals_detected_history", rows: allSignalsHistory }),
      rows: signalsAnalyticsRows,
      summary: {
        detected: signalsDetectedCount,
        validated: signalsValidatedCount,
        rejected: Math.max(0, signalsDetectedCount - signalsValidatedCount),
        hitRate: signalsDetectedCount ? signalsValidatedCount / signalsDetectedCount : null,
        conversionRate: signalsDetectedCount ? signalsReachedPremium.size / signalsDetectedCount : null,
        reachedPremium: signalsReachedPremium.size,
        reachedTopSignal: signalsReachedTopSignal.size,
      },
    },
  };
  const signalsDetectedSource = sourceMetadata({ engine: "SIGNALS_DETECTED", table: "signals_detected_history", rows: signalsHistory });
  const exclusiveSource = sourceMetadata({ engine: "EXCLUSIVE_TOP3", table: "top5_history", rows: exclusiveHistory });
  const premiumSource = sourceMetadata({ engine: "PREMIUM_TOP5", table: "top5_history", rows: premiumHistory });
  const topSignalSource = sourceMetadata({ engine: "TOP_SIGNAL", table: "top_signal_history", rows: topSignalTimelineRaw });
  const signalsDetectedProduct = {
    engineRows: signalsWithTop3Rank,
    frozenRows: signalsWithTop3Rank,
    source: signalsDetectedSource,
    summary: {
      lastRun: signalsLastRun,
      rowCount: signalsWithTop3Rank.length,
      frozen: signalsWithTop3Rank.length > 0,
    },
  };
  const premiumTop5Product = {
    engineRows: latestTop5Rows,
    currentInternalRanking: latestTop5Rows,
    currentRanking: latestTop5Rows,
    officialRows: officialTop5Rows,
    officialFrozenTop5: officialTop5Rows,
    frozenRanking: officialTop5Rows,
    movementHistory: top5Movement,
    source: premiumSource,
    summary: {
      lastRecalculation: currentPremiumLastRun,
      nextRecalculation: addMinutes(currentPremiumLastRun, ENGINE_RECALC_MINUTES),
      publicationCutoff: finalReview(firstStartTime),
      frozen: officialTop5Rows.length > 0,
      published: officialTop5Rows.some((row) => row.published),
      volatility: marketPulse.top5Volatility,
      rowCount: latestTop5Rows.length || officialTop5Rows.length,
    },
    lastRecalculation: currentPremiumLastRun,
    nextRecalculation: addMinutes(currentPremiumLastRun, ENGINE_RECALC_MINUTES),
    publicationCutoff: finalReview(firstStartTime),
    frozen: officialTop5Rows.length > 0,
    published: officialTop5Rows.some((row) => row.published),
  };
  const exclusiveTop3Product = {
    engineRows: latestTop3Rows,
    currentInternalRanking: latestTop3Rows,
    currentRanking: latestTop3Rows,
    officialRows: officialTop3Rows,
    officialFrozenTop3: officialTop3Rows,
    frozenRanking: officialTop3Rows,
    movementHistory: exclusiveMovement,
    source: exclusiveSource,
    summary: {
      lastRecalculation: currentExclusiveLastRun,
      nextRecalculation: addMinutes(currentExclusiveLastRun, ENGINE_RECALC_MINUTES),
      publicationCutoff: finalReview(firstStartTime),
      frozen: officialTop3Rows.length > 0,
      published: officialTop3Rows.some((row) => row.published),
      sourcePool: "SIGNALS_DETECTED",
      rowCount: latestTop3Rows.length || officialTop3Rows.length,
    },
    lastRecalculation: currentExclusiveLastRun,
    nextRecalculation: addMinutes(currentExclusiveLastRun, ENGINE_RECALC_MINUTES),
    publicationCutoff: finalReview(firstStartTime),
    frozen: officialTop3Rows.length > 0,
    published: officialTop3Rows.some((row) => row.published),
  };
  const topSignalProduct = topSignal
    ? {
        ...topSignal,
        engineRows: topSignalTimeline,
        eligibleCandidates: eligibleTopSignalCandidates,
        currentLeader: topSignal.currentLeader,
        leadersToday,
        sessions: topSignalSessions,
        officialRows: officialTopSignal ? [officialTopSignal] : [],
        source: topSignalSource,
        summary: {
          lastRun: topSignalLeader?.run_at ?? null,
          rowCount: topSignalTimelineRaw.length,
          eligibleCandidates: eligibleTopSignalCandidates.length,
          currentLeader: topSignal.currentLeader,
          published: Boolean(officialTopSignal),
        },
      }
    : null;

  return NextResponse.json({
    summary,
    engineHealth: healthRows,
    topSignal: topSignalProduct,
    officialProducts: {
      topSignal: officialTopSignal,
      premiumTop5: officialTop5Rows,
      exclusiveTop3: officialTop3Rows,
      signalsDetected: signalsWithTop3Rank,
      productStatus: {
        publication: {
          signalsPublished: signalsHistory.length > 0,
          topSignalPublished: Boolean(officialTopSignal),
          top5Published: officialTop5Rows.some((row) => row.published),
          exclusivePublished: officialTop3Rows.some((row) => row.published),
        },
        validation: {
          completed: activePicks.filter((row) => ["CONFIRMED", "DOWNGRADED", "REMOVED", "WITHDRAWN"].includes(String(row.status ?? "").toUpperCase())).length,
          pending: activePicks.filter((row) => !["CONFIRMED", "DOWNGRADED", "REMOVED", "WITHDRAWN"].includes(String(row.status ?? "").toUpperCase())).length,
          confirmed: statuses.CONFIRMED ?? 0,
          downgraded: statuses.DOWNGRADED ?? 0,
          withdrawn: (statuses.WITHDRAWN ?? 0) + (statuses.REMOVED ?? 0),
        },
      },
    },
    topSignalTimeline,
    premiumTop5: premiumTop5Product,
    top5: premiumTop5Product,
    top5Movement,
    signalsDetected: signalsDetectedProduct,
    signalsDetectedDetail: {
      frozenSignals: signalsWithTop3Rank,
      exclusiveRanking: latestTop3Rows,
      movement: exclusiveMovement,
    },
    exclusiveTop3: exclusiveTop3Product,
    productSources: {
      signalsDetected: signalsDetectedSource,
      exclusiveTop3: exclusiveSource,
      premiumTop5: premiumSource,
      topSignal: topSignalSource,
    },
    historyCenter,
    liveActivity: activity,
    activity,
    operationsTimeline,
    marketPulse,
    dataSources: ["signals_detected_history", "top5_history", "top_signal_history", "atlas_core_mlb_signals", "atlas_core_mlb_picks"],
    errors,
  });
}
