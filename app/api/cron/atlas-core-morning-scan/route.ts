import { NextResponse } from "next/server";
import { runAtlasCoreMorningScan } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("force") === "1";
    const result = await runAtlasCoreMorningScan({ force });
    return NextResponse.json({ success: true, stage: "SIGNALS_DETECTED", result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Atlas Core morning scan failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}

