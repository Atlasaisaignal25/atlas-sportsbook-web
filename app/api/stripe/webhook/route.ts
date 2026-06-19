import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { getStripe, stripePriceToPlan } from "@/app/lib/stripe";

export const runtime = "nodejs";

function unixToIso(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const subscriptionAny = subscription as any;
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? "";
  const planCode =
    stripePriceToPlan[priceId] ??
    subscription.metadata.plan_code;
  const userId = subscription.metadata.user_id;

  if (
    !userId ||
    (planCode !== "exclusive" && planCode !== "premium" && planCode !== "elite")
  ) {
    return;
  }

  const row = {
    user_id: userId,
    plan_code: planCode,
    status: subscription.status,
    stripe_customer_id: String(subscription.customer),
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    current_period_start: unixToIso(subscriptionAny.current_period_start),
    current_period_end: unixToIso(subscriptionAny.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const supabaseAdmin = getSupabaseAdmin();

  const { data: existing, error: findError } = await supabaseAdmin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (findError) throw findError;

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(row)
      .eq("id", existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from("subscriptions").insert([
    {
      id: randomUUID(),
      ...row,
      created_at: new Date().toISOString(),
    },
  ]);

  if (error) throw error;
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { success: false, error: "Missing Stripe webhook configuration" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const body = await req.text();
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Invalid signature",
      },
      { status: 400 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.subscription) {
        const subscription = await getStripe().subscriptions.retrieve(
          String(session.subscription)
        );
        await upsertSubscription(subscription);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await upsertSubscription(event.data.object as Stripe.Subscription);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceAny = invoice as any;

      if (invoiceAny.subscription) {
        const subscription = await getStripe().subscriptions.retrieve(
          String(invoiceAny.subscription)
        );
        await upsertSubscription(subscription);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Webhook error",
      },
      { status: 500 }
    );
  }
}
