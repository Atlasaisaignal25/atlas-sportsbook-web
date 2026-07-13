import { NextResponse } from "next/server";
import {
  countTodayAtlasIntelligenceEvents,
  listTodayAtlasIntelligenceEvents,
} from "@/lib/atlas-intelligence/atlasIntelligenceRepository";
import type { AtlasIntelligenceSport } from "@/types/atlasIntelligenceEvent";
import type { PulseImpact } from "@/types/marketImpact";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const sports: AtlasIntelligenceSport[] = ["MLB", "NBA", "NFL", "NHL", "SOCCER"];

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 100);
}

function parseSport(value: string | null): AtlasIntelligenceSport | "ALL" {
  const normalized = String(value ?? "ALL").toUpperCase();
  return normalized === "ALL" || sports.includes(normalized as AtlasIntelligenceSport)
    ? (normalized as AtlasIntelligenceSport | "ALL")
    : "ALL";
}

function parseConfidence(value: string | null): PulseImpact | "ALL" {
  const normalized = String(value ?? "ALL").toUpperCase();
  return normalized === "HIGH" || normalized === "MEDIUM" || normalized === "LOW" ? normalized : "ALL";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sport = parseSport(url.searchParams.get("sport"));
  const confidence = parseConfidence(url.searchParams.get("confidence"));
  const limit = parseLimit(url.searchParams.get("limit"));

  try {
    const events = await listTodayAtlasIntelligenceEvents({ sport, confidence, limit });
    const totalToday = await countTodayAtlasIntelligenceEvents();

    return NextResponse.json({
      ok: true,
      endpoint: "/api/impact/atlas-intelligence",
      events,
      eventCount: events.length,
      totalToday,
      atlasIntelligenceOnly: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Atlas Intelligence feed unavailable",
        events: [],
        eventCount: 0,
        atlasIntelligenceOnly: true,
      },
      { status: 500 },
    );
  }
}
