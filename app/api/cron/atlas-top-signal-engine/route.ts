import { NextResponse } from "next/server";
import { runTopSignalEngine } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runTopSignalEngine();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Top Signal Engine failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
