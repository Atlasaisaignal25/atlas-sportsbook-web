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
          updatedAt: homeTeam?.captured_at,
        },
        away: {
          score: rowNumber(awayTeam?.team_quality_v2_research_score),
          confidence: awayTeam?.quality_confidence?.tier ?? awayTeam?.team_quality_confidence ?? "Unavailable",
          availability: awayTeam?.team_quality_availability,
          updatedAt: awayTeam?.captured_at,
        },
      },
      pitchers: {
        home: {
          name: homePitcher?.player_name,
          quality: rowNumber(homePitcher?.quality_score),
          readiness: rowNumber(homePitcher?.readiness_score),
          confidence: homePitcher?.quality_confidence?.tier,
          updatedAt: homePitcher?.captured_at,
        },
        away: {
          name: awayPitcher?.player_name,
          quality: rowNumber(awayPitcher?.quality_score),
          readiness: rowNumber(awayPitcher?.readiness_score),
          confidence: awayPitcher?.quality_confidence?.tier,
          updatedAt: awayPitcher?.captured_at,
        },
      },
      offense: {
        home: { score: rowNumber(homeTeam?.offense_score) },
        away: { score: rowNumber(awayTeam?.offense_score) },
      },
      bullpen: {
        home: {
          quality: rowNumber(homeBullpen?.quality_score_v2 ?? homeBullpen?.quality_score),
          fatigue: rowNumber(homeBullpen?.fatigue_score_v2 ?? homeBullpen?.fatigue_score),
          availability: homeBullpen?.availability,
          updatedAt: homeBullpen?.captured_at,
        },
        away: {
          quality: rowNumber(awayBullpen?.quality_score_v2 ?? awayBullpen?.quality_score),
          fatigue: rowNumber(awayBullpen?.fatigue_score_v2 ?? awayBullpen?.fatigue_score),
          availability: awayBullpen?.availability,
          updatedAt: awayBullpen?.captured_at,
        },
      },
      lineups: {
        home: {
          confirmed: homeLineup?.confirmed ?? null,
          stability: homeLineup?.batting_order_complete ? "Complete" : homeLineup ? "Partial" : "Unavailable",
          playerCount: homeLineup?.player_count,
          updatedAt: homeLineup?.captured_at,
        },
        away: {
          confirmed: awayLineup?.confirmed ?? null,
          stability: awayLineup?.batting_order_complete ? "Complete" : awayLineup ? "Partial" : "Unavailable",
          playerCount: awayLineup?.player_count,
          updatedAt: awayLineup?.captured_at,
        },
      },
      weather: weather ? {
        temperature: rowNumber(weather.temperature_f),
        wind: weather.wind_speed_mph === null || weather.wind_speed_mph === undefined
          ? null
          : `${weather.wind_speed_mph} mph ${weather.wind_direction_cardinal ?? ""}`.trim(),
        delayRisk: rowNumber(weather.delay_risk),
        runEnvironment: rowNumber(weather.weather_run_environment_score),
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
      },
      contextCertainty: {
        score: rowNumber(homeTeam?.context_certainty_score ?? awayTeam?.context_certainty_score),
        confidence: homeTeam?.intelligence_confidence_tier ?? awayTeam?.intelligence_confidence_tier,
        availability: homeTeam?.context_certainty_score || awayTeam?.context_certainty_score ? "AVAILABLE" : "UNAVAILABLE",
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

  const [subscriptions, purchases, challengeAttempts, challengeRewards, researchDashboard] = await Promise.all([
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
  ]);

  for (const item of [subscriptions, purchases, challengeAttempts, challengeRewards]) {
    if (item.error) errors.push(item.error);
  }
  errors.push(...researchDashboard.errors.map((error) => `Research dashboard: ${error}`));

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
    errors,
  });
}
