import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
    intent?: string;
    plan?: string;
    product?: string;
    sport?: string;
    next?: string;
    mode?: string;
  }>;
};

type CheckoutProduct =
  | "exclusive"
  | "premium"
  | "unlimited"
  | "top_signal_mlb"
  | "top_signal_nba"
  | "top_signal_nhl"
  | "top_signal_soccer"
  | "top_signal_nfl"
  | "top_play";
type CheckoutSport = "MLB" | "NBA" | "NHL" | "SOCCER" | "NFL";

const checkoutPlans: Record<
  CheckoutProduct,
  {
    name: string;
    price: string;
    description: string;
  }
> = {
  top_signal_mlb: {
    name: "MLB Top Signal",
    price: "$24.99",
    description: "Unlock today's best MLB pick only.",
  },
  top_signal_nba: {
    name: "NBA Top Signal",
    price: "$24.99",
    description: "Unlock today's best NBA pick only.",
  },
  top_signal_nhl: {
    name: "NHL Top Signal",
    price: "$24.99",
    description: "Unlock today's best NHL pick only.",
  },
  top_signal_soccer: {
    name: "Soccer Top Signal",
    price: "$24.99",
    description: "Unlock today's best Soccer pick only.",
  },
  top_signal_nfl: {
    name: "NFL Top Signal",
    price: "$24.99",
    description: "Unlock today's best NFL pick only.",
  },
  top_play: {
    name: "Top Play",
    price: "$149.99",
    description: "Unlock the #1 Atlas pick across all available sports today.",
  },
  exclusive: {
    name: "Exclusive Pack",
    price: "$34.99 / month",
    description: "Choose one sport. Includes Top 3 Signals ordered by start time, not ranked. Does not include Top Signal or Top Play.",
  },
  premium: {
    name: "Premium Pack",
    price: "$59.99 / month",
    description: "Recommended. Choose one sport. Includes Ranked Top 3 Signals ordered by Atlas value priority. Does not include Top Signal or Top Play.",
  },
  unlimited: {
    name: "Atlas Unlimited",
    price: "$99.99 / month",
    description: "All available sports. Includes official ranked Signals for every available sport. Does not include Top Signal.",
  },
};

function getCheckoutProduct(value: FormDataEntryValue | string | undefined | null) {
  if (
    value === "exclusive" ||
    value === "premium" ||
    value === "unlimited" ||
    value === "top_signal_mlb" ||
    value === "top_signal_nba" ||
    value === "top_signal_nhl" ||
    value === "top_signal_soccer" ||
    value === "top_signal_nfl" ||
    value === "top_play"
  ) {
    return value;
  }

  if (value === "elite") {
    return "unlimited";
  }

  return null;
}

function getCheckoutSport(value: FormDataEntryValue | string | undefined | null) {
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

  return null;
}

function getCheckoutRedirect(product: CheckoutProduct, sport: CheckoutSport | null) {
  const search = new URLSearchParams({
    checkout_product: product,
  });

  if (sport) {
    search.set("sport", sport);
  }

  return `/?${search.toString()}`;
}

function getLoginUrl(product: CheckoutProduct | null, params?: Record<string, string>) {
  const search = new URLSearchParams();

  if (product) {
    search.set("intent", "subscribe");
    search.set("product", product);
  }

  Object.entries(params ?? {}).forEach(([key, value]) => {
    search.set(key, value);
  });

  const query = search.toString();
  return query ? `/login?${query}` : "/login";
}

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const product = getCheckoutProduct(formData.get("product"));
  const sport = getCheckoutSport(formData.get("sport"));
  const next = String(formData.get("next") ?? "");
  const authMode = String(formData.get("auth_mode") ?? "");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(
      getLoginUrl(product, {
        ...(authMode === "login" ? { mode: "login" } : {}),
        ...(sport ? { sport } : {}),
        error: error.message,
      })
    );
  }

  redirect(product ? getCheckoutRedirect(product, sport) : next === "plans" ? "/?plans=1" : "/");
}

async function signUp(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const product = getCheckoutProduct(formData.get("product"));
  const sport = getCheckoutSport(formData.get("sport"));
  const next = String(formData.get("next") ?? "");
  const authMode = String(formData.get("auth_mode") ?? "");
  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const nextPath = product ? getCheckoutRedirect(product, sport) : next === "plans" ? "/?plans=1" : "/";

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    },
  });

  if (error) {
    redirect(
      getLoginUrl(product, {
        ...(authMode === "free" ? { intent: "free" } : {}),
        ...(sport ? { sport } : {}),
        error: error.message,
      })
    );
  }

  redirect(
    getLoginUrl(product, {
      ...(authMode === "free" ? { intent: "free" } : {}),
      ...(sport ? { sport } : {}),
      message: product
        ? "Check your email to confirm your account, then checkout will continue."
        : "Check your email to confirm your account",
    })
  );
}

