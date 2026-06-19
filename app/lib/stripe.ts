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

export const stripePriceToPlan: Record<string, "exclusive" | "premium" | "elite"> = {
  [process.env.STRIPE_PRICE_EXCLUSIVE ?? ""]: "exclusive",
  [process.env.STRIPE_PRICE_PREMIUM ?? ""]: "premium",
  [process.env.STRIPE_PRICE_ELITE ?? ""]: "elite",
};

export const planToStripePrice: Record<"exclusive" | "premium" | "elite", string | undefined> = {
  exclusive: process.env.STRIPE_PRICE_EXCLUSIVE,
  premium: process.env.STRIPE_PRICE_PREMIUM,
  elite: process.env.STRIPE_PRICE_ELITE,
};

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://atlas-sportsbook-web.vercel.app"
  );
}
