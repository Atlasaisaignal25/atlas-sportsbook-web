import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DbRow = Record<string, any>;

const ET_TIMEZONE = "America/New_York";
const ENGINE_RECALC_MINUTES = 60;

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
  return `${row.away_team ?? "Away"} @ ${row.home_team ?? "Home"}`;
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
  return num(row?.score) ?? num(row?.pick_ranking) ?? 0;
}

function candidateFromRow(row: DbRow | null | undefined) {
  if (!row) return null;
  return {
    sport: row.sport,
    event: eventName(row),
    market: marketLabel(row),
    selection: pickLabel(row),
    odds: num(row.odds),
    atlasProbability: num(row.atlas_probability),
    edge: num(row.edge),
    score: scoreOf(row),
    status: row.status,
    gameId: row.game_id,
    runAt: row.run_at,
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
      gameId: row.game_id,
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
      event: previous && previous.game_id === row.game_id ? "HELD" : "NEW LEADER",
      reasons: reasons.length ? reasons : ["Reason not available from current snapshots."],
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
  ] = await Promise.all([
    supabase.from("signals_detected_history").select("*").eq("slate_date", slateDate).order("rank", { ascending: true }),
    supabase.from("top5_history").select("*").eq("slate_date", slateDate).order("run_at", { ascending: false }).order("rank", { ascending: true }),
    supabase.from("top_signal_history").select("*").eq("slate_date", slateDate).order("run_at", { ascending: false }).limit(48),
    supabase.from("atlas_core_mlb_signals").select("*").eq("date", slateDate).order("start_time", { ascending: true }),
    supabase.from("atlas_core_mlb_picks").select("*").eq("date", slateDate).order("rank", { ascending: true }),
  ]);

  for (const [label, result] of Object.entries({
    signals_detected_history: signalsQuery,
    top5_history: top5Query,
    top_signal_history: topSignalQuery,
    atlas_core_mlb_signals: activeSignalsQuery,
    atlas_core_mlb_picks: activePicksQuery,
  })) {
    if (result.error) errors.push(`${label}: ${result.error.message}`);
  }

  const signalsHistory = (signalsQuery.data ?? []) as DbRow[];
  const top5History = (top5Query.data ?? []) as DbRow[];
  const topSignalTimelineRaw = ((topSignalQuery.data ?? []) as DbRow[]).slice().reverse();
  const activeSignals = (activeSignalsQuery.data ?? []) as DbRow[];
  const activePicks = publicPickRows(activePicksQuery.data ?? []);

  const latestPremiumInternal = latestRun(top5History, "PREMIUM_TOP5", "INTERNAL_RANKING");
  const premiumPrevious = previousRun(top5History, "PREMIUM_TOP5", "INTERNAL_RANKING", latestPremiumInternal[0]?.run_at);
  const latestPremiumFrozen = latestRun(top5History, "PREMIUM_TOP5", "OFFICIAL_FREEZE");
  const latestExclusiveInternal = latestRun(top5History, "EXCLUSIVE_TOP3", "INTERNAL_RANKING");
  const exclusivePrevious = previousRun(top5History, "EXCLUSIVE_TOP3", "INTERNAL_RANKING", latestExclusiveInternal[0]?.run_at);
  const latestExclusiveFrozen = latestRun(top5History, "EXCLUSIVE_TOP3", "OFFICIAL_FREEZE");
  const latestTop5Rows = rankingRows(latestPremiumInternal, premiumPrevious);
  const latestTop3Rows = rankingRows(latestExclusiveInternal, exclusivePrevious);
  const officialTop5Rows = rankingRows(latestPremiumFrozen, []);
  const officialTop3Rows = rankingRows(latestExclusiveFrozen, []);
  const firstStartTime = firstStart([...signalsHistory, ...top5History, ...activeSignals]);
  const topSignalLeader = topSignalTimelineRaw.at(-1) ?? null;
  const eligibleTopSignalCandidates = latestPremiumInternal
    .filter((row) => {
      const odds = num(row.odds);
      return odds !== null && odds >= -160 && odds <= 120;
    })
    .toSorted((a, b) => scoreOf(b) - scoreOf(a));
  const topSignalSecondPlace =
    eligibleTopSignalCandidates.find((row) => row.game_id !== topSignalLeader?.game_id) ?? null;

  const topSignalTimeline = topSignalTimelineRaw.map((row, index) => {
    const previous = topSignalTimelineRaw[index - 1];
    const status = row.published
      ? "PUBLISHED"
      : previous && previous.game_id === row.game_id
        ? "HELD"
        : "NEW LEADER";
    return {
      timestamp: row.run_at,
      timestampEt: timeET(row.run_at),
      candidate: pickLabel(row),
      sport: row.sport,
      event: eventName(row),
      market: marketLabel(row),
      probability: num(row.atlas_probability),
      edge: num(row.edge),
      score: scoreOf(row),
      status,
    };
  });
  const leaderChangesToday = topSignalTimeline.filter((row) => row.status === "NEW LEADER").length;
  const longestLeaderStreak = topSignalTimelineRaw.reduce((max, row) => Math.max(max, Number(row.consecutive_leader_hours ?? 1)), 0);
  const topSignalChangeReasons = changeReasons(topSignalTimelineRaw);

  const signalsWithTop3Rank = signalsHistory.map((row) => {
    const top3 = latestTop3Rows.find((item) => item.gameId === row.game_id) ?? officialTop3Rows.find((item) => item.gameId === row.game_id);
    const active = activeSignals.some((item: DbRow) => item.game_id === row.game_id && item.stage === "SIGNALS_DETECTED");
    const superseded = activeSignals.some((item: DbRow) => item.game_id === row.game_id && item.stage === "SUPERSEDED");
    return {
      sport: row.sport,
      event: eventName(row),
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
      event: row.status === "PUBLISHED" ? "Top Signal published" : row.status === "HELD" ? "Top Signal candidate held" : "Top Signal leader changed",
      affectedSignal: row.candidate,
      description: `${row.event} · ${row.market}`,
      severity: row.status === "PUBLISHED" ? "SUCCESS" : "INFO",
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
  const topSignalStrength = {
    leaderScore,
    secondPlaceScore: secondScore,
    scoreGap: leaderScore !== null && secondScore !== null ? leaderScore - secondScore : null,
    probabilityGap: delta(topSignalLeader?.atlas_probability, topSignalSecondPlace?.atlas_probability),
    edgeGap: delta(topSignalLeader?.edge, topSignalSecondPlace?.edge),
    leaderDuration: topSignalLeader ? `${Number(topSignalLeader.consecutive_leader_hours ?? 1)}h` : "N/A",
    leaderChangesToday,
    longestLeaderStreak,
    currentLeaderStreak: Number(topSignalLeader?.consecutive_leader_hours ?? 0),
    stability: stability(topSignalLeader, topSignalTimelineRaw, topSignalSecondPlace),
  };

  const topSignal = topSignalLeader
    ? {
        currentLeader: pickLabel(topSignalLeader),
        sport: topSignalLeader.sport,
        event: eventName(topSignalLeader),
        market: marketLabel(topSignalLeader),
        selection: pickLabel(topSignalLeader),
        odds: num(topSignalLeader.odds),
        atlasProbability: num(topSignalLeader.atlas_probability),
        marketProbability: null,
        edge: num(topSignalLeader.edge),
        engineScore: scoreOf(topSignalLeader),
        leaderSince: topSignalTimelineRaw.find((row) => row.game_id === topSignalLeader.game_id)?.run_at ?? topSignalLeader.run_at,
        consecutiveHoursAsLeader: Number(topSignalLeader.consecutive_leader_hours ?? 1),
        stability: stability(topSignalLeader, topSignalTimelineRaw, topSignalSecondPlace),
        nextFinalReview: finalReview(topSignalLeader.start_time),
        estimatedPublicationWindow: publicationWindow(topSignalLeader.start_time),
        candidateStatus: topSignalLeader.status ?? "CANDIDATE",
        secondPlaceCandidate: topSignalSecondCandidate,
        secondPlace: topSignalSecondCandidate,
        strength: topSignalStrength,
        timeline: topSignalTimeline,
        changeReasons: topSignalChangeReasons,
        leader: topSignalLeaderCandidate,
        leaderSeparation: topSignalStrength.scoreGap,
        lastRun: topSignalLeader.run_at,
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

  return NextResponse.json({
    summary,
    engineHealth: healthRows,
    topSignal,
    topSignalTimeline,
    top5: {
      currentInternalRanking: latestTop5Rows,
      currentRanking: latestTop5Rows,
      officialFrozenTop5: officialTop5Rows,
      frozenRanking: officialTop5Rows,
      movementHistory: top5Movement,
      summary: {
        lastRecalculation: currentPremiumLastRun,
        nextRecalculation: addMinutes(currentPremiumLastRun, ENGINE_RECALC_MINUTES),
        publicationCutoff: finalReview(firstStartTime),
        frozen: officialTop5Rows.length > 0,
        published: officialTop5Rows.some((row) => row.published),
        volatility: marketPulse.top5Volatility,
      },
      lastRecalculation: currentPremiumLastRun,
      nextRecalculation: addMinutes(currentPremiumLastRun, ENGINE_RECALC_MINUTES),
      publicationCutoff: finalReview(firstStartTime),
      frozen: officialTop5Rows.length > 0,
      published: officialTop5Rows.some((row) => row.published),
    },
    top5Movement,
    signalsDetected: signalsWithTop3Rank,
    signalsDetectedDetail: {
      frozenSignals: signalsWithTop3Rank,
      exclusiveRanking: latestTop3Rows,
      movement: exclusiveMovement,
    },
    exclusiveTop3: {
      currentInternalRanking: latestTop3Rows,
      currentRanking: latestTop3Rows,
      officialFrozenTop3: officialTop3Rows,
      frozenRanking: officialTop3Rows,
      movementHistory: exclusiveMovement,
      lastRecalculation: currentExclusiveLastRun,
      nextRecalculation: addMinutes(currentExclusiveLastRun, ENGINE_RECALC_MINUTES),
      publicationCutoff: finalReview(firstStartTime),
      frozen: officialTop3Rows.length > 0,
      published: officialTop3Rows.some((row) => row.published),
    },
    liveActivity: activity,
    activity,
    operationsTimeline,
    marketPulse,
    dataSources: ["signals_detected_history", "top5_history", "top_signal_history", "atlas_core_mlb_signals", "atlas_core_mlb_picks"],
    errors,
  });
}
