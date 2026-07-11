import { NextResponse } from "next/server";
import { runAtlasCoreLiveValidation } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runAtlasCoreLiveValidation();
    return NextResponse.json({ success: true, stage: "LIVE_VALIDATION", result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Atlas Core live validation failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET();
}

