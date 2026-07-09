import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  buildPrecisionPublicResponse,
  getPrecisionPurchaseAccess,
  getPrecisionSnapshot,
} from "@/app/lib/precision-engine/access";
import { todayET } from "@/app/lib/precision-engine/persistence";
import {
  getSiteUrl,
  getStripe,
  oneTimeProductToStripePrice,
  planToStripePrice,
  topSignalProductSports,
  type CheckoutProductCode,
  type OneTimeProductCode,
  type SubscriptionPlanCode,
  type TopSignalProductCode,
} from "@/app/lib/stripe";

type CheckoutPlan = SubscriptionPlanCode;

const validPlans: CheckoutPlan[] = ["exclusive", "premium", "elite"];
const validProducts: OneTimeProductCode[] = [
  "top_signal_mlb",
  "top_signal_nba",
  "top_signal_nhl",
  "top_signal_soccer",
  "top_signal_nfl",
  "top_play",
];
const validSubscriptionSports = ["MLB", "NBA", "NHL", "SOCCER", "NFL"] as const;
type SubscriptionSport = (typeof validSubscriptionSports)[number];
type PrecisionCheckoutContext =
  | {
      productType: "top_play";
      sport: "global";
      productName: "Top Play";
      alreadyOwnMessage: "You already own today's Top Play.";
      noPlayMessage: "No Top Play Today.";
      closedMessage: "Today's Top Play is closed.";
      unavailableMessage: "Top Play is not available yet.";
    }
  | {
      productType: "top_signal";
      sport: "mlb" | "nba" | "nhl" | "soccer" | "nfl";
      productName: "Top Signal";
      alreadyOwnMessage: "You already own today's Top Signal.";
      noPlayMessage: "No Top Signal Today.";
      closedMessage: "Today's Top Signal is closed.";
      unavailableMessage: "This Top Signal is not available yet.";
    };

type PrecisionValidationSuccess = {
  ok: true;
  context: PrecisionCheckoutContext;
};

type PrecisionValidationFailure = {
  ok: false;
  status: number;
  error: string;
};

function isCheckoutPlan(value: unknown): value is CheckoutPlan {
  return typeof value === "string" && validPlans.includes(value as CheckoutPlan);
}

function isOneTimeProduct(value: unknown): value is OneTimeProductCode {
  return typeof value === "string" && validProducts.includes(value as OneTimeProductCode);
}

function normalizeSubscriptionSport(value: unknown): SubscriptionSport {
  const sport = String(value ?? "").trim().toUpperCase();
  return validSubscriptionSports.includes(sport as SubscriptionSport)
    ? (sport as SubscriptionSport)
    : "MLB";
}

function normalizeAccessDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : todayET();
}

function precisionContextForProduct(
  product: OneTimeProductCode
): PrecisionCheckoutContext {
  if (product === "top_play") {
    return {
      productType: "top_play",
      sport: "global",
      productName: "Top Play",
      alreadyOwnMessage: "You already own today's Top Play.",
      noPlayMessage: "No Top Play Today.",
      closedMessage: "Today's Top Play is closed.",
      unavailableMessage: "Top Play is not available yet.",
    };
  }

  const sport = topSignalProductSports[product as TopSignalProductCode].toLowerCase() as
    | "mlb"
    | "nba"
    | "nhl"
    | "soccer"
    | "nfl";

  return {
    productType: "top_signal",
    sport,
    productName: "Top Signal",
    alreadyOwnMessage: "You already own today's Top Signal.",
    noPlayMessage: "No Top Signal Today.",
    closedMessage: "Today's Top Signal is closed.",
    unavailableMessage: "This Top Signal is not available yet.",
  };
}

