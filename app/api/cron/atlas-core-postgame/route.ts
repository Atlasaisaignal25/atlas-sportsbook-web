import { NextResponse } from "next/server";
import { runAtlasCorePostgame } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runAtlasCorePostgame();
    return NextResponse.json({ success: true, stage: "POST_GAME", result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Atlas Core postgame failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET();
}

