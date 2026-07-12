import { NextResponse } from "next/server";
import { currentHourET, getAtlasCoreMlbConfig } from "@/app/lib/mlb-engine/atlas-core/atlas-core-config";
import { runSignalsDetectedEngine } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getAtlasCoreMlbConfig();
    if (currentHourET() !== config.morningScanHourEt) {
      return NextResponse.json({ success: true, skipped: true, reason: "Signals Detected runs only at 7:00 AM ET." });
    }
    const result = await runSignalsDetectedEngine();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Signals Detected Engine failed" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
