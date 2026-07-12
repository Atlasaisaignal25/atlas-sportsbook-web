import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  activeSubscriptionStatuses,
  getEntitlement,
  isNewProductModelEnabled,
  isSignalDeliveryV2Enabled,
  normalizeAtlasSport,
  planDisplayName,
  presentationStatus,
  productCodeFromPlan,
  productCopy,
  type AtlasSport,
  type ProductCode,
} from "@/app/lib/product-access";

export const dynamic = "force-dynamic";

type SignalStatus = "DETECTED" | "UNDER REVIEW" | "CONFIRMED" | "DOWNGRADED" | "WITHDRAWN" | "READY";

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
  return `${planDisplayName(plan === "elite" ? "unlimited" : (String(plan ?? "free").toLowerCase() as any))} MEMBER`;
}

function statusLabel(status: unknown, product: ProductCode): SignalStatus {
  if (product === "top_signal_by_sport") return "READY";
  const normalized = String(status ?? "").toUpperCase();
  if (normalized === "CONFIRMED") return "CONFIRMED";
  if (normalized === "DOWNGRADED") return "DOWNGRADED";
  if (normalized === "REMOVED") return "WITHDRAWN";
  if (normalized === "PENDING") return "DETECTED";
  return "UNDER REVIEW";
}

function productLabel(code: ProductCode) {
  return productCopy[code]?.name ?? code;
}

