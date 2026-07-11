import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SportKey = "MLB" | "NBA" | "NHL" | "SOCCER";

type SportAdminConfig = {
  sport: SportKey;
  publicTable: string;
  liveTable: string;
  top5HistoryTable: string;
  topSignalHistoryTable: string;
};

const sports: SportAdminConfig[] = [
  {
    sport: "MLB",
    publicTable: "mlb_public_signals",
    liveTable: "mlb_top5_live",
    top5HistoryTable: "mlb_top5_history",
    topSignalHistoryTable: "mlb_top_signal_history",
  },
  {
    sport: "NBA",
    publicTable: "nba_public_signals",
    liveTable: "nba_top5_live",
    top5HistoryTable: "nba_top5_history",
    topSignalHistoryTable: "nba_top_signal_history",
  },
  {
    sport: "NHL",
    publicTable: "nhl_public_signals",
    liveTable: "nhl_top5_live",
    top5HistoryTable: "nhl_top5_history",
    topSignalHistoryTable: "nhl_top_signal_history",
  },
  {
    sport: "SOCCER",
    publicTable: "soccer_public_signals",
    liveTable: "soccer_top5_live",
    top5HistoryTable: "soccer_top5_history",
    topSignalHistoryTable: "soccer_top_signal_history",
  },
];

const cronJobs = [
  { path: "/api/cron/generate-daily-top5", schedule: "0 * * * *" },
  { path: "/api/cron/validate-top5-pregame", schedule: "*/10 * * * *" },
  { path: "/api/cron/grade-mlb-top-signals", schedule: "0 * * * *" },
  { path: "/api/cron/grade-mlb-top5", schedule: "2 * * * *" },
  { path: "/api/cron/grade-nba-top-signals", schedule: "5 * * * *" },
  { path: "/api/cron/grade-nba-top5", schedule: "7 * * * *" },
  { path: "/api/cron/grade-nhl-top-signals", schedule: "10 * * * *" },
  { path: "/api/cron/grade-nhl-top5", schedule: "12 * * * *" },
  { path: "/api/cron/grade-soccer-top-signals", schedule: "15 * * * *" },
  { path: "/api/cron/grade-soccer-top5", schedule: "17 * * * *" },
  { path: "/api/cron/grade-challenges", schedule: "20 * * * *" },
];

function todayET() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function daysAgoET(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);

  return date.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function countByStatus(rows: any[] | null | undefined) {
  const counts = {
    won: 0,
    lost: 0,
    push: 0,
    pending: 0,
    other: 0,
  };

  for (const row of rows ?? []) {
    const result = String(row.result ?? row.status ?? "").toUpperCase();

    if (result === "WON") counts.won += 1;
    else if (result === "LOST") counts.lost += 1;
    else if (result === "PUSH") counts.push += 1;
    else if (result === "PENDING") counts.pending += 1;
    else counts.other += 1;
  }

  return counts;
}

async function safeCount(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  date?: string
) {
  let query = supabase.from(table).select("id", {
    count: "exact",
    head: true,
  });

  if (date) {
    query = query.eq("date", date);
  }

  const { count, error } = await query;

  return {
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

async function safeRecent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: string,
  columns: string,
  limit = 10
) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .order("created_at", { ascending: false })
    .limit(limit);

  return {
    data: data ?? [],
    error: error?.message ?? null,
  };
}

