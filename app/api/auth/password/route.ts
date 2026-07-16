import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";

type AuthMode = "signin" | "signup";

function getAuthMode(value: unknown): AuthMode | null {
  return value === "signin" || value === "signup" ? value : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const mode = getAuthMode(body?.mode);
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");

  if (!mode || !email || password.length < 6) {
    return NextResponse.json(
      { success: false, error: "Enter a valid email and a password with at least 6 characters." },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();

  if (mode === "signin") {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      authenticated: Boolean(data.user),
      email: data.user?.email ?? email,
    });
  }

  const origin =
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
        "/?section=more"
      )}`,
    },
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    authenticated: Boolean(data.session),
    email: data.user?.email ?? email,
    needsConfirmation: !data.session,
  });
}
