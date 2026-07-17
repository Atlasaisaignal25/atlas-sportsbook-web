import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { getActiveRewardAccess } from "@/app/lib/challenges";
import {
  atlasSupportedSports,
  getEntitlement,
  normalizeAtlasSport,
  normalizeStoredPlan,
  type AtlasSport,
  type CommercialPlan,
} from "@/app/lib/product-access";
import { canViewMyAtlasProduct } from "@/app/lib/my-atlas-access";

type SubscriptionPlan = CommercialPlan;

function normalizeSubscriptionSport(value: unknown) {
  return normalizeAtlasSport(value);
}

function getNewYorkDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user?.email?.trim().toLowerCase();
  const isAdmin = Boolean(adminEmail && userEmail && adminEmail === userEmail);

  if (isAdmin) {
    const entitlement = getEntitlement({ admin: true });
    return NextResponse.json({
      authenticated: Boolean(user),
      email: user?.email ?? null,
      plan: "admin",
      sports: entitlement.sports,
      unlocks: {
        topPlay: true,
        topSignals: [...atlasSupportedSports],
      },
      entitlement,
      myAtlasAccess: buildMyAtlasAccessPolicy("admin", entitlement.sports, [...atlasSupportedSports]),
    });
  }

  let plan: SubscriptionPlan = "free";
  let subscriptionSport: AtlasSport | null = null;
  let unlocks = {
    topPlay: false,
    topSignals: [] as string[],
  };

  if (user) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: subscription } = await getSupabaseAdmin()
      .from("subscriptions")
      .select("plan_code,status,sport")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    plan = normalizeStoredPlan(subscription?.plan_code);
    subscriptionSport = normalizeSubscriptionSport(subscription?.sport);

    if (plan === "free") {
      try {
        const rewardAccess = await getActiveRewardAccess(user.id);

        if (rewardAccess) {
          plan = normalizeStoredPlan(rewardAccess.plan);
          subscriptionSport =
            rewardAccess.plan === "premium" ? normalizeSubscriptionSport(rewardAccess.sports[0]) : null;
        }
      } catch (error) {
        console.error("challenge reward access error", error);
      }
    }

    const { data: purchases, error: purchasesError } = await supabaseAdmin
      .from("product_purchases")
      .select("product_code,sport,status,access_date")
      .eq("user_id", user.id)
      .eq("access_date", getNewYorkDate())
      .eq("status", "paid");

    if (!purchasesError && Array.isArray(purchases)) {
      unlocks = {
        topPlay: purchases.some((purchase) => purchase.product_code === "top_play"),
        topSignals: purchases
          .filter((purchase) => String(purchase.product_code).startsWith("top_signal_"))
          .map((purchase) => String(purchase.sport ?? "").toUpperCase())
          .filter(Boolean),
      };
    }
  }

  const entitlement = getEntitlement({
    planCode: plan,
    selectedSport: subscriptionSport,
    topSignalSports: unlocks.topSignals,
  });

  return NextResponse.json({
    authenticated: Boolean(user),
    email: user?.email ?? null,
    plan,
    sports: entitlement.sports,
    unlocks,
    entitlement,
    myAtlasAccess: buildMyAtlasAccessPolicy(plan, entitlement.sports, unlocks.topSignals),
  });
}

function buildMyAtlasAccessPolicy(plan: SubscriptionPlan, sports: readonly AtlasSport[], topSignalSports: readonly string[]) {
  return Object.fromEntries(
    atlasSupportedSports.map((sport) => [
      sport,
      {
        signalsDetected: canViewMyAtlasProduct({ plan, sport, userSports: sports, product: "signals_detected" }),
        exclusiveTop3: canViewMyAtlasProduct({ plan, sport, userSports: sports, product: "exclusive_top3" }),
        premiumTop3: canViewMyAtlasProduct({ plan, sport, userSports: sports, product: "premium_top3" }),
        topSignal: canViewMyAtlasProduct({ plan, sport, userSports: sports, topSignalSports, product: "top_signal" }),
        analytics: canViewMyAtlasProduct({ plan, sport, userSports: sports, product: "analytics" }),
        history: canViewMyAtlasProduct({ plan, sport, userSports: sports, product: "history" }),
      },
    ]),
  );
}
