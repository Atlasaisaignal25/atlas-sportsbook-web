import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
    message?: string;
  }>;
};

async function signIn(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

async function signUp(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestHeaders = await headers();
  const origin =
    requestHeaders.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(
    "/login?message=Check%20your%20email%20to%20confirm%20your%20account"
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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-[#050816] px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-300">
              ATLAS SIGNALS
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Account Access
            </h1>
          </div>

          <Link
            href="/"
            className="shrink-0 rounded-full border border-white/15 px-3 py-2 text-[12px] font-semibold text-white/80 transition-colors hover:bg-white/10"
          >
            Back to app
          </Link>
        </div>

        <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] px-4 py-3 text-sm text-white/70">
          Secure access for Atlas Signals members. Subscriptions are not active
          yet; authenticated users remain on FREE unless marked as admin.
        </div>

        <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1 text-sm font-semibold">
          <a
            href="#login"
            className="flex-1 rounded-full bg-cyan-400 px-3 py-2 text-center text-slate-950"
          >
            Login
          </a>
          <a
            href="#create-account"
            className="flex-1 rounded-full px-3 py-2 text-center text-white/70"
          >
            Create Account
          </a>
        </div>

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
            <form
              id="login"
              action={signIn}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Login</h2>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                  Member
                </span>
              </div>

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
                Login
              </button>
            </form>

            <form
              id="create-account"
              action={signUp}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Create Account</h2>
                <span className="rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
                  FREE
                </span>
              </div>

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
                Creating an account may require email confirmation before login.
              </p>

              <button
                type="submit"
                className="mt-5 w-full rounded-md border border-white/20 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                Create account
              </button>
            </form>

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
