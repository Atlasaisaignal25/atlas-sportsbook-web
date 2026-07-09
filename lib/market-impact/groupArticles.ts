import type { AtlasPulseItem, AtlasPulseSource } from "@/types/marketImpact";
import { calculateAtlasImpactScore } from "./impactScore";
import { getOtherMarkets, getPrimaryMarket } from "./primaryMarket";
import { scorePublisher } from "./sourceQuality";
import { buildWhyItMatters } from "./whyItMatters";

const knownTeams = [
  "Arizona Diamondbacks",
  "Atlanta Braves",
  "Baltimore Orioles",
  "Boston Red Sox",
  "Chicago Cubs",
  "Chicago White Sox",
  "Cincinnati Reds",
  "Cleveland Guardians",
  "Colorado Rockies",
  "Detroit Tigers",
  "Houston Astros",
  "Kansas City Royals",
  "Los Angeles Angels",
  "Los Angeles Dodgers",
  "Miami Marlins",
  "Milwaukee Brewers",
  "Minnesota Twins",
  "New York Mets",
  "New York Yankees",
  "Oakland Athletics",
  "Philadelphia Phillies",
  "Pittsburgh Pirates",
  "San Diego Padres",
  "San Francisco Giants",
  "Seattle Mariners",
  "St. Louis Cardinals",
  "Tampa Bay Rays",
  "Texas Rangers",
  "Toronto Blue Jays",
  "Washington Nationals",
];

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "after",
  "before",
  "into",
  "onto",
  "over",
  "under",
  "this",
  "that",
  "mlb",
  "major",
  "league",
  "baseball",
  "player",
  "team",
  "official",
  "announce",
  "announces",
  "reported",
  "reports",
]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string) {
  return normalizeText(title)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function titleSimilarity(a: string, b: string) {
  const aTokens = new Set(titleTokens(a));
  const bTokens = new Set(titleTokens(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  aTokens.forEach((token) => {
    if (bTokens.has(token)) intersection += 1;
  });

  return intersection / Math.max(aTokens.size, bTokens.size);
}

function extractKnownTeam(text: string) {
  const normalized = normalizeText(text);
  return knownTeams.find((team) => normalized.includes(normalizeText(team)));
}

function extractLikelyPlayer(title: string) {
  const match = title.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
  if (!match) return undefined;

  const candidate = `${match[1]} ${match[2]}`;
  if (knownTeams.some((team) => team.includes(candidate))) return undefined;
  if (["New York", "Los Angeles", "San Diego", "San Francisco", "Kansas City", "St Louis"].includes(candidate)) {
    return undefined;
  }

  return candidate;
}

function eventSubject(item: AtlasPulseItem) {
  const text = `${item.title} ${item.summary}`;
  const team = item.team || extractKnownTeam(text);
  const player = item.player || extractLikelyPlayer(item.title);
  return {
    team,
    player,
    key: normalizeText(player || team || item.title).slice(0, 80),
  };
}

function isSameEvent(a: AtlasPulseItem, b: AtlasPulseItem) {
  if (a.category !== b.category) return false;

  const aSubject = eventSubject(a);
  const bSubject = eventSubject(b);

  if (aSubject.player && bSubject.player && normalizeText(aSubject.player) === normalizeText(bSubject.player)) {
    return true;
  }

  if (aSubject.team && bSubject.team && normalizeText(aSubject.team) === normalizeText(bSubject.team)) {
    return titleSimilarity(a.title, b.title) >= 0.28;
  }

  return titleSimilarity(a.title, b.title) >= 0.48;
}

export function mergeSources(items: AtlasPulseItem[]) {
  const sources = new Map<string, AtlasPulseSource>();

  items.forEach((item) => {
    const sourceName = item.source || "Original Publisher";
    const url = item.sourceUrl || "";
    if (!url) return;

    const key = `${sourceName}:${url}`;
    sources.set(key, {
      name: sourceName,
      url,
      publishedAt: item.publishedAt,
      reliability: scorePublisher(sourceName),
    });
  });

  return [...sources.values()].sort((a, b) => b.reliability - a.reliability);
}

function strongestImpact(items: AtlasPulseItem[]) {
  if (items.some((item) => item.impact === "HIGH")) return "HIGH";
  if (items.some((item) => item.impact === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

export function groupArticles(items: AtlasPulseItem[]) {
  const groups: AtlasPulseItem[][] = [];

  items.forEach((item) => {
    const group = groups.find((candidate) => candidate.some((existing) => isSameEvent(existing, item)));
    if (group) {
      group.push(item);
    } else {
      groups.push([item]);
    }
  });

  return groups.map((group) => {
    const sources = mergeSources(group);
    const primary =
      [...group].sort((a, b) => scorePublisher(b.source) - scorePublisher(a.source))[0] ?? group[0];
    const impact = strongestImpact(group);
    const primaryMarket = getPrimaryMarket(primary.category, primary.markets);
    const otherMarkets = getOtherMarkets(primaryMarket, primary.markets);
    const subject = eventSubject(primary);
    const topReliability = sources[0]?.reliability ?? scorePublisher(primary.source);

    return {
      ...primary,
      impact,
      sourceCount: Math.max(sources.length, 1),
      sources,
      source: sources[0]?.name ?? primary.source,
      sourceUrl: sources[0]?.url ?? primary.sourceUrl,
      player: primary.player ?? subject.player,
      team: primary.team ?? subject.team,
      whyItMatters: buildWhyItMatters({ category: primary.category, markets: primary.markets }),
      primaryMarket,
      otherMarkets,
      atlasImpactScore: calculateAtlasImpactScore({
        category: primary.category,
        impact,
        sourceCount: sources.length,
        topPublisherReliability: topReliability,
      }),
      publisherReliability: topReliability,
      groupedEventKey: `${primary.category}:${subject.key}`,
    } satisfies AtlasPulseItem;
  });
}
