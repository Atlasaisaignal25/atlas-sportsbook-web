import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getChallengeSnapshot, normalizeChallengeGuestId } from "@/app/lib/challenges";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected challenge error";
}

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const guestId = normalizeChallengeGuestId(req.headers.get("x-atlas-guest-id"));
    const snapshot = await getChallengeSnapshot({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
    });
    return NextResponse.json({ success: true, ...snapshot });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: errorMessage(error) },
      { status: 500 }
    );
  }
}