async function loadOperationsCenter(supabase: ReturnType<typeof getSupabaseAdmin>, date: string) {
  const now = new Date().toISOString();
  const [
    signals,
    picks,
    performance,
    learning,
    validation,
    activeSubscriptions,
    todayPurchases,
  ] = await Promise.all([
    supabase
      .from("atlas_core_mlb_signals")
      .select("*")
      .eq("date", date)
      .eq("stage", "SIGNALS_DETECTED")
      .order("start_time", { ascending: true }),
    supabase
      .from("atlas_core_mlb_picks")
      .select("*")
      .eq("date", date)
      .order("rank", { ascending: true }),
    supabase
      .from("mlb_performance_analytics")
      .select("*")
      .eq("canonical", true)
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("mlb_learning_insights")
      .select("*")
      .eq("canonical", true)
      .order("timestamp", { ascending: false })
      .limit(6),
    supabase
      .from("mlb_research_validation_history")
      .select("id,result,market,edge_classification,decision,conviction,confidence,roi,clv_probability,created_at")
      .eq("canonical", true)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("product_purchases")
      .select("id,product_code,status,amount_total,currency,created_at,access_date")
      .or(`access_date.eq.${date},created_at.gte.${date}T00:00:00.000Z`)
      .limit(1000),
  ]);

  const signalRows = signals.data ?? [];
  const pickRows = picks.data ?? [];
  const topSignal = pickRows.find((row: any) => row.is_top_signal) ?? null;
  const futureGames = signalRows.filter((row: any) => row.start_time && row.start_time > now);
  const nextGame = futureGames[0] ?? null;
  const gamesRemaining = futureGames.length;
  const confirmed = pickRows.filter((row: any) => String(row.status).toUpperCase() === "CONFIRMED").length;
  const pending = pickRows.filter((row: any) => String(row.status).toUpperCase() === "PENDING").length;
  const downgraded = pickRows.filter((row: any) => String(row.status).toUpperCase() === "DOWNGRADED").length;
  const removed = pickRows.filter((row: any) => String(row.status).toUpperCase() === "REMOVED").length;
  const validationRows = validation.data ?? [];
  const graded = validationRows.filter((row: any) => String(row.result).toUpperCase() !== "PENDING");
  const wins = graded.filter((row: any) => String(row.result).toUpperCase() === "WON").length;
  const losses = graded.filter((row: any) => String(row.result).toUpperCase() === "LOST").length;

  const recentActivity = [
    signalRows.length
      ? {
          time: signalRows[0]?.morning_scan_at ?? signalRows[0]?.created_at,
          title: "Morning scan completed",
          detail: `${signalRows.length} signals detected and frozen`,
          tone: "blue",
        }
      : null,
    pickRows.length
      ? {
          time: pickRows[0]?.published_at ?? pickRows[0]?.created_at,
          title: "Top 5 updated",
          detail: `${pickRows.length} validated picks active`,
          tone: "green",
        }
      : null,
    topSignal
      ? {
          time: topSignal.published_at ?? topSignal.created_at,
          title: "Top Signal published",
          detail: `${topSignal.pick}`,
          tone: "purple",
        }
      : null,
    confirmed
      ? {
          time: pickRows.find((row: any) => String(row.status).toUpperCase() === "CONFIRMED")?.final_validated_at,
          title: "Pick confirmed",
          detail: `${confirmed} confirmed`,
          tone: "green",
        }
      : null,
    downgraded
      ? {
          time: pickRows.find((row: any) => String(row.status).toUpperCase() === "DOWNGRADED")?.final_validated_at,
          title: "Pick downgraded",
          detail: `${downgraded} downgraded`,
          tone: "yellow",
        }
      : null,
  ].filter(Boolean);

  const errors = [
    signals.error?.message,
    picks.error?.message,
    performance.error?.message,
    learning.error?.message,
    validation.error?.message,
    activeSubscriptions.error?.message,
    todayPurchases.error?.message,
  ].filter(Boolean) as string[];
  const todayPurchaseRows = todayPurchases.data ?? [];
  const revenuePurchases = todayPurchaseRows.filter((row: any) => typeof row.amount_total === "number");
  const revenueCents = revenuePurchases.length
    ? revenuePurchases.reduce((sum: number, row: any) => sum + Number(row.amount_total ?? 0), 0)
    : null;
  const healthStatus = errors.length
    ? "ERROR"
    : performance.data && learning.data
      ? "HEALTHY"
      : "PARTIAL";

  return {
    errors,
    generatedAt: new Date().toISOString(),
    date,
    league: "MLB",
    signalsDetected: signalRows.length,
    validatedPicks: pickRows.length,
    topSignalPublished: Boolean(topSignal),
    gamesRemaining,
    nextGame: nextGame
      ? {
          startTime: nextGame.start_time ?? null,
          awayTeam: nextGame.away_team ?? null,
          homeTeam: nextGame.home_team ?? null,
          status: nextGame.status ?? "SCHEDULED",
        }
      : null,
    atlasCore: {
      overall: healthStatus,
      research: performance.data ? "HEALTHY" : "PARTIAL",
      validation: validation.error ? "ERROR" : "HEALTHY",
      publishing: pickRows.length ? "HEALTHY" : "PARTIAL",
      learning: learning.data ? "HEALTHY" : "PARTIAL",
    },
    confirmed,
    pending,
    downgraded,
    removed,
    topSignal,
    topPicks: pickRows,
    pipeline: [
      { label: "Morning Scan", detail: "7:00 AM", status: signalRows.length ? "complete" : "pending" },
      { label: "Signals Frozen", detail: signalRows.length ? "Active" : "Pending", status: signalRows.length ? "complete" : "pending" },
      { label: "Validation Live", detail: "Every 5 min", status: "complete" },
      { label: "Top 5 Active", detail: pickRows.length ? "Active" : "Pending", status: pickRows.length ? "complete" : "pending" },
      { label: "Top Signal Published", detail: topSignal ? "Published" : "Pending", status: topSignal ? "complete" : "pending" },
      { label: "Post Game", detail: graded.length ? "Active" : "Pending", status: graded.length ? "complete" : "pending" },
    ],
    recentActivity,
    businessSnapshot: {
      activeSubscribers: activeSubscriptions.error ? null : activeSubscriptions.count ?? 0,
      topSignalPurchasesToday: todayPurchases.error
        ? null
        : todayPurchaseRows.filter((row: any) => String(row.product_code ?? "").startsWith("top_signal_")).length,
      dailyPurchasesToday: todayPurchases.error ? null : todayPurchaseRows.length,
      revenueToday: todayPurchases.error || revenueCents === null ? null : revenueCents / 100,
      currency: todayPurchaseRows.find((row: any) => row.currency)?.currency ?? "usd",
    },
    performance: {
      sampleSize: performance.data?.sample_size ?? validationRows.length,
      totalPicks: performance.data?.total_picks ?? validationRows.length,
      totalNoPicks: performance.data?.total_no_picks ?? 0,
      wins: performance.data?.wins ?? wins,
      losses: performance.data?.losses ?? losses,
      pushes: performance.data?.pushes ?? 0,
      winRate: performance.data?.win_rate ?? (wins + losses ? wins / (wins + losses) : null),
      roi: performance.data?.roi ?? null,
      averageClv: performance.data?.average_clv ?? null,
      bestMarket: performance.data?.best_market ?? null,
      worstMarket: performance.data?.worst_market ?? null,
      bestEdgeClassification: performance.data?.best_edge_classification ?? null,
      bestConviction: performance.data?.best_conviction ?? null,
      bestConfidenceBucket: performance.data?.best_confidence_bucket ?? null,
      lowSampleSize: performance.data?.low_sample_size ?? true,
      calculatedAt: performance.data?.calculated_at ?? null,
    },
    learning: learning.data ?? [],
    database: {
      health: errors.length ? "warnings" : "ready",
      snapshots: signalRows.length + pickRows.length + validationRows.length,
      cron: "ready",
      storage: "ready",
      warnings: errors,
    },
  };
}

function rowNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function latestBy<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = keyFn(row);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

async function loadResearchDashboard(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const [
    decisions,
    projections,
    teamRows,
    pitcherRows,
    bullpenRows,
    lineupRows,
    weatherRows,
  ] = await Promise.all([
    supabase
      .from("mlb_decision_research_snapshots")
      .select("*")
      .eq("model_version", "mlb_decision_engine_v1")
      .eq("canonical", true)
      .order("captured_at", { ascending: false })
      .limit(100),
    supabase
      .from("mlb_projection_research_snapshots")
      .select("*")
      .eq("model_version", "mlb_projection_research_v1")
      .eq("canonical", true)
      .order("captured_at", { ascending: false })
      .limit(100),
    supabase
      .from("mlb_team_intelligence_snapshots")
      .select("*")
      .eq("team_quality_version", "team_quality_v2_research")
      .eq("canonical", true)
      .order("captured_at", { ascending: false })
      .limit(300),
    supabase
      .from("mlb_starting_pitcher_quality_snapshots")
      .select("*")
      .eq("canonical", true)
      .order("captured_at", { ascending: false })
      .limit(300),
    supabase
      .from("mlb_bullpen_feature_snapshots")
      .select("*")
      .eq("canonical", true)
      .order("captured_at", { ascending: false })
      .limit(300),
    supabase
      .from("mlb_lineup_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(500),
    supabase
      .from("mlb_weather_park_feature_snapshots")
      .select("*")
      .eq("canonical", true)
      .order("captured_at", { ascending: false })
      .limit(200),
  ]);

  const errors = [
    decisions.error?.message,
    projections.error?.message,
    teamRows.error?.message,
    pitcherRows.error?.message,
    bullpenRows.error?.message,
    lineupRows.error?.message,
    weatherRows.error?.message,
  ].filter(Boolean) as string[];

  const projectionByGame = latestBy(projections.data ?? [], (row: any) => row.official_game_id);
  const teamByGameSide = latestBy(
    teamRows.data ?? [],
    (row: any) => `${row.official_game_id}:${row.side}`,
  );
  const pitcherByGameSide = latestBy(
    pitcherRows.data ?? [],
    (row: any) => `${row.official_game_id}:${row.side}`,
  );
  const bullpenByTeam = latestBy(bullpenRows.data ?? [], (row: any) => row.team_id);
  const lineupByGameSide = latestBy(
    lineupRows.data ?? [],
    (row: any) => `${row.official_game_id}:${row.side}`,
  );
  const weatherByGame = latestBy(weatherRows.data ?? [], (row: any) => row.official_game_id);

  const games = (decisions.data ?? []).map((decision: any) => {
    const projection: any = projectionByGame.get(decision.official_game_id);
    const homeTeam: any = teamByGameSide.get(`${decision.official_game_id}:HOME`);
    const awayTeam: any = teamByGameSide.get(`${decision.official_game_id}:AWAY`);
    const homePitcher: any = pitcherByGameSide.get(`${decision.official_game_id}:HOME`);
    const awayPitcher: any = pitcherByGameSide.get(`${decision.official_game_id}:AWAY`);
    const homeBullpen: any = bullpenByTeam.get(decision.home_team_id);
    const awayBullpen: any = bullpenByTeam.get(decision.away_team_id);
    const homeLineup: any = lineupByGameSide.get(`${decision.official_game_id}:HOME`);
    const awayLineup: any = lineupByGameSide.get(`${decision.official_game_id}:AWAY`);
    const weather: any = weatherByGame.get(decision.official_game_id);
    const market = decision.component_breakdown?.marketIntelligence;

    return {
      id: decision.official_game_id,
      header: {
        awayTeam: decision.away_team_name,
        homeTeam: decision.home_team_name,
        time: weather?.scheduled_start_time ?? projection?.captured_at ?? decision.captured_at,
        status: homeLineup?.game_status ?? awayLineup?.game_status ?? "Research",
        league: "MLB",
      },
      decision: {
        decision: decision.decision,
        consensus: decision.consensus_grade,
        consensusScore: rowNumber(decision.consensus_score),
        conviction: decision.conviction_grade,
        convictionScore: rowNumber(decision.conviction_score),
        confidence: rowNumber(decision.decision_confidence_score),
        confidenceTier: decision.decision_confidence_tier,
        noPick: Boolean(decision.no_pick),
        noPickReasons: decision.no_pick_reasons ?? [],
        componentBreakdown: decision.component_breakdown,
        engineVersion: decision.model_version,
        updatedAt: decision.captured_at,
      },
      projection: projection ? {
        homeRuns: rowNumber(projection.projected_home_runs),
        awayRuns: rowNumber(projection.projected_away_runs),
        totalRuns: rowNumber(projection.projected_total_runs),
        homeWinProbability: rowNumber(projection.home_win_probability),
        awayWinProbability: rowNumber(projection.away_win_probability),
        fairMoneylineHome: projection.fair_moneyline_home,
        fairMoneylineAway: projection.fair_moneyline_away,
        availability: projection.projection_availability,
        confidence: rowNumber(projection.projection_confidence_score),
        modelVersion: projection.model_version,
        featureHash: projection.feature_hash,
        updatedAt: projection.captured_at,
      } : null,
      market: market && market.movementCount > 0 ? {
        movementCount: market.movementCount,
        strongestDirection: market.strongestDirection,
        strongestImpact: market.strongestImpact,
        sportsbookCount: market.sportsbookCount,
        consensusPercent: market.consensusPercent,
        magnitudeScore: market.magnitudeScore,
      } : null,
      teamQuality: {
        home: {
          score: rowNumber(homeTeam?.team_quality_v2_research_score),
          confidence: homeTeam?.quality_confidence?.tier ?? homeTeam?.team_quality_confidence ?? "Unavailable",
          availability: homeTeam?.team_quality_availability,
          coverage: homeTeam?.coverage_score ?? homeTeam?.team_quality_coverage,
          version: homeTeam?.team_quality_version,
          updatedAt: homeTeam?.captured_at,
        },
        away: {
          score: rowNumber(awayTeam?.team_quality_v2_research_score),
          confidence: awayTeam?.quality_confidence?.tier ?? awayTeam?.team_quality_confidence ?? "Unavailable",
          availability: awayTeam?.team_quality_availability,
          coverage: awayTeam?.coverage_score ?? awayTeam?.team_quality_coverage,
          version: awayTeam?.team_quality_version,
          updatedAt: awayTeam?.captured_at,
        },
      },
      pitchers: {
        home: {
          name: homePitcher?.player_name,
          status: homePitcher?.starter_status ?? homePitcher?.status,
          quality: rowNumber(homePitcher?.quality_score),
          readiness: rowNumber(homePitcher?.readiness_score),
          confidence: homePitcher?.quality_confidence?.tier,
          baselineVersion: homePitcher?.baseline_version,
          updatedAt: homePitcher?.captured_at,
        },
        away: {
          name: awayPitcher?.player_name,
          status: awayPitcher?.starter_status ?? awayPitcher?.status,
          quality: rowNumber(awayPitcher?.quality_score),
          readiness: rowNumber(awayPitcher?.readiness_score),
          confidence: awayPitcher?.quality_confidence?.tier,
          baselineVersion: awayPitcher?.baseline_version,
          updatedAt: awayPitcher?.captured_at,
        },
      },
      offense: {
        home: {
          score: rowNumber(homeTeam?.offense_score),
          last7: rowNumber(homeTeam?.offense_last_7_score),
          last14: rowNumber(homeTeam?.offense_last_14_score),
          last30: rowNumber(homeTeam?.offense_last_30_score),
          availability: homeTeam?.offense_availability ?? homeTeam?.team_quality_availability,
          sampleQuality: homeTeam?.offense_sample_quality,
          version: homeTeam?.offense_version,
        },
        away: {
          score: rowNumber(awayTeam?.offense_score),
          last7: rowNumber(awayTeam?.offense_last_7_score),
          last14: rowNumber(awayTeam?.offense_last_14_score),
          last30: rowNumber(awayTeam?.offense_last_30_score),
          availability: awayTeam?.offense_availability ?? awayTeam?.team_quality_availability,
          sampleQuality: awayTeam?.offense_sample_quality,
          version: awayTeam?.offense_version,
        },
      },
      bullpen: {
        home: {
          quality: rowNumber(homeBullpen?.quality_score_v2 ?? homeBullpen?.quality_score),
          fatigue: rowNumber(homeBullpen?.fatigue_score_v2 ?? homeBullpen?.fatigue_score),
          effectiveDepth: homeBullpen?.effective_depth ?? homeBullpen?.effective_depth_tier,
          confidence: homeBullpen?.quality_confidence ?? homeBullpen?.confidence,
          availability: homeBullpen?.availability,
          version: homeBullpen?.data_version,
          updatedAt: homeBullpen?.captured_at,
        },
        away: {
          quality: rowNumber(awayBullpen?.quality_score_v2 ?? awayBullpen?.quality_score),
          fatigue: rowNumber(awayBullpen?.fatigue_score_v2 ?? awayBullpen?.fatigue_score),
          effectiveDepth: awayBullpen?.effective_depth ?? awayBullpen?.effective_depth_tier,
          confidence: awayBullpen?.quality_confidence ?? awayBullpen?.confidence,
          availability: awayBullpen?.availability,
          version: awayBullpen?.data_version,
          updatedAt: awayBullpen?.captured_at,
        },
      },
      lineups: {
        home: {
          confirmed: homeLineup?.confirmed ?? null,
          stability: homeLineup?.batting_order_complete ? "Complete" : homeLineup ? "Partial" : "Unavailable",
          playerCount: homeLineup?.player_count,
          changes: homeLineup?.change_count,
          lateScratches: homeLineup?.late_scratch_count,
          updatedAt: homeLineup?.captured_at,
        },
        away: {
          confirmed: awayLineup?.confirmed ?? null,
          stability: awayLineup?.batting_order_complete ? "Complete" : awayLineup ? "Partial" : "Unavailable",
          playerCount: awayLineup?.player_count,
          changes: awayLineup?.change_count,
          lateScratches: awayLineup?.late_scratch_count,
          updatedAt: awayLineup?.captured_at,
        },
      },
      weather: weather ? {
        temperature: rowNumber(weather.temperature_f),
        humidity: rowNumber(weather.humidity_percent),
        wind: weather.wind_speed_mph === null || weather.wind_speed_mph === undefined
          ? null
          : `${weather.wind_speed_mph} mph ${weather.wind_direction_cardinal ?? ""}`.trim(),
        precipitation: rowNumber(weather.precipitation_probability),
        delayRisk: rowNumber(weather.delay_risk),
        runEnvironment: rowNumber(weather.weather_run_environment_score),
        roofStatus: weather.roof_status,
        availability: weather.availability,
        updatedAt: weather.captured_at,
      } : null,
      park: weather ? {
        environment: rowNumber(weather.park_environment_score),
        venue: weather.venue_name,
        availability: weather.availability,
        updatedAt: weather.captured_at,
      } : null,
      gameReadiness: {
        home: rowNumber(homeTeam?.game_readiness_score),
        away: rowNumber(awayTeam?.game_readiness_score),
        availability: homeTeam?.game_readiness_availability ?? awayTeam?.game_readiness_availability,
        homeConfidence: homeTeam?.game_readiness_confidence,
        awayConfidence: awayTeam?.game_readiness_confidence,
        homeReasons: homeTeam?.game_readiness_reasons,
        awayReasons: awayTeam?.game_readiness_reasons,
        homeWarnings: homeTeam?.game_readiness_warnings,
        awayWarnings: awayTeam?.game_readiness_warnings,
      },
      contextCertainty: {
        score: rowNumber(homeTeam?.context_certainty_score ?? awayTeam?.context_certainty_score),
        confidence: homeTeam?.intelligence_confidence_tier ?? awayTeam?.intelligence_confidence_tier,
        availability: homeTeam?.context_certainty_score || awayTeam?.context_certainty_score ? "AVAILABLE" : "UNAVAILABLE",
        missingModules: homeTeam?.missing_modules ?? awayTeam?.missing_modules,
        warnings: homeTeam?.warnings ?? awayTeam?.warnings,
      },
      engineStatus: [
        { name: "Projection", status: projection?.projection_availability ?? "UNAVAILABLE", updatedAt: projection?.captured_at },
        { name: "Market", status: market?.movementCount > 0 ? "AVAILABLE" : "UNAVAILABLE", updatedAt: decision.captured_at },
        { name: "Pitcher", status: homePitcher || awayPitcher ? "AVAILABLE" : "UNAVAILABLE", updatedAt: homePitcher?.captured_at ?? awayPitcher?.captured_at },
        { name: "Offense", status: homeTeam?.offense_score || awayTeam?.offense_score ? "AVAILABLE" : "UNAVAILABLE", updatedAt: homeTeam?.captured_at ?? awayTeam?.captured_at },
        { name: "Bullpen", status: homeBullpen || awayBullpen ? "AVAILABLE" : "UNAVAILABLE", updatedAt: homeBullpen?.captured_at ?? awayBullpen?.captured_at },
        { name: "Weather", status: weather?.availability ?? "UNAVAILABLE", updatedAt: weather?.captured_at },
        { name: "Park", status: weather?.park_environment_score ? "AVAILABLE" : "UNAVAILABLE", updatedAt: weather?.captured_at },
        { name: "Decision", status: decision.decision_confidence_tier ?? "UNAVAILABLE", updatedAt: decision.captured_at },
      ],
    };
  });

  return {
    updatedAt: new Date().toISOString(),
    games,
    errors,
  };
}

export async function GET() {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const today = todayET();
  const since = daysAgoET(7);
  const errors: string[] = [];

  const sportHealth = await Promise.all(
    sports.map(async (config) => {
      const [publicToday, top5Live, top5Today, topSignalToday, top5History, topSignalHistory] =
        await Promise.all([
          safeCount(supabase, config.publicTable, today),
          safeCount(supabase, config.liveTable, today),
          safeCount(supabase, config.top5HistoryTable, today),
          safeCount(supabase, config.topSignalHistoryTable, today),
          supabase
            .from(config.top5HistoryTable)
            .select("result,status,date,pick,away_team,home_team")
            .gte("date", since),
          supabase
            .from(config.topSignalHistoryTable)
            .select("result,status,date,pick,away_team,home_team")
            .gte("date", since),
        ]);

      for (const item of [publicToday, top5Live, top5Today, topSignalToday]) {
        if (item.error) errors.push(`${config.sport}: ${item.error}`);
      }

      if (top5History.error) errors.push(`${config.sport} top5 history: ${top5History.error.message}`);
      if (topSignalHistory.error) {
        errors.push(`${config.sport} top signal history: ${topSignalHistory.error.message}`);
      }

      return {
        sport: config.sport,
        today: {
          publicSignals: publicToday.count,
          top5Live: top5Live.count,
          top5History: top5Today.count,
          topSignalHistory: topSignalToday.count,
        },
        last7Days: {
          top5: countByStatus(top5History.data),
          topSignal: countByStatus(topSignalHistory.data),
        },
      };
    })
  );

  const [subscriptions, purchases, challengeAttempts, challengeRewards, researchDashboard, operations] = await Promise.all([
    safeRecent(
      supabase,
      "subscriptions",
      "id,user_id,plan_code,sport,status,current_period_end,updated_at,created_at",
      15
    ),
    safeRecent(
      supabase,
      "product_purchases",
      "id,user_id,product_code,sport,status,access_date,amount_total,currency,created_at",
      15
    ),
    safeRecent(
      supabase,
      "challenge_attempts",
      "id,user_id,challenge_code,status,result,created_at",
      10
    ),
    safeRecent(
      supabase,
      "challenge_rewards",
      "id,user_id,reward_plan,status,starts_at,ends_at,created_at",
      10
    ),
    loadResearchDashboard(supabase),
    loadOperationsCenter(supabase, today),
  ]);

  for (const item of [subscriptions, purchases, challengeAttempts, challengeRewards]) {
    if (item.error) errors.push(item.error);
  }
  errors.push(...researchDashboard.errors.map((error) => `Research dashboard: ${error}`));
  errors.push(...operations.errors.map((error) => `Operations: ${error}`));

  return NextResponse.json({
    success: true,
    generatedAt: new Date().toISOString(),
    today,
    adminEmail: user.email,
    environment: {
      nextPublicSiteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      stripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      stripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      sportsDataIoKey: Boolean(process.env.SPORTSDATAIO_API_KEY),
      oddsApiKey: Boolean(process.env.ODDS_API_KEY),
    },
    crons: cronJobs,
    sports: sportHealth,
    subscriptions: subscriptions.data,
    purchases: purchases.data,
    challenges: {
      attempts: challengeAttempts.data,
      rewards: challengeRewards.data,
    },
    researchDashboard,
    operations,
    errors,
  });
}
