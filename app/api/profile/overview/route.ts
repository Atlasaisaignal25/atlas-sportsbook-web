import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ProductCode = "top_signal_mlb" | "top5_mlb" | "exclusive_pack" | "nrfi_yrfi";
type SignalStatus = "DETECTED" | "UNDER REVIEW" | "CONFIRMED" | "DOWNGRADED" | "WITHDRAWN" | "READY";

const activeSubscriptionStatuses = ["active", "trialing"];
const visibleOfficialStatuses = ["VALIDATED", "CONFIRMED", "PENDING", "DOWNGRADED"];

function todayET() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function displayName(user: any) {
  const metadata = user?.user_metadata ?? {};
  return (
    metadata.full_name ??
    metadata.name ??
    user?.email?.split("@")[0] ??
    "Unavailable"
  );
}

function username(user: any) {
  const metadata = user?.user_metadata ?? {};
  const handle = metadata.user_name ?? metadata.username ?? user?.email?.split("@")[0];
  return handle ? `@${handle}` : "Unavailable";
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length || name === "Unavailable") return "AS";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatDate(value: unknown) {
  if (!value) return "Unavailable";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
}

function formatTime(value: unknown) {
  if (!value) return "Unavailable";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(date).replace(/\s/g, " ");
}

function money(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number > 0 ? `+${number}` : String(number);
}

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `${Math.round(value * 100)}%`;
}

function planTier(plan: string | null | undefined) {
  const normalized = String(plan ?? "").toLowerCase();
  if (normalized === "elite") return "ELITE MEMBER";
  if (normalized === "premium") return "PREMIUM MEMBER";
  if (normalized === "exclusive") return "PRO MEMBER";
  return "FREE MEMBER";
}

function productFromPlan(plan: string | null | undefined): ProductCode | null {
  const normalized = String(plan ?? "").toLowerCase();
  if (normalized === "exclusive") return "exclusive_pack";
  if (normalized === "premium" || normalized === "elite") return "top5_mlb";
  return null;
}

function statusLabel(status: unknown, product: ProductCode): SignalStatus {
  if (product === "top_signal_mlb") return "READY";
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "CONFIRMED") return "CONFIRMED";
  if (normalized === "DOWNGRADED") return "DOWNGRADED";
  if (normalized === "REMOVED") return "WITHDRAWN";
  if (normalized === "PENDING") return "DETECTED";
  return "UNDER REVIEW";
}

function productLabel(code: ProductCode) {
  if (code === "top_signal_mlb") return "Top Signal";
  if (code === "top5_mlb") return "Top 5 MLB";
  if (code === "exclusive_pack") return "Exclusive Pack";
  return "NRFI/YRFI";
}

function recommendationCatalog() {
  return [
    {
      code: "top_signal_mlb",
      title: "Today's Top Signal",
      description: "Get the strongest signal of the day.",
      cta: "Unlock",
      tone: "purple",
    },
    {
      code: "top5_mlb",
      title: "Top 5 MLB",
      description: "5 premium signals every day.",
      cta: "View Details",
      tone: "cyan",
    },
    {
      code: "exclusive_pack",
      title: "Exclusive Pack",
      description: "Get exclusive signals and insights.",
      cta: "Upgrade",
      tone: "green",
    },
    {
      code: "nrfi_yrfi",
      title: "NRFI/YRFI",
      description: "Specialized first-inning signals.",
      cta: "Subscribe",
      tone: "gold",
    },
  ];
}

function productStatus(row: any | null) {
  if (!row) return "INACTIVE";
  const status = String(row.status ?? "").toUpperCase();
  if (status.includes("CANCEL")) return "CANCELLED";
  if (status === "ACTIVE" || status === "TRIALING" || status === "PAID") return "ACTIVE";
  return status || "INACTIVE";
}

function activeUntilText(row: any | null) {
  if (!row) return "Not subscribed";
  const date = row.current_period_end ?? row.access_date ?? null;
  if (!date) return "Unavailable";
  return `Renews ${formatDate(date)}`;
}

