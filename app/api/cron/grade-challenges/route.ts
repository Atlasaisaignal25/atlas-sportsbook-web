import { NextResponse } from "next/server";
import { gradePendingChallenges } from "@/app/lib/challenges";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected challenge grading error";
}

export async function GET() {
  try {
    const graded = await gradePendingChallenges();
    return NextResponse.json({ success: true, graded });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: errorMessage(error) },
      { status: 500 }
    );
  }
}
