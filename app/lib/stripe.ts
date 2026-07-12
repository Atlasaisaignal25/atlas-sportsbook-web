import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2026-05-27.dahlia",
  });

  return stripeClient;
}

export type SubscriptionPlanCode = "exclusive" | "premium" | "elite" | "unlimited";
export type TopSignalProductCode =
  | "top_signal_mlb"
  | "top_signal_nba"
  | "top_signal_nhl"
  | "top_signal_soccer"
  | "top_signal_nfl";
export type OneTimeProductCode = TopSignalProductCode | "top_play";
export type CheckoutProductCode = SubscriptionPlanCode | OneTimeProductCode;

export const stripePriceToPlan: Record<string, SubscriptionPlanCode> = {
  [process.env.STRIPE_PRICE_EXCLUSIVE ?? ""]: "exclusive",
  [process.env.STRIPE_PRICE_PREMIUM ?? ""]: "premium",
  [process.env.STRIPE_PRICE_ELITE ?? ""]: "unlimited",
  [process.env.STRIPE_PRICE_UNLIMITED ?? ""]: "unlimited",
};

export const planToStripePrice: Record<SubscriptionPlanCode, string | undefined> = {
  exclusive: process.env.STRIPE_PRICE_EXCLUSIVE,
  premium: process.env.STRIPE_PRICE_PREMIUM,
  elite: process.env.STRIPE_PRICE_ELITE,
  unlimited: process.env.STRIPE_PRICE_UNLIMITED ?? process.env.STRIPE_PRICE_ELITE,
};

export const oneTimeProductToStripePrice: Record<OneTimeProductCode, string | undefined> = {
  top_signal_mlb: process.env.STRIPE_PRICE_TOP_SIGNAL_MLB,
  top_signal_nba: process.env.STRIPE_PRICE_TOP_SIGNAL_NBA,
  top_signal_nhl: process.env.STRIPE_PRICE_TOP_SIGNAL_NHL,
  top_signal_soccer: process.env.STRIPE_PRICE_TOP_SIGNAL_SOCCER,
  top_signal_nfl: process.env.STRIPE_PRICE_TOP_SIGNAL_NFL,
  top_play: process.env.STRIPE_PRICE_TOP_PLAY,
};

export const stripePriceToOneTimeProduct: Record<string, OneTimeProductCode> = {
  [process.env.STRIPE_PRICE_TOP_SIGNAL_MLB ?? ""]: "top_signal_mlb",
  [process.env.STRIPE_PRICE_TOP_SIGNAL_NBA ?? ""]: "top_signal_nba",
  [process.env.STRIPE_PRICE_TOP_SIGNAL_NHL ?? ""]: "top_signal_nhl",
  [process.env.STRIPE_PRICE_TOP_SIGNAL_SOCCER ?? ""]: "top_signal_soccer",
  [process.env.STRIPE_PRICE_TOP_SIGNAL_NFL ?? ""]: "top_signal_nfl",
  [process.env.STRIPE_PRICE_TOP_PLAY ?? ""]: "top_play",
};

export const topSignalProductSports: Record<TopSignalProductCode, string> = {
  top_signal_mlb: "MLB",
  top_signal_nba: "NBA",
  top_signal_nhl: "NHL",
  top_signal_soccer: "SOCCER",
  top_signal_nfl: "NFL",
};

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://atlas-sportsbook-web.vercel.app"
  );
}
