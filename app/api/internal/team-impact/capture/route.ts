import { NextResponse } from "next/server";
import { discoverTeamImpactEvents, isTeamImpactSport } from "@/lib/team-impact/teamImpactEngine";
import { countTodayTeamImpactEvents, upsertTeamImpactEvents } from "@/lib/team-impact/teamImpactRepository";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const rawSport = String(url.searchParams.get("sport") ?? "ALL").toUpperCase();
  const sport = rawSport === "ALL" || isTeamImpactSport(rawSport) ? rawSport : "ALL";
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Missing GNEWS_API_KEY" }, { status: 500 });
  }

  const events = await discoverTeamImpactEvents({ apiKey, sport, limit: 100 });
  const storage = await upsertTeamImpactEvents(events);
  const totalToday = await countTodayTeamImpactEvents();

  return NextResponse.json({
    ok: storage.errors.length === 0,
    endpoint: "/api/internal/team-impact/capture",
    sport,
    discovered: events.length,
    inserted: storage.inserted,
    updated: storage.updated,
    skipped: storage.skipped,
    errors: storage.errors,
    totalToday,
    teamImpactOnly: true,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