async function validatePrecisionCheckout(params: {
  product: OneTimeProductCode;
  userId: string;
  userEmail?: string | null;
  date: string;
}): Promise<PrecisionValidationSuccess | PrecisionValidationFailure> {
  const context = precisionContextForProduct(params.product);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = params.userEmail?.trim().toLowerCase();
  const admin = Boolean(adminEmail && userEmail && adminEmail === userEmail);

  if (admin) {
    return {
      ok: false as const,
      status: 409,
      error: `You already have access to today's ${context.productName}.`,
    };
  }

  const purchased = await getPrecisionPurchaseAccess({
    userId: params.userId,
    productType: context.productType,
    sport: context.sport,
    date: params.date,
  });

  if (purchased) {
    return {
      ok: false as const,
      status: 409,
      error: context.alreadyOwnMessage,
    };
  }

  const snapshot = await getPrecisionSnapshot({
    productType: context.productType,
    sport: context.sport,
    date: params.date,
  });

  if (!snapshot) {
    return {
      ok: false as const,
      status: 409,
      error: context.unavailableMessage,
    };
  }

  const publicResponse = buildPrecisionPublicResponse({
    productType: context.productType,
    sport: context.sport,
    date: params.date,
    snapshot,
    access: {
      userId: params.userId,
      admin: false,
      purchased: false,
    },
  });

  if (publicResponse.status === "no_play") {
    return {
      ok: false as const,
      status: 409,
      error: context.noPlayMessage,
    };
  }

  if (
    publicResponse.status === "locked" ||
    (publicResponse.minutesToKickoff !== null &&
      publicResponse.minutesToKickoff !== undefined &&
      publicResponse.minutesToKickoff <= 0)
  ) {
    return {
      ok: false as const,
      status: 410,
      error: context.closedMessage,
    };
  }

  if (
    publicResponse.status !== "available_now" ||
    publicResponse.availableForPurchase !== true ||
    publicResponse.canPurchase !== true
  ) {
    return {
      ok: false as const,
      status: 409,
      error: context.unavailableMessage,
    };
  }

  return { ok: true as const, context };
}

