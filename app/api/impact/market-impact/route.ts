import { NextResponse } from "next/server";
import {
  countTodayMarketImpactEvents,
  listTodayMarketImpactEvents,
} from "@/lib/market-impact/marketImpactEventsRepository";
import type { PulseImpact } from "@/types/marketImpact";
import type { MarketImpactSport } from "@/types/marketImpactEvent";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const sports: MarketImpactSport[] = ["MLB", "NBA", "NFL", "NHL", "SOCCER"];

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 100);
}

function parseSport(value: string | null): MarketImpactSport | "ALL" {
  const normalized = String(value ?? "ALL").toUpperCase();
  return normalized === "ALL" || sports.includes(normalized as MarketImpactSport)
    ? (normalized as MarketImpactSport | "ALL")
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
    const events = await listTodayMarketImpactEvents({ sport, confidence, limit });
    const totalToday = await countTodayMarketImpactEvents();

    return NextResponse.json({
      ok: true,
      endpoint: "/api/impact/market-impact",
      events,
      eventCount: events.length,
      totalToday,
      marketImpactOnly: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Market Impact feed unavailable",
        events: [],
        eventCount: 0,
        marketImpactOnly: true,
      },
      { status: 500 },
    );
  }
}
