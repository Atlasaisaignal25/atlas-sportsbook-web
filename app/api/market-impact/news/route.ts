import { NextResponse } from "next/server";
import { atlasPulseMock } from "@/app/data/atlasPulseMock";
import { createAtlasEventsFromPulseItems } from "@/lib/market-impact/eventEngine";
import { getGNewsAtlasEvents } from "@/lib/market-impact/providers/gnewsProvider";
import type { AtlasEvent } from "@/types/atlasEvent";
import type { PulseImpact, PulseSport } from "@/types/marketImpact";

export const revalidate = 600;

const supportedSports: PulseSport[] = ["MLB"];
const supportedImpacts: PulseImpact[] = ["HIGH", "MEDIUM", "LOW"];

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(parsed, 1), 50);
}

function parseSport(value: string | null): PulseSport {
  const normalized = String(value ?? "MLB").toUpperCase();
  return supportedSports.includes(normalized as PulseSport) ? (normalized as PulseSport) : "MLB";
}

function parseImpact(value: string | null): PulseImpact | null {
  const normalized = String(value ?? "").toUpperCase();
  return supportedImpacts.includes(normalized as PulseImpact) ? (normalized as PulseImpact) : null;
}

function getFallbackItems(sport: PulseSport, impact: PulseImpact | null, limit: number) {
  const pulseItems = atlasPulseMock
    .filter((item) => item.sport === sport)
    .filter((item) => !impact || item.impact === impact)
    .map((item) => ({ ...item, isLiveData: false }));

  return createAtlasEventsFromPulseItems(pulseItems, { provider: "Atlas" }).slice(0, limit);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sport = parseSport(url.searchParams.get("sport"));
  const impact = parseImpact(url.searchParams.get("impact"));
  const limit = parseLimit(url.searchParams.get("limit"));
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    const items = getFallbackItems(sport, impact, limit);

    return NextResponse.json({
      ok: true,
      source: "fallback",
      items,
      events: items,
    });
  }

  try {
    const result = await getGNewsAtlasEvents({
      apiKey,
      sport,
      impact,
      limit,
    });
    const items: AtlasEvent[] = result.events;

    if (items.length === 0) {
      const fallbackItems = getFallbackItems(sport, impact, limit);

      return NextResponse.json({
        ok: true,
        source: "fallback",
        items: fallbackItems,
        events: fallbackItems,
      });
    }

    return NextResponse.json({
      ok: true,
      source: "gnews",
      items,
      events: items,
      meta: result.meta,
    });
  } catch {
    const items = getFallbackItems(sport, impact, limit);

    return NextResponse.json({
      ok: true,
      source: "fallback",
      items,
      events: items,
    });
  }
}
