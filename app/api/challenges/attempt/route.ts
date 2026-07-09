import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import {
  createChallengeAttempt,
  isChallengeType,
  normalizeChallengeGuestId,
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

    if (!isChallengeType(body.challengeType)) {
      return NextResponse.json(
        { success: false, error: "Invalid challenge type." },
        { status: 400 }
      );
    }

    const signalIds = Array.isArray(body.signalIds)
      ? body.signalIds.map((value: unknown) => String(value))
      : [];

    const attempt = await createChallengeAttempt({
      userId: user?.id ?? null,
      guestId: user ? null : guestId,
      challengeType: body.challengeType,
      signalIds,
    });

    return NextResponse.json({ success: true, ...attempt });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: errorMessage(error) },
      { status: 500 }
    );
  }
}
