import { groupArticles } from "@/lib/market-impact/groupArticles";
import { normalizeGNewsArticle, type GNewsArticle } from "@/lib/market-impact/normalizeGNewsArticle";
import { createAtlasEventsFromPulseItems } from "@/lib/market-impact/eventEngine";
import type { AtlasEvent } from "@/types/atlasEvent";
import type { AtlasPulseItem, PulseImpact, PulseSport } from "@/types/marketImpact";

type GNewsResponse = {
  totalArticles?: number;
  articles?: GNewsArticle[];
  errors?: unknown;
};

export type GNewsProviderResult = {
  provider: "GNews";
  events: AtlasEvent[];
  meta: {
    rawRelevantArticles: number;
    groupedEvents: number;
    duplicateArticlesMerged: number;
    eventCount: number;
  };
};

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

function sortNewestFirst<T extends { publishedAt: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

function gnewsQueryForSport(sport: PulseSport) {
  if (sport !== "MLB") return "";

  return "MLB";
}

export async function getGNewsAtlasEvents(input: {
  apiKey: string;
  sport: PulseSport;
  impact: PulseImpact | null;
  limit: number;
}): Promise<GNewsProviderResult> {
  const params = new URLSearchParams({
    q: gnewsQueryForSport(input.sport),
    lang: "en",
    max: "50",
    sortby: "publishedAt",
    apikey: input.apiKey,
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
      .filter((item) => !input.impact || item.impact === input.impact),
  );
  const grouped = groupArticles(sortNewestFirst(normalized));
  const events = createAtlasEventsFromPulseItems(grouped, { provider: "GNews" })
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, input.limit);

  return {
    provider: "GNews",
    events,
    meta: {
      rawRelevantArticles: normalized.length,
      groupedEvents: grouped.length,
      duplicateArticlesMerged: Math.max(normalized.length - grouped.length, 0),
      eventCount: events.length,
    },
  };
}
