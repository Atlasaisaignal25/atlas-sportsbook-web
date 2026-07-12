import { NextResponse } from "next/server";
import { runAtlasSignalEnginesValidation } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runAtlasSignalEnginesValidation();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Atlas Signal Engines validation failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