function deterministicPurchaseId(params: {
  userId: string;
  product: OneTimeProductCode;
  date: string;
}) {
  const hash = createHash("sha256")
    .update(`${params.userId}:${params.product}:${params.date}`)
    .digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

async function getExistingDailyPurchase(params: {
  userId: string;
  product: OneTimeProductCode;
  date: string;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("product_purchases")
    .select("id,status,stripe_checkout_session_id")
    .eq("user_id", params.userId)
    .eq("product_code", params.product)
    .eq("access_date", params.date)
    .in("status", ["paid", "pending"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] ?? null;
}

async function resolveExistingPurchase(params: {
  userId: string;
  product: OneTimeProductCode;
  date: string;
  alreadyOwnMessage: string;
}) {
  const existing = await getExistingDailyPurchase(params);

  if (!existing) return null;

  if (existing.status === "paid") {
    return {
      handled: true as const,
      response: NextResponse.json(
        { success: false, error: params.alreadyOwnMessage },
        { status: 409 }
      ),
    };
  }

  if (existing.stripe_checkout_session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(
        existing.stripe_checkout_session_id
      );

      if (session.status === "open" && session.url) {
        return {
          handled: true as const,
          response: NextResponse.json({ success: true, url: session.url }),
        };
      }

      if (session.status === "complete" || session.payment_status === "paid") {
        return {
          handled: true as const,
          response: NextResponse.json(
            { success: false, error: params.alreadyOwnMessage },
            { status: 409 }
          ),
        };
      }
    } catch {
      // If Stripe cannot retrieve an old pending session, expire it locally and allow a fresh checkout.
    }
  }

  await getSupabaseAdmin()
    .from("product_purchases")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", existing.id);

  return null;
}

async function savePendingPrecisionPurchase(params: {
  userId: string;
  product: OneTimeProductCode;
  sport: string | null;
  date: string;
  sessionId: string;
  priceId: string;
  amountTotal: number | null;
  currency: string | null;
}) {
  const now = new Date().toISOString();
  const id = deterministicPurchaseId({
    userId: params.userId,
    product: params.product,
    date: params.date,
  });

  const { error } = await getSupabaseAdmin()
    .from("product_purchases")
    .upsert(
      {
        id,
        user_id: params.userId,
        product_code: params.product,
        sport: params.sport,
        status: "pending",
        stripe_checkout_session_id: params.sessionId,
        stripe_price_id: params.priceId,
        access_date: params.date,
        amount_total: params.amountTotal,
        currency: params.currency,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "id", ignoreDuplicates: false }
    );

  if (!error) return { ok: true as const };

  if (error.code === "23505") {
    return { ok: false as const, duplicate: true as const };
  }

  throw error;
}

export async function POST(req: Request) {
  try {
    const { plan, product, sport, date } = (await req.json()) as {
      plan?: CheckoutPlan;
      product?: CheckoutProductCode;
      sport?: string;
      date?: string;
    };
    const checkoutProduct = product ?? plan;

    if (!isCheckoutPlan(checkoutProduct) && !isOneTimeProduct(checkoutProduct)) {
      return NextResponse.json(
        { success: false, error: "Invalid checkout product" },
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

    const isSubscription = isCheckoutPlan(checkoutProduct);
    const priceId = isSubscription
      ? planToStripePrice[checkoutProduct]
      : oneTimeProductToStripePrice[checkoutProduct];

    if (!priceId) {
      return NextResponse.json(
        { success: false, error: "Checkout is unavailable for this product." },
        { status: 500 }
      );
    }

    const { data: existingSubscription } = await getSupabaseAdmin()
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const siteUrl = getSiteUrl();
    const subscriptionSport = normalizeSubscriptionSport(sport);
    const precisionAccessDate = normalizeAccessDate(date);
    const accessDate = !isSubscription ? precisionAccessDate : undefined;
    let precisionContext: PrecisionCheckoutContext | null = null;

    if (!isSubscription) {
      const validation = await validatePrecisionCheckout({
        product: checkoutProduct,
        userId: user.id,
        userEmail: user.email,
        date: precisionAccessDate,
      });

      if (!validation.ok) {
        return NextResponse.json(
          { success: false, error: validation.error },
          { status: validation.status }
        );
      }

      precisionContext = validation.context;

      const existingPurchase = await resolveExistingPurchase({
        userId: user.id,
        product: checkoutProduct,
        date: precisionAccessDate,
        alreadyOwnMessage: validation.context.alreadyOwnMessage,
      });

      if (existingPurchase?.handled) {
        return existingPurchase.response;
      }
    }

    const metadata = {
      user_id: user.id,
      ...(isSubscription
        ? {
            plan_code: checkoutProduct,
            product_type: "subscription",
            sport: subscriptionSport,
          }
        : {
            product_code: checkoutProduct,
            product_type: checkoutProduct === "top_play" ? "top_play" : "top_signal",
            access_date: precisionAccessDate,
            sport:
              checkoutProduct === "top_play"
                ? ""
                : topSignalProductSports[checkoutProduct as TopSignalProductCode],
          }),
    };

    const session = await getStripe().checkout.sessions.create({
      mode: isSubscription ? "subscription" : "payment",
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
      metadata,
      subscription_data: isSubscription
        ? {
            metadata,
          }
        : undefined,
      success_url: `${siteUrl}/?board=1&section=signals&view=live&sport=TOP&checkout=success`,
      cancel_url: `${siteUrl}/?board=1&section=signals&view=live&sport=TOP&checkout=cancel`,
    });

    if (!isSubscription && precisionContext) {
      const pending = await savePendingPrecisionPurchase({
        userId: user.id,
        product: checkoutProduct,
        sport:
          checkoutProduct === "top_play"
            ? null
            : topSignalProductSports[checkoutProduct as TopSignalProductCode],
        date: precisionAccessDate,
        sessionId: session.id,
        priceId,
        amountTotal: session.amount_total,
        currency: session.currency,
      });

      if (!pending.ok && pending.duplicate) {
        const existingPurchase = await resolveExistingPurchase({
          userId: user.id,
          product: checkoutProduct,
          date: precisionAccessDate,
          alreadyOwnMessage: precisionContext.alreadyOwnMessage,
        });

        if (existingPurchase?.handled) {
          return existingPurchase.response;
        }

        return NextResponse.json(
          { success: false, error: "Checkout is already being prepared. Try again." },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({ success: true, url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Checkout could not be started. Please try again.",
      },
      { status: 500 }
    );
  }
}
