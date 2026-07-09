import type { AtlasEvent, AtlasProvider, AtlasSource, AtlasTimelineItem } from "@/types/atlasEvent";
import type { AtlasPulseItem } from "@/types/marketImpact";
import { calculateEventConfidence } from "./eventConfidence";
import { mergeEvents } from "./mergeEvents";
import { relativeTimestamp } from "./relativeTimestamp";
import { scorePublisher } from "./sourceQuality";

function normalizeEventId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function minIso(values: string[]) {
  const sorted = values.filter(Boolean).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return sorted[0] ?? new Date().toISOString();
}

function maxIso(values: string[]) {
  const sorted = values.filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return sorted[0] ?? new Date().toISOString();
}

function sourceFromPulseItem(item: AtlasPulseItem, provider: AtlasProvider): AtlasSource[] {
  if (item.sources && item.sources.length > 0) {
    return item.sources.map((source) => ({
      ...source,
      provider,
    }));
  }

  if (!item.sourceUrl) return [];

  return [
    {
      name: item.source,
      url: item.sourceUrl,
      publishedAt: item.publishedAt,
      reliability: scorePublisher(item.source),
      provider,
    },
  ];
}

function timelineFromPulseItem(item: AtlasPulseItem, provider: AtlasProvider): AtlasTimelineItem[] {
  const sources = sourceFromPulseItem(item, provider);
  const baseSummary = item.summary.length > 140 ? `${item.summary.slice(0, 139).trimEnd()}…` : item.summary;

  if (sources.length === 0) {
    return [
      {
        timestamp: item.publishedAt,
        provider,
        eventType: item.category,
        summary: baseSummary,
      },
    ];
  }

  return sources.map((source) => ({
    timestamp: source.publishedAt,
    provider: source.provider,
    eventType: item.category,
    summary: `${source.name}: ${baseSummary}`,
  }));
}

export function atlasEventFromPulseItem(
  item: AtlasPulseItem,
  options: { provider?: AtlasProvider; now?: Date } = {},
): AtlasEvent {
  const provider = options.provider ?? "Atlas";
  const sources = sourceFromPulseItem(item, provider);
  const timeline = timelineFromPulseItem(item, provider);
  const firstDetected = minIso([item.publishedAt, ...sources.map((source) => source.publishedAt)]);
  const lastUpdated = maxIso([item.publishedAt, ...sources.map((source) => source.publishedAt)]);
  const providerCount = new Set(timeline.map((entry) => entry.provider)).size || 1;
  const primaryMarket = item.primaryMarket ?? item.markets[0] ?? "Moneyline";
  const secondaryMarkets = item.otherMarkets ?? item.markets.filter((market) => market !== primaryMarket);
  const confidence = calculateEventConfidence({
    sources,
    providerCount,
    firstDetected,
    lastUpdated,
    articleAgreement: sources.length,
    now: options.now,
  });

  return {
    id: `event-${normalizeEventId(item.groupedEventKey ?? `${item.category}-${item.title}`) || item.id}`,
    title: item.title,
    sport: item.sport,
    category: item.category,
    impact: item.impact,
    atlasImpactScore: item.atlasImpactScore ?? 0,
    primaryMarket,
    secondaryMarkets,
    whyItMatters: item.whyItMatters ?? "",
    sources,
    timeline,
    firstDetected,
    lastUpdated,
    confidence,
    providerCount,
    isResolved: false,
    summary: item.summary,
    player: item.player,
    team: item.team,
    imageUrl: item.imageUrl,
    isLiveData: item.isLiveData,
    markets: item.markets,
    otherMarkets: secondaryMarkets,
    source: sources[0]?.name ?? item.source,
    sourceUrl: sources[0]?.url ?? item.sourceUrl,
    publishedAt: lastUpdated,
    timestampLabel: relativeTimestamp(lastUpdated, options.now ?? new Date()),
    sourceCount: Math.max(sources.length, item.sourceCount ?? 1),
    publisherReliability: sources[0]?.reliability ?? item.publisherReliability,
    groupedEventKey: item.groupedEventKey,
  };
}

export function createAtlasEventsFromPulseItems(
  items: AtlasPulseItem[],
  options: { provider?: AtlasProvider; now?: Date } = {},
) {
  return mergeEvents(items.map((item) => atlasEventFromPulseItem(item, options)), options);
}