async function signOut() {
  "use server";

  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  redirect("/login?message=Signed%20out");
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const selectedPlan = getCheckoutProduct(params?.product ?? params?.plan);
  const selectedSport = getCheckoutSport(params?.sport);
  const subscriptionMode = params?.intent === "subscribe" && selectedPlan;
  const freeMode = params?.intent === "free";
  const loginOnlyMode = params?.mode === "login" && !subscriptionMode && !freeMode;
  const showLoginForm = subscriptionMode || loginOnlyMode || (!freeMode && !subscriptionMode);
  const showCreateForm = subscriptionMode || freeMode || (!loginOnlyMode && !subscriptionMode);
  const nextMode = params?.next === "plans" ? "plans" : "";
  const planDetails = selectedPlan ? checkoutPlans[selectedPlan] : null;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && selectedPlan) {
    redirect(getCheckoutRedirect(selectedPlan, selectedSport));
  }

  if (user && nextMode === "plans") {
    redirect("/?plans=1");
  }

  return (
    <main className="min-h-screen bg-[#050816] px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-300">
              ATLAS SIGNALS
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {subscriptionMode
                ? "Secure Checkout"
                : freeMode
                ? "Free Registration"
                : "Account Access"}
            </h1>
          </div>

          <Link
            href="/?section=signals&view=live&sport=TOP"
            className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:bg-cyan-400/15"
          >
            View Board
          </Link>
        </div>

        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] px-4 py-3 text-sm text-white/70">
          {subscriptionMode && planDetails ? (
            <>
              Create or access your account to continue to Stripe Checkout for{" "}
              <span className="font-bold text-cyan-200">{planDetails.name}</span>.
            </>
          ) : (
            <>
              {freeMode
                ? "Create your FREE account before entering Atlas Signals."
                : "Create a FREE account to access the sports app, live games and Signal Detected cards."}
            </>
          )}
        </div>

        {subscriptionMode && planDetails ? (
          <div className="rounded-xl border border-cyan-400/25 bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Selected Plan
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {planDetails.name}
                </h2>
                <p className="mt-1 text-sm font-bold text-cyan-200">
                  {planDetails.price}
                </p>
              </div>
              <span className="rounded-full bg-cyan-400 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-black">
                Checkout
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-5 text-white/60">
              {planDetails.description}
            </p>
          </div>
        ) : null}

        {params?.error ? (
          <div className="rounded-md border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {params.error}
          </div>
        ) : null}

        {params?.message ? (
          <div className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            {params.message}
          </div>
        ) : null}

        {user ? (
          <form
            action={signOut}
            className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Signed in
            </p>
            <p className="mt-2 truncate font-semibold">{user.email}</p>
            <button
              type="submit"
              className="mt-5 w-full rounded-md bg-white px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-100"
            >
              Logout
            </button>
          </form>
        ) : (
          <>
            {showLoginForm ? (
            <form
              id="login"
              action={signIn}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {subscriptionMode
                    ? "Already have an account?"
                    : freeMode
                    ? "Login instead"
                    : "Login"}
                </h2>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                  Member
                </span>
              </div>
              {selectedPlan ? <input type="hidden" name="product" value={selectedPlan} /> : null}
              {selectedSport ? <input type="hidden" name="sport" value={selectedSport} /> : null}
              {nextMode ? <input type="hidden" name="next" value={nextMode} /> : null}
              {loginOnlyMode ? <input type="hidden" name="auth_mode" value="login" /> : null}

              <label className="mt-4 block text-sm text-white/70">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition-colors focus:border-cyan-300"
                />
              </label>

              <label className="mt-4 block text-sm text-white/70">
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition-colors focus:border-cyan-300"
                />
              </label>

              <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-white/55">
                <span>Remember email on this device</span>
                <span className="font-semibold text-cyan-300/80">
                  Forgot password?
                </span>
              </div>

              <button
                type="submit"
                className="mt-5 w-full rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-200"
              >
                {subscriptionMode ? "Login and continue to checkout" : "Login"}
              </button>

              {!subscriptionMode ? (
                <Link
                  href={loginOnlyMode ? "/login?intent=free" : "/?section=signals&view=live&sport=TOP"}
                  className="mt-3 block w-full rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-3 text-center text-sm font-bold text-cyan-100 transition-colors hover:bg-cyan-400/10"
                >
                  {loginOnlyMode ? "Create FREE account" : "View Board as Guest"}
                </Link>
              ) : null}
            </form>
            ) : null}

            {showCreateForm ? (
            <form
              id="create-account"
              action={signUp}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {subscriptionMode
                    ? "Create account for checkout"
                    : freeMode
                    ? "Create FREE account"
                    : "Create Account"}
                </h2>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
                  {subscriptionMode && planDetails ? planDetails.name : "FREE"}
                </span>
              </div>
              {selectedPlan ? <input type="hidden" name="product" value={selectedPlan} /> : null}
              {selectedSport ? <input type="hidden" name="sport" value={selectedSport} /> : null}
              {nextMode ? <input type="hidden" name="next" value={nextMode} /> : null}
              {freeMode ? <input type="hidden" name="auth_mode" value="free" /> : null}

              <label className="mt-4 block text-sm text-white/70">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition-colors focus:border-cyan-300"
                />
              </label>

              <label className="mt-4 block text-sm text-white/70">
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition-colors focus:border-cyan-300"
                />
              </label>

              <p className="mt-3 text-[12px] leading-relaxed text-white/50">
                {subscriptionMode
                  ? "After account confirmation, Atlas will continue to Stripe Checkout for this plan."
                  : "Creating an account may require email confirmation before login."}
              </p>

              <button
                type="submit"
                className="mt-5 w-full rounded-md border border-white/20 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                {subscriptionMode ? "Create account and continue" : "Create account"}
              </button>

              {!subscriptionMode ? (
                <Link
                  href={freeMode ? "/login?mode=login" : "/?section=signals&view=live&sport=TOP"}
                  className="mt-3 block w-full rounded-md border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-3 text-center text-sm font-bold text-cyan-100 transition-colors hover:bg-cyan-400/10"
                >
                  {freeMode ? "Login to existing account" : "View Board before creating account"}
                </Link>
              ) : null}
            </form>
            ) : null}

            <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-white/45">
              <span>Support</span>
              <span>Terms</span>
              <span>Privacy</span>
            </div>

            <p className="text-center text-[11px] leading-relaxed text-white/35">
              Responsible gaming tools and subscription billing controls will be
              added before paid access launches.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
