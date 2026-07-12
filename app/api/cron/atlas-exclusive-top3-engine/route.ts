import { NextResponse } from "next/server";
import { runExclusiveTop3Engine } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runExclusiveTop3Engine();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Exclusive Top 3 Engine failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
