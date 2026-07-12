import { NextResponse } from "next/server";
import { runAtlasCoreDailyPipeline } from "@/app/lib/mlb-engine/atlas-core/atlas-core-service";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function pipelineMode(request: Request): "MORNING" | "LIVE" {
  const url = new URL(request.url);
  const value = (url.searchParams.get("mode") ?? "LIVE").toUpperCase();
  return value === "MORNING" ? "MORNING" : "LIVE";
}

async function handler(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runAtlasCoreDailyPipeline(pipelineMode(request));
    return NextResponse.json(result, { status: result.pipelineHealth ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Atlas Core daily pipeline error",
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handler(request);
}

export async function GET(request: Request) {
  return handler(request);
}
