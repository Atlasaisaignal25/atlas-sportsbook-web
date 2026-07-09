import { NextResponse } from "next/server";
import { captureMlbOddsSnapshot } from "@/lib/market-impact/providers/oddsProvider";

export const dynamic = "force-dynamic";

function serializeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization") ?? "";
  const cronHeader = request.headers.get("x-vercel-cron");
  return auth === `Bearer ${secret}` || cronHeader === "1";
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing ODDS_API_KEY" }, { status: 500 });
  }

  try {
    const result = await captureMlbOddsSnapshot(apiKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Odds snapshot failed",
        details: serializeError(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
