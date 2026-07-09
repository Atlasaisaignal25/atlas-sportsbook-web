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

  const [subscriptions, purchases, challengeAttempts, challengeRewards] = await Promise.all([
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
  ]);

  for (const item of [subscriptions, purchases, challengeAttempts, challengeRewards]) {
    if (item.error) errors.push(item.error);
  }

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
    errors,
  });
}
