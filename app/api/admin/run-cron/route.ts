import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";

export const dynamic = "force-dynamic";

const allowedCronPaths = new Set([
  "/api/cron/generate-daily-top5",
  "/api/cron/validate-top5-pregame",
  "/api/cron/grade-mlb-top-signals",
  "/api/cron/grade-mlb-top5",
  "/api/cron/grade-nba-top-signals",
  "/api/cron/grade-nba-top5",
  "/api/cron/grade-nhl-top-signals",
  "/api/cron/grade-nhl-top5",
  "/api/cron/grade-soccer-top-signals",
  "/api/cron/grade-soccer-top5",
  "/api/cron/grade-challenges",
]);

export async function POST(request: NextRequest) {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const path = String(body?.path ?? "");

  if (!allowedCronPaths.has(path)) {
    return NextResponse.json(
      { success: false, error: "Cron path is not allowed" },
      { status: 400 }
    );
  }

  const url = new URL(path, request.url);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = text;

  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 2000);
  }

  return NextResponse.json({
    success: response.ok,
    path,
    status: response.status,
    data,
  });
}
