import { NextResponse } from "next/server";
import { discoverTeamImpactEvents } from "@/lib/team-impact/teamImpactEngine";
import { countTodayTeamImpactEvents, upsertTeamImpactEvents } from "@/lib/team-impact/teamImpactRepository";

export const dynamic = "force-dynamic";

const CRON_FREQUENCY_MINUTES = 5;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const cronHeader = request.headers.get("x-vercel-cron");
  return Boolean((secret && auth === `Bearer ${secret}`) || cronHeader === "1");
}

function nextRunFrom(lastRun: Date) {
  return new Date(lastRun.getTime() + CRON_FREQUENCY_MINUTES * 60000).toISOString();
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "Missing GNEWS_API_KEY" }, { status: 500 });

  const runStartedAt = new Date();

  try {
    const events = await discoverTeamImpactEvents({ apiKey, sport: "ALL", limit: 100 });
    const storage = await upsertTeamImpactEvents(events);
    const totalToday = await countTodayTeamImpactEvents();
    const ok = storage.errors.length === 0;

    return NextResponse.json({
      ok,
      endpoint: "/api/cron/atlas-team-impact-engine",
      teamImpactOnly: true,
      engine: "team_impact_existing",
      frequencyMinutes: CRON_FREQUENCY_MINUTES,
      lastRun: runStartedAt.toISOString(),
      nextRun: nextRunFrom(runStartedAt),
      lastSuccessfulCapture: ok ? runStartedAt.toISOString() : null,
      discovered: events.length,
      eventsInserted: storage.inserted,
      eventsUpdated: storage.updated,
      eventsSkipped: storage.skipped,
      errors: storage.errors,
      totalToday,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        endpoint: "/api/cron/atlas-team-impact-engine",
        teamImpactOnly: true,
        engine: "team_impact_existing",
        frequencyMinutes: CRON_FREQUENCY_MINUTES,
        lastRun: runStartedAt.toISOString(),
        nextRun: nextRunFrom(runStartedAt),
        lastSuccessfulCapture: null,
        eventsInserted: 0,
        eventsUpdated: 0,
        eventsSkipped: 0,
        errors: [error instanceof Error ? error.message : "Team Impact cron failed"],
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
