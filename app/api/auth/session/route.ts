import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { getActiveRewardAccess } from "@/app/lib/challenges";

type SubscriptionPlan = "free" | "exclusive" | "premium" | "elite" | "admin";
const validSubscriptionSports = ["MLB", "NBA", "NHL", "SOCCER", "NFL"];

function normalizeSubscriptionSport(value: unknown) {
  const sport = String(value ?? "").trim().toUpperCase();
  return validSubscriptionSports.includes(sport) ? sport : null;
}

function getSportsForPlan(plan: SubscriptionPlan, selectedSport?: string | null) {
  if (plan === "admin" || plan === "elite") {
    return ["MLB", "NBA", "NHL", "SOCCER", "NFL"];
  }

  if (plan === "exclusive" || plan === "premium") {
    const sport = normalizeSubscriptionSport(selectedSport);
    return sport ? [sport] : [];
  }

  return [];
}

function normalizePlan(plan: string | null | undefined): SubscriptionPlan {
  if (plan === "exclusive" || plan === "premium" || plan === "elite") {
    return plan;
  }

  return "free";
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
    return NextResponse.json({
      authenticated: Boolean(user),
      email: user?.email ?? null,
      plan: "admin",
      sports: getSportsForPlan("admin"),
      unlocks: {
        topPlay: true,
        topSignals: ["MLB", "NBA", "NHL", "SOCCER", "NFL"],
      },
    });
  }

  let plan: SubscriptionPlan = "free";
  let subscriptionSport: string | null = null;
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

    plan = normalizePlan(subscription?.plan_code);
    subscriptionSport = normalizeSubscriptionSport(subscription?.sport);

    if (plan === "free") {
      try {
        const rewardAccess = await getActiveRewardAccess(user.id);

        if (rewardAccess) {
          plan = rewardAccess.plan;
          subscriptionSport =
            rewardAccess.plan === "premium" ? rewardAccess.sports[0] ?? null : null;
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

  return NextResponse.json({
    authenticated: Boolean(user),
    email: user?.email ?? null,
    plan,
    sports: getSportsForPlan(plan, subscriptionSport),
    unlocks,
  });
}
