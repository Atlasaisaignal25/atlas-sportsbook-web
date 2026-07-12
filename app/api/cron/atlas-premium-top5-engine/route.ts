import { NextResponse } from "next/server";
import { runPremiumTop5Engine } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runPremiumTop5Engine();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Premium Top 5 Engine failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