function recommendationCatalog() {
  return [
    {
      code: "top_signal_by_sport",
      title: "Today's Top Signal",
      description: productCopy.top_signal_by_sport.description,
      cta: "Unlock",
      tone: "purple",
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

function metadataValue(row: any, key: string) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return metadata[key];
}

function detectedScore(row: any) {
  return Number(metadataValue(row, "detectedAtlasProbability") ?? 0) * 1000 + Number(metadataValue(row, "detectedEdge") ?? 0);
}

function mapDetectedSignal(row: any, params: { rank?: number; premium: boolean }) {
  const selection = params.premium
    ? String(metadataValue(row, "detectedPick") ?? "Signal Detected")
    : "Signal Detected";
  const status = presentationStatus("UNDER REVIEW", "exclusive_detected_top3");

  return {
    id: `detected-${row.id}`,
    sport: row.sport ?? "MLB",
    product: params.premium ? "EXCLUSIVE PACK" : "FREE",
    productCode: params.premium ? "exclusive_detected_top3" : "signals_detected",
    rank: params.rank ?? null,
    selection,
    event: `${row.away_team} @ ${row.home_team}`,
    opponent: row.away_team,
    team: row.home_team,
    status: params.premium ? status.label : "DETECTED",
    statusDescription: params.premium ? status.description : "Atlas detected a Signal.",
    gameTime: formatTime(row.start_time),
    publishedAt: formatTime(row.updated_at ?? row.morning_scan_at),
  };
}

function mapOfficialSignal(row: any, product: ProductCode) {
  const status = presentationStatus(row.status, product);
  return {
    id: `${product}-${row.id}`,
    sport: row.sport ?? "MLB",
    product: productLabel(product),
    productCode: product,
    rank: row.rank ?? null,
    selection: `${row.pick}${row.odds ? ` ${money(row.odds)}` : ""}`,
    event: `${row.away_team} @ ${row.home_team}`,
    opponent: row.direction === "HOME" ? row.away_team : row.home_team,
    team: row.direction === "HOME" ? row.home_team : row.away_team,
    status: status.label,
    statusDescription: status.description,
    gameTime: formatTime(row.start_time),
    publishedAt: formatTime(row.published_at ?? row.updated_at),
  };
}

function sectionProgress(count: number, max: number, label: string) {
  return `${Math.min(count, max)} of ${max} ${label} available`;
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
  const [subscriptions, purchases, detectedSignals, officialPicks, officialHistory, notifications] = await Promise.all([
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
        .from("atlas_core_mlb_signals")
        .select("id,game_id,date,away_team,home_team,start_time,sport,stage,morning_scan_at,metadata,updated_at")
        .eq("sport", "MLB")
        .eq("date", date)
        .eq("stage", "SIGNALS_DETECTED")
        .order("start_time", { ascending: true }),
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
    (activeSubscriptionStatuses as readonly string[]).includes(String(row.status ?? "").toLowerCase()),
  ) ?? null;
  const topSignalSports = purchases
    .filter((purchase) => purchase.status === "paid" && String(purchase.product_code).startsWith("top_signal_"))
    .map((purchase) => normalizeAtlasSport(purchase.sport))
    .filter((sport): sport is AtlasSport => Boolean(sport));
  const entitlement = getEntitlement({
    planCode: activeSubscription?.plan_code,
    selectedSport: activeSubscription?.sport,
    topSignalSports,
  });
  const owned = new Set<ProductCode>();
  const subscriptionProduct = productCodeFromPlan(entitlement.plan);
  if (subscriptionProduct) owned.add(subscriptionProduct);
  for (const purchase of purchases) {
    if (purchase.status !== "paid") continue;
    if (String(purchase.product_code).startsWith("top_signal_")) owned.add("top_signal_by_sport");
  }

  const rankedDetected = [...detectedSignals].sort((a, b) => detectedScore(b) - detectedScore(a));
  const productSections: any[] = [];

  if (entitlement.plan === "free") {
    const rows = detectedSignals.map((row) => mapDetectedSignal(row, { premium: false }));
    productSections.push({
      code: "signals_detected",
      title: "SIGNALS DETECTED",
      sport: "ALL",
      progress: `${rows.length} Signals Detected`,
      signals: rows,
    });
  }

  if (entitlement.canViewExclusiveTop3) {
    const rows = rankedDetected.slice(0, 3).map((row, index) => mapDetectedSignal(row, { premium: true, rank: index + 1 }));
    productSections.push({
      code: "exclusive_detected_top3",
      title: "EXCLUSIVE SIGNALS",
      sport: "ALL",
      progress: sectionProgress(rows.length, 3, "Signals"),
      signals: rows,
      emptyText: "Atlas is still validating today's Signals.",
    });
  }

  if (entitlement.canViewOfficialTop5) {
    const sports = entitlement.canViewAllSports ? entitlement.sports : entitlement.sports.slice(0, 1);
    for (const sport of sports) {
      if (sport !== "MLB") continue;
      const rows = officialPicks
        .filter((row) => !row.is_top_signal && Number(row.rank) <= 5)
        .slice(0, 5)
        .map((row) => mapOfficialSignal(row, entitlement.canViewAllSports ? "atlas_unlimited_all_sports" : "premium_sport_top5"));
      productSections.push({
        code: entitlement.canViewAllSports ? "atlas_unlimited_all_sports" : "premium_sport_top5",
        title: entitlement.canViewAllSports ? `${sport} OFFICIAL SIGNALS` : `PREMIUM — ${sport}`,
        sport,
        progress: sectionProgress(rows.length, 5, "Official Signals"),
        signals: rows,
        emptyText: "Atlas is still validating today's Official Signals.",
      });
    }
  }

  if (entitlement.topSignalSports.includes("MLB")) {
    const topSignal = officialPicks.find((row) => row.is_top_signal);
    productSections.push({
      code: "top_signal_by_sport",
      title: "TOP SIGNAL — MLB",
      sport: "MLB",
      progress: topSignal ? "READY" : "Not published yet",
      signals: topSignal ? [mapOfficialSignal(topSignal, "top_signal_by_sport")] : [],
      emptyText: "Atlas has not published a Top Signal for this sport today.",
    });
  }

  const signals = productSections.flatMap((section) => section.signals);

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
      code: "top_signal_by_sport",
      name: "Top Signal",
      status: owned.has("top_signal_by_sport") ? "ACTIVE" : "INACTIVE",
      detail: owned.has("top_signal_by_sport") ? `Access for ${date}` : "Not subscribed",
      expandable: true,
    },
    {
      code: "premium_sport_top5",
      name: "Premium Pack",
      status: entitlement.plan === "premium" ? "ACTIVE" : "INACTIVE",
      detail: entitlement.plan === "premium" ? `${entitlement.selectedSport ?? "MLB"} • ${activeUntilText(activeSubscription)}` : "Not subscribed",
      expandable: true,
    },
    {
      code: "exclusive_detected_top3",
      name: "Exclusive Pack",
      status: entitlement.plan === "exclusive" ? productStatus(activeSubscription) : "INACTIVE",
      detail: entitlement.plan === "exclusive" ? activeUntilText(activeSubscription) : "Not subscribed",
      expandable: true,
    },
    {
      code: "atlas_unlimited_all_sports",
      name: "Atlas Unlimited",
      status: entitlement.plan === "unlimited" ? "ACTIVE" : "INACTIVE",
      detail: entitlement.plan === "unlimited" ? activeUntilText(activeSubscription) : "Not subscribed",
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
    productSections,
    products,
    recommendations,
    activity: signalActivity,
    unreadCount: notifications.length,
    entitlement,
    featureFlags: {
      atlasNewProductModel: isNewProductModelEnabled(),
      atlasSignalDeliveryV2: isSignalDeliveryV2Enabled(),
    },
  });
}
