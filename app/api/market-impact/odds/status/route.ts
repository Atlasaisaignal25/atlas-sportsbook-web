import { NextResponse } from "next/server";
import { getSnapshotStatus } from "@/lib/market-impact/odds/snapshotRepository";

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
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getSnapshotStatus();
    return NextResponse.json({
      ok: true,
      provider: "OddsAPI",
      storage: "supabase:market_odds_snapshots",
      ...status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: "OddsAPI",
        storage: "supabase:market_odds_snapshots",
        error: "Status unavailable",
        details: serializeError(error),
      },
      { status: 500 },
    );
  }
}
