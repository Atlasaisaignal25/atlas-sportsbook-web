import { NextResponse } from "next/server";
import { runAtlasCoreDailyPipeline } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

function modeFromRequest(request: Request): "MORNING" | "LIVE" {
  const value = (new URL(request.url).searchParams.get("mode") ?? "LIVE").toUpperCase();
  return value === "MORNING" ? "MORNING" : "LIVE";
}

export async function GET(request: Request) {
  try {
    const result = await runAtlasCoreDailyPipeline(modeFromRequest(request));
    return NextResponse.json({ success: true, result }, { status: result.pipelineHealth ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Atlas Core daily pipeline failed",
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
