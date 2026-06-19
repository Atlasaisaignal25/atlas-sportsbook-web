import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { getSiteUrl, getStripe, planToStripePrice } from "@/app/lib/stripe";

type CheckoutPlan = "exclusive" | "premium" | "elite";

const validPlans: CheckoutPlan[] = ["exclusive", "premium", "elite"];

export async function POST(req: Request) {
  try {
    const { plan } = (await req.json()) as { plan?: CheckoutPlan };

    if (!plan || !validPlans.includes(plan)) {
      return NextResponse.json(
        { success: false, error: "Invalid plan" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const priceId = planToStripePrice[plan];

    if (!priceId) {
      return NextResponse.json(
        { success: false, error: "Missing Stripe price configuration" },
        { status: 500 }
      );
    }

    const { data: existingSubscription } = await getSupabaseAdmin()
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const siteUrl = getSiteUrl();
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: existingSubscription?.stripe_customer_id ?? undefined,
      customer_email: existingSubscription?.stripe_customer_id
        ? undefined
        : user.email ?? undefined,
      client_reference_id: user.id,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        plan_code: plan,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_code: plan,
        },
      },
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancel`,
    });

    return NextResponse.json({ success: true, url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 }
    );
  }
}
