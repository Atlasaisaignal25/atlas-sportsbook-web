import { createHash } from "crypto";
import type { AtlasPulseItem } from "@/types/marketImpact";
import { classifyMarketImpact } from "./classifyArticle";
import { calculateAtlasImpactScore } from "./impactScore";
import { getOtherMarkets, getPrimaryMarket } from "./primaryMarket";
import { relativeTimestamp } from "./relativeTimestamp";
import { scorePublisher } from "./sourceQuality";
import { buildWhyItMatters } from "./whyItMatters";

export type GNewsArticle = {
  title?: string;
  description?: string;
  content?: string;
  url?: string;
  image?: string;
  publishedAt?: string;
  source?: {
    name?: string;
    url?: string;
  };
};

const MAX_SUMMARY_LENGTH = 180;
const DEFAULT_FRESHNESS_HOURS = 48;
const MIN_RELEVANCE_SCORE = 4;

const irrelevantPatterns = [
  /promo\s*code/i,
  /bonus/i,
  /deposit/i,
  /free\s+bet/i,
  /bet\s+\$?\d+/i,
  /claim\s+bonus/i,
  /odds\s+boost/i,
  /boosted\s+odds/i,
  /sign\s*up\s+offer/i,
  /signup\s+offer/i,
  /casino/i,
  /sportsbook/i,
  /affiliate/i,
  /promotion/i,
  /commercial/i,
  /referral/i,
  /retrospective/i,
  /all-time/i,
  /history/i,
  /rankings?/i,
  /merchandise/i,
  /tickets?/i,
  /draft/i,
  /fanbases?/i,
  /all-star game/i,
  /home run derby/i,
  /dead at/i,
  /world cup legacy/i,
  /celebrity/i,
  /bobblehead/i,
  /giveaway/i,
  /recap/i,
  /opinion/i,
];

function stableArticleId(url: string, publishedAt: string) {
  return createHash("sha1").update(`${url}:${publishedAt}`).digest("hex").slice(0, 16);
}

function truncateSummary(description: string) {
  const normalized = description.replace(/\s+/g, " ").trim();

  if (normalized.length <= MAX_SUMMARY_LENGTH) return normalized;

  return `${normalized.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`;
}

function isFresh(publishedAt: string, now: Date, freshnessHours: number) {
  const published = new Date(publishedAt).getTime();
  if (!Number.isFinite(published)) return false;

  return now.getTime() - published <= freshnessHours * 60 * 60 * 1000;
}

function looksIrrelevant(title: string, description: string) {
  const text = `${title} ${description}`;
  return irrelevantPatterns.some((pattern) => pattern.test(text));
}

export function normalizeGNewsArticle(
  article: GNewsArticle,
  options: { now?: Date; freshnessHours?: number } = {},
): AtlasPulseItem | null {
  const now = options.now ?? new Date();
  const freshnessHours = options.freshnessHours ?? DEFAULT_FRESHNESS_HOURS;
  const title = article.title?.trim() ?? "";
  const description = article.description?.trim() ?? "";
  const url = article.url?.trim() ?? "";
  const publishedAt = article.publishedAt?.trim() ?? "";
  const source = article.source?.name?.trim() ?? "Original Publisher";

  if (!title || !description || !url || !publishedAt) return null;
  if (!isFresh(publishedAt, now, freshnessHours)) return null;
  if (looksIrrelevant(title, description)) return null;

  const classification = classifyMarketImpact({ title, description });
  if (classification.relevanceScore < MIN_RELEVANCE_SCORE) return null;
  const reliability = scorePublisher(source);
  const primaryMarket = getPrimaryMarket(classification.category, classification.markets);

  return {
    id: stableArticleId(url, publishedAt),
    sport: "MLB",
    title,
    summary: truncateSummary(description),
    impact: classification.impact,
    category: classification.category,
    markets: classification.markets,
    source,
    sourceUrl: url,
    publishedAt,
    timestampLabel: relativeTimestamp(publishedAt, now),
    imageUrl: article.image?.trim() || undefined,
    isLiveData: true,
    sources: [
      {
        name: source,
        url,
        publishedAt,
        reliability,
      },
    ],
    sourceCount: 1,
    whyItMatters: buildWhyItMatters({
      category: classification.category,
      markets: classification.markets,
    }),
    primaryMarket,
    otherMarkets: getOtherMarkets(primaryMarket, classification.markets),
    atlasImpactScore: calculateAtlasImpactScore({
      category: classification.category,
      impact: classification.impact,
      sourceCount: 1,
      topPublisherReliability: reliability,
    }),
    publisherReliability: reliability,
  };
}
