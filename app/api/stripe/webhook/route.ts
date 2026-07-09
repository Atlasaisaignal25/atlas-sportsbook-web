import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  getStripe,
  stripePriceToOneTimeProduct,
  stripePriceToPlan,
  topSignalProductSports,
  type OneTimeProductCode,
  type TopSignalProductCode,
} from "@/app/lib/stripe";

export const runtime = "nodejs";

function unixToIso(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
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

function normalizeSubscriptionSport(value: unknown) {
  const sport = String(value ?? "").trim().toUpperCase();

  if (
    sport === "MLB" ||
    sport === "NBA" ||
    sport === "NHL" ||
    sport === "SOCCER" ||
    sport === "NFL"
  ) {
    return sport;
  }

  return "MLB";
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const subscriptionAny = subscription as any;
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? "";
  const planCode =
    stripePriceToPlan[priceId] ??
    subscription.metadata.plan_code;
  const userId = subscription.metadata.user_id;
  const sport = normalizeSubscriptionSport(subscription.metadata.sport);

  if (
    !userId ||
    (planCode !== "exclusive" && planCode !== "premium" && planCode !== "elite")
  ) {
    return;
  }

  const row = {
    user_id: userId,
    plan_code: planCode,
    sport,
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

async function upsertProductPurchase(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id ?? session.client_reference_id;
  const sessionProductCode = session.metadata?.product_code as OneTimeProductCode | undefined;
  const lineItems = await getStripe().checkout.sessions.listLineItems(session.id, {
    limit: 1,
  });
  const priceId = lineItems.data[0]?.price?.id ?? "";
  const productCode = sessionProductCode ?? stripePriceToOneTimeProduct[priceId];

  if (
    !userId ||
    (productCode !== "top_play" &&
      productCode !== "top_signal_mlb" &&
      productCode !== "top_signal_nba" &&
      productCode !== "top_signal_nhl" &&
      productCode !== "top_signal_soccer" &&
      productCode !== "top_signal_nfl")
  ) {
    return;
  }

  const sport =
    productCode === "top_play"
      ? null
      : topSignalProductSports[productCode as TopSignalProductCode];

  const row = {
    user_id: userId,
    product_code: productCode,
    sport,
    status: session.payment_status === "paid" ? "paid" : session.payment_status,
    stripe_customer_id: session.customer ? String(session.customer) : null,
    stripe_payment_intent_id: session.payment_intent
      ? String(session.payment_intent)
      : null,
    stripe_checkout_session_id: session.id,
    stripe_price_id: priceId,
    access_date:
      session.metadata?.access_date &&
      /^\d{4}-\d{2}-\d{2}$/.test(session.metadata.access_date)
        ? session.metadata.access_date
        : getNewYorkDate(),
    amount_total: session.amount_total,
    currency: session.currency,
    updated_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseAdmin()
    .from("product_purchases")
    .upsert(
      {
        id: randomUUID(),
        ...row,
        created_at: new Date().toISOString(),
      },
      { onConflict: "stripe_checkout_session_id", ignoreDuplicates: false }
    );

  if (error) throw error;
}

async function expireProductPurchase(session: Stripe.Checkout.Session) {
  const { error } = await getSupabaseAdmin()
    .from("product_purchases")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_checkout_session_id", session.id)
    .eq("status", "pending");

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
      } else if (session.mode === "payment") {
        await upsertProductPurchase(session);
      }
    }

    if (event.type === "checkout.session.expired") {
      await expireProductPurchase(event.data.object as Stripe.Checkout.Session);
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