async function safeTable<T>(promise: PromiseLike<{ data: T | null; error: any }>, fallback: T) {
  const result = await promise;
  if (result.error) return fallback;
  return result.data ?? fallback;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const date = todayET();
  const [subscriptions, purchases, officialPicks, officialHistory, notifications] = await Promise.all([
    safeTable(
      admin
        .from("subscriptions")
        .select("id,plan_code,sport,status,current_period_start,current_period_end,cancel_at_period_end,created_at,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(10),
      [] as any[],
    ),
    safeTable(
      admin
        .from("product_purchases")
        .select("id,product_code,sport,status,access_date,created_at,updated_at")
        .eq("user_id", user.id)
        .gte("access_date", date)
        .order("created_at", { ascending: false })
        .limit(20),
      [] as any[],
    ),
    safeTable(
      admin
        .from("atlas_core_mlb_picks")
        .select("id,game_id,away_team,home_team,start_time,pick,market,line,odds,direction,rank,status,is_top_signal,published_at")
        .eq("sport", "MLB")
        .eq("date", date)
        .in("status", visibleOfficialStatuses)
        .order("rank", { ascending: true })
        .limit(10),
      [] as any[],
    ),
    safeTable(
      admin
        .from("mlb_research_validation_history")
        .select("id,result,units,record_type,canonical,official_rank,is_top_signal")
        .eq("record_type", "OFFICIAL")
        .eq("canonical", true)
        .in("result", ["WON", "LOST", "PUSH"])
        .limit(500),
      [] as any[],
    ),
    safeTable(
      admin
        .from("precision_notifications")
        .select("id,status")
        .eq("user_id", user.id)
        .in("status", ["requested", "prepared", "reserved"])
        .limit(50),
      [] as any[],
    ),
  ]);

  const activeSubscription = subscriptions.find((row) =>
    activeSubscriptionStatuses.includes(String(row.status ?? "").toLowerCase()),
  ) ?? null;
  const subscriptionProduct = productFromPlan(activeSubscription?.plan_code);
  const owned = new Set<ProductCode>();
  if (subscriptionProduct) owned.add(subscriptionProduct);
  for (const purchase of purchases) {
    if (purchase.status !== "paid") continue;
    if (purchase.product_code === "top_signal_mlb") owned.add("top_signal_mlb");
  }

  const canSeeTopSignal = owned.has("top_signal_mlb");
  const canSeeTop5 = owned.has("top5_mlb");
  const canSeeExclusive = owned.has("exclusive_pack");

  const signals = officialPicks.flatMap((row) => {
    const rows: any[] = [];
    if (row.is_top_signal && canSeeTopSignal) {
      rows.push({
        id: `top-signal-${row.id}`,
        product: "Top Signal",
        productCode: "top_signal_mlb",
        selection: `${row.pick}${row.odds ? ` ${money(row.odds)}` : ""}`,
        event: `${row.home_team} vs ${row.away_team}`,
        opponent: row.direction === "HOME" ? row.away_team : row.home_team,
        team: row.direction === "HOME" ? row.home_team : row.away_team,
        status: "READY",
        gameTime: formatTime(row.start_time),
        publishedAt: formatTime(row.published_at),
      });
    }
    if (canSeeTop5 && Number(row.rank) <= 5) {
      rows.push({
        id: `top5-${row.id}`,
        product: "Top 5 MLB",
        productCode: "top5_mlb",
        selection: `${row.pick}${row.odds ? ` ${money(row.odds)}` : ""}`,
        event: `${row.home_team} vs ${row.away_team}`,
        opponent: row.direction === "HOME" ? row.away_team : row.home_team,
        team: row.direction === "HOME" ? row.home_team : row.away_team,
        status: statusLabel(row.status, "top5_mlb"),
        gameTime: formatTime(row.start_time),
        publishedAt: formatTime(row.published_at),
      });
    }
    if (canSeeExclusive && Number(row.rank) <= 3) {
      rows.push({
        id: `exclusive-${row.id}`,
        product: "Exclusive Pack",
        productCode: "exclusive_pack",
        selection: `${row.pick}${row.odds ? ` ${money(row.odds)}` : ""}`,
        event: `${row.home_team} vs ${row.away_team}`,
        opponent: row.direction === "HOME" ? row.away_team : row.home_team,
        team: row.direction === "HOME" ? row.home_team : row.away_team,
        status: statusLabel(row.status, "exclusive_pack"),
        gameTime: formatTime(row.start_time),
        publishedAt: formatTime(row.published_at),
      });
    }
    return rows;
  });

  const graded = officialHistory;
  const wins = graded.filter((row) => row.result === "WON").length;
  const losses = graded.filter((row) => row.result === "LOST").length;
  const pushes = graded.filter((row) => row.result === "PUSH").length;
  const decisions = wins + losses;
  const units = graded.reduce((sum, row) => sum + (Number(row.units) || 0), 0);
  const hasSample = decisions >= 10;
  const winRate = decisions ? wins / decisions : null;
  const roi = decisions ? units / decisions : null;
  const accuracy = decisions + pushes ? wins / (decisions + pushes) : null;

  const products = [
    {
      code: "top_signal_mlb",
      name: "Top Signal",
      status: canSeeTopSignal ? "ACTIVE" : "INACTIVE",
      detail: canSeeTopSignal ? `Access for ${date}` : "Not subscribed",
      expandable: true,
    },
    {
      code: "top5_mlb",
      name: "Top 5 MLB",
      status: canSeeTop5 ? "ACTIVE" : "INACTIVE",
      detail: canSeeTop5 ? activeUntilText(activeSubscription) : "Not subscribed",
      expandable: true,
    },
    {
      code: "exclusive_pack",
      name: "Exclusive Pack",
      status: canSeeExclusive ? productStatus(activeSubscription) : "INACTIVE",
      detail: canSeeExclusive ? activeUntilText(activeSubscription) : "Not subscribed",
      expandable: true,
    },
    {
      code: "nrfi_yrfi",
      name: "NRFI/YRFI",
      status: "INACTIVE",
      detail: "Not subscribed",
      expandable: true,
    },
  ];

  const recommendations = recommendationCatalog().filter((item) => !owned.has(item.code as ProductCode));

  const signalActivity = signals.slice(0, 4).map((signal) => ({
    id: `activity-${signal.id}`,
    type: signal.status === "READY" ? "Top Signal Published" : `Signal ${signal.status[0]}${signal.status.slice(1).toLowerCase()}`,
    description: signal.selection,
    time: signal.publishedAt,
    product: signal.product,
  }));

  return NextResponse.json({
    profile: {
      name: displayName(user),
      username: username(user),
      initials: initials(displayName(user)),
      membershipTier: planTier(activeSubscription?.plan_code),
      memberSince: formatDate(user.created_at),
      timeZone: "ET (UTC-5)",
    },
    summary: {
      signalsReceived: signals.length || "Unavailable",
      winRate: hasSample ? pct(winRate) : "LOW SAMPLE",
      roi: hasSample && roi !== null ? `${roi >= 0 ? "+" : ""}${(roi * 100).toFixed(1)}%` : "LOW SAMPLE",
      accuracy: hasSample ? pct(accuracy) : "LOW SAMPLE",
      sampleSize: decisions,
    },
    signals,
    products,
    recommendations,
    activity: signalActivity,
    unreadCount: notifications.length,
  });
}
