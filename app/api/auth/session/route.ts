import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

type SubscriptionPlan = "free" | "exclusive" | "premium" | "elite" | "admin";

function getSportsForPlan(plan: SubscriptionPlan) {
  if (plan === "admin" || plan === "elite") {
    return ["MLB", "NBA", "NHL", "SOCCER"];
  }

  if (plan === "exclusive" || plan === "premium") {
    return ["MLB", "NBA", "NHL", "SOCCER"];
  }

  return [];
}

function normalizePlan(plan: string | null | undefined): SubscriptionPlan {
  if (plan === "exclusive" || plan === "premium" || plan === "elite") {
    return plan;
  }

  return "free";
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
    });
  }

  let plan: SubscriptionPlan = "free";

  if (user) {
    const { data: subscription } = await getSupabaseAdmin()
      .from("subscriptions")
      .select("plan_code,status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    plan = normalizePlan(subscription?.plan_code);
  }

  return NextResponse.json({
    authenticated: Boolean(user),
    email: user?.email ?? null,
    plan,
    sports: getSportsForPlan(plan),
  });
}
