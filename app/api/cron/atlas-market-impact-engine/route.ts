import { NextResponse } from "next/server";
import { captureMarketImpactEvents } from "@/lib/market-impact/marketImpactEngine";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const cronHeader = request.headers.get("x-vercel-cron");
  return Boolean((secret && auth === `Bearer ${secret}`) || cronHeader === "1");
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "Missing ODDS_API_KEY" }, { status: 500 });

  try {
    const result = await captureMarketImpactEvents(apiKey);
    return NextResponse.json({
      ...result,
      endpoint: "/api/cron/atlas-market-impact-engine",
      marketImpactOnly: true,
      interpretation: "NONE",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        endpoint: "/api/cron/atlas-market-impact-engine",
        error: error instanceof Error ? error.message : "Market Impact Engine failed",
        marketImpactOnly: true,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
