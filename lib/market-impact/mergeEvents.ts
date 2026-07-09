import type { AtlasEvent, AtlasSource, AtlasTimelineItem } from "@/types/atlasEvent";
import { calculateEventConfidence } from "./eventConfidence";
import { calculateAtlasImpactScore } from "./impactScore";
import { getOtherMarkets, getPrimaryMarket } from "./primaryMarket";
import { relativeTimestamp } from "./relativeTimestamp";

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2);
}

function titleSimilarity(a: string, b: string) {
  const aTokens = new Set(tokens(a));
  const bTokens = new Set(tokens(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) overlap += 1;
  });

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function sameEvent(a: AtlasEvent, b: AtlasEvent) {
  if (a.sport !== b.sport) return false;

  const aIsMarket = a.category === "MARKET" || Boolean(a.marketMovement);
  const bIsMarket = b.category === "MARKET" || Boolean(b.marketMovement);

  if (aIsMarket !== bIsMarket) {
    const sharedTeam =
      (a.team && b.team && normalizeText(a.team) === normalizeText(b.team)) ||
      (a.team && normalizeText(b.title).includes(normalizeText(a.team))) ||
      (b.team && normalizeText(a.title).includes(normalizeText(b.team)));
    const timeDistance = Math.abs(new Date(a.lastUpdated).getTime() - new Date(b.lastUpdated).getTime());

    return Boolean(sharedTeam) && Number.isFinite(timeDistance) && timeDistance <= 24 * 60 * 60 * 1000;
  }

  if (a.category !== b.category) return false;

  if (a.player && b.player && normalizeText(a.player) === normalizeText(b.player)) return true;
  if (a.team && b.team && normalizeText(a.team) === normalizeText(b.team)) {
    return titleSimilarity(a.title, b.title) >= 0.28;
  }

  return titleSimilarity(a.title, b.title) >= 0.48;
}

function mergeSources(events: AtlasEvent[]) {
  const sources = new Map<string, AtlasSource>();

  events.forEach((event) => {
    event.sources.forEach((source) => {
      sources.set(`${source.provider}:${source.name}:${source.url}`, source);
    });
  });

  return [...sources.values()].sort((a, b) => b.reliability - a.reliability);
}

function mergeTimeline(events: AtlasEvent[]) {
  const timeline = new Map<string, AtlasTimelineItem>();

  events.forEach((event) => {
    event.timeline.forEach((item) => {
      timeline.set(`${item.provider}:${item.timestamp}:${item.eventType}:${item.summary}`, item);
    });
  });

  return [...timeline.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function newest(values: string[]) {
  return values.filter(Boolean).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? new Date().toISOString();
}

function oldest(values: string[]) {
  return values.filter(Boolean).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? new Date().toISOString();
}

function strongestImpact(events: AtlasEvent[]) {
  if (events.some((event) => event.impact === "HIGH")) return "HIGH";
  if (events.some((event) => event.impact === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

export function mergeEvents(events: AtlasEvent[], options: { now?: Date } = {}) {
  const groups: AtlasEvent[][] = [];

  events.forEach((event) => {
    const group = groups.find((candidate) => candidate.some((existing) => sameEvent(existing, event)));
    if (group) {
      group.push(event);
    } else {
      groups.push([event]);
    }
  });

  return groups.map((group) => {
    const sources = mergeSources(group);
    const timeline = mergeTimeline(group);
    const primary = [...group].sort((a, b) => (b.publisherReliability ?? 70) - (a.publisherReliability ?? 70))[0] ?? group[0];
    const firstDetected = oldest(group.map((event) => event.firstDetected));
    const lastUpdated = newest(group.map((event) => event.lastUpdated));
    const providerCount = new Set(timeline.map((item) => item.provider)).size || 1;
    const markets = [...new Set(group.flatMap((event) => event.markets))];
    const primaryMarket = getPrimaryMarket(primary.category, markets);
    const secondaryMarkets = getOtherMarkets(primaryMarket, markets);
    const marketMovement = group.find((event) => event.marketMovement)?.marketMovement;
    const confidence = calculateEventConfidence({
      sources,
      providerCount,
      firstDetected,
      lastUpdated,
      articleAgreement: sources.length,
      marketMovement,
      now: options.now,
    });
    const mergedImpact = strongestImpact(group);
    const atlasImpactScore = Math.min(
      100,
      Math.max(
        ...group.map((event) => event.atlasImpactScore),
        calculateAtlasImpactScore({
          category: primary.category,
          impact: mergedImpact,
          sourceCount: sources.length,
          topPublisherReliability: sources[0]?.reliability,
        }) + (providerCount > 1 ? 4 : 0),
      ),
    );

    return {
      ...primary,
      impact: mergedImpact,
      atlasImpactScore,
      sources,
      timeline,
      firstDetected,
      lastUpdated,
      providerCount,
      confidence,
      primaryMarket,
      secondaryMarkets,
      markets,
      otherMarkets: secondaryMarkets,
      source: sources[0]?.name ?? primary.source,
      sourceUrl: sources[0]?.url ?? primary.sourceUrl,
      publishedAt: lastUpdated,
      timestampLabel: relativeTimestamp(lastUpdated, options.now ?? new Date()),
      sourceCount: Math.max(sources.length, 1),
      publisherReliability: sources[0]?.reliability ?? primary.publisherReliability,
      isResolved: group.every((event) => event.isResolved),
      marketMovement,
    } satisfies AtlasEvent;
  });
}
