import { NextResponse } from "next/server";
import { discoverTeamImpactEvents, isTeamImpactSport } from "@/lib/team-impact/teamImpactEngine";
import {
  countTodayTeamImpactEvents,
  listTodayTeamImpactEvents,
  upsertTeamImpactEvents,
} from "@/lib/team-impact/teamImpactRepository";
import type { TeamImpactConfidence } from "@/types/teamImpact";

export const dynamic = "force-dynamic";
export const revalidate = 300;

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 100);
}

function parseSport(value: string | null) {
  const normalized = String(value ?? "ALL").toUpperCase();
  return normalized === "ALL" || isTeamImpactSport(normalized) ? normalized : "ALL";
}

function parseConfidence(value: string | null): TeamImpactConfidence | "ALL" {
  const normalized = String(value ?? "ALL").toUpperCase();
  return normalized === "HIGH" || normalized === "MEDIUM" || normalized === "LOW" ? normalized : "ALL";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sport = parseSport(url.searchParams.get("sport"));
  const confidence = parseConfidence(url.searchParams.get("confidence"));
  const limit = parseLimit(url.searchParams.get("limit"));
  const apiKey = process.env.GNEWS_API_KEY;

  try {
    if (apiKey) {
      const discovered = await discoverTeamImpactEvents({ apiKey, sport, limit: 50 });
      await upsertTeamImpactEvents(discovered);
    }

    const events = await listTodayTeamImpactEvents({ sport, confidence, limit });
    const totalToday = await countTodayTeamImpactEvents();

    return NextResponse.json({
      ok: true,
      source: apiKey ? "gnews" : "supabase",
      endpoint: "/api/impact/team-impact",
      events,
      eventCount: events.length,
      totalToday,
      teamImpactOnly: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Team Impact feed unavailable",
        events: [],
        eventCount: 0,
        teamImpactOnly: true,
      },
      { status: 500 },
    );
  }
}
