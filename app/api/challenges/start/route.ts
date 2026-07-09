import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import {
  isChallengeType,
  normalizeChallengeGuestId,
  startChallenge,
} from "@/app/lib/challenges";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected challenge error";
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const guestId = normalizeChallengeGuestId(req.headers.get("x-atlas-guest-id"));

    if (!user && !guestId) {
      return NextResponse.json(
        { success: false, error: "Challenge identity required." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const challengeType = body.challengeType;

    if (!isChallengeType(challengeType)) {
      return NextResponse.json(
        { success: false, error: "Invalid challenge type." },
        { status: 400 }
      );
    }

    const run = await startChallenge(
      { userId: user?.id ?? null, guestId: user ? null : guestId },
      challengeType
    );
    return NextResponse.json({ success: true, run });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: errorMessage(error) },
      { status: 500 }
    );
  }
}
