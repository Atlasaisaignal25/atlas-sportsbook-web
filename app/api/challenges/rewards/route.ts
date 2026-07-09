import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { claimChallengeReward, getChallengeSnapshot } from "@/app/lib/challenges";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected challenge error";
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    const snapshot = await getChallengeSnapshot(user.id);
    return NextResponse.json({ success: true, rewards: snapshot.rewards });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const reward = await claimChallengeReward({
      userId: user.id,
      runId: String(body.runId ?? ""),
      sport: body.sport,
    });

    return NextResponse.json({ success: true, reward });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: errorMessage(error) },
      { status: 500 }
    );
  }
}
