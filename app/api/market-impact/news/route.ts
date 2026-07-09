import { NextResponse } from "next/server";
import { atlasPulseMock } from "@/app/data/atlasPulseMock";
import { normalizeGNewsArticle, type GNewsArticle } from "@/lib/market-impact/normalizeGNewsArticle";
import type { AtlasPulseItem, PulseImpact, PulseSport } from "@/types/marketImpact";

export const revalidate = 600;

type GNewsResponse = {
  totalArticles?: number;
  articles?: GNewsArticle[];
  errors?: unknown;
};

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
  return atlasPulseMock
    .filter((item) => item.sport === sport)
    .filter((item) => !impact || item.impact === impact)
    .slice(0, limit)
    .map((item) => ({ ...item, isLiveData: false }));
}

function dedupeItems(items: AtlasPulseItem[]) {
  const seen = new Set<string>();
  const deduped: AtlasPulseItem[] = [];

  for (const item of items) {
    const key = item.sourceUrl || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function sortNewestFirst(items: AtlasPulseItem[]) {
  return [...items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

function gnewsQueryForSport(sport: PulseSport) {
  if (sport !== "MLB") return "";

  return [
    '("MLB" OR "Major League Baseball")',
    "(injury OR injured OR lineup OR scratched OR \"ruled out\" OR pitcher OR bullpen OR weather OR suspension OR trade OR transaction OR odds OR betting OR moneyline OR total OR roster OR activated OR placed)",
  ].join(" AND ");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sport = parseSport(url.searchParams.get("sport"));
  const impact = parseImpact(url.searchParams.get("impact"));
  const limit = parseLimit(url.searchParams.get("limit"));
  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      source: "fallback",
      items: getFallbackItems(sport, impact, limit),
    });
  }

  try {
    const params = new URLSearchParams({
      q: gnewsQueryForSport(sport),
      lang: "en",
      max: String(limit),
      sortby: "publishedAt",
      apikey: apiKey,
    });

    const response = await fetch(`https://gnews.io/api/v4/search?${params.toString()}`, {
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      throw new Error(`GNews returned ${response.status}`);
    }

    const data = (await response.json()) as GNewsResponse;
    const normalized = dedupeItems(
      (data.articles ?? [])
        .map((article) => normalizeGNewsArticle(article))
        .filter((item): item is AtlasPulseItem => Boolean(item))
        .filter((item) => !impact || item.impact === impact),
    );

    const items = sortNewestFirst(normalized).slice(0, limit);

    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        items: getFallbackItems(sport, impact, limit),
      });
    }

    return NextResponse.json({
      ok: true,
      source: "gnews",
      items,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      source: "fallback",
      items: getFallbackItems(sport, impact, limit),
    });
  }
}
