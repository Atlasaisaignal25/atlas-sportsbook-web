import { NextResponse } from "next/server";
import { runAtlasCoreDailyPipeline } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";
import { currentHourET, getAtlasCoreMlbConfig } from "@/app/lib/mlb-engine/atlas-core/atlas-core-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getAtlasCoreMlbConfig();
    if (currentHourET() !== config.morningScanHourEt) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `Morning daily pipeline runs only at ${config.morningScanHourEt}:00 AM ET.`,
      });
    }
    const result = await runAtlasCoreDailyPipeline("MORNING");
    return NextResponse.json({ success: true, result }, { status: result.pipelineHealth ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Atlas Core morning daily pipeline failed",
    }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
