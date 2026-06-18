import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user?.email?.trim().toLowerCase();
  const isAdmin = Boolean(adminEmail && userEmail && adminEmail === userEmail);

  return NextResponse.json({
    authenticated: Boolean(user),
    email: user?.email ?? null,
    plan: isAdmin ? "admin" : "free",
    sports: isAdmin ? ["MLB", "NBA", "NHL", "SOCCER"] : [],
  });
}
