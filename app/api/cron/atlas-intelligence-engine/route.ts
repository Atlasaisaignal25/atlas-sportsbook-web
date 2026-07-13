import { NextResponse } from "next/server";
import { captureAtlasIntelligenceEvents } from "@/lib/atlas-intelligence/atlasIntelligenceEngine";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const cronHeader = request.headers.get("x-vercel-cron");
  return Boolean((secret && auth === `Bearer ${secret}`) || cronHeader === "1");
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = await captureAtlasIntelligenceEvents();
    return NextResponse.json({
      ...result,
      endpoint: "/api/cron/atlas-intelligence-engine",
      atlasIntelligenceOnly: true,
      externalApis: "NONE",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        endpoint: "/api/cron/atlas-intelligence-engine",
        error: error instanceof Error ? error.message : "Atlas Intelligence Engine failed",
        atlasIntelligenceOnly: true,
        externalApis: "NONE",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
