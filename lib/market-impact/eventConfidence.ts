import type { AtlasMarketMovement, AtlasSource } from "@/types/atlasEvent";

function hoursSince(value: string, now: Date) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 72;
  return Math.max((now.getTime() - timestamp) / (60 * 60 * 1000), 0);
}

export function calculateEventConfidence(input: {
  sources: AtlasSource[];
  providerCount: number;
  firstDetected: string;
  lastUpdated: string;
  articleAgreement?: number;
  marketMovement?: AtlasMarketMovement | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const sourceReliability =
    input.sources.length > 0
      ? input.sources.reduce((sum, source) => sum + source.reliability, 0) / input.sources.length
      : 70;
  const topReliability = input.sources.reduce(
    (top, source) => Math.max(top, source.reliability),
    sourceReliability,
  );
  const providerBoost = Math.min(Math.max(input.providerCount - 1, 0) * 6, 18);
  const agreementBoost = Math.min(Math.max((input.articleAgreement ?? input.sources.length) - 1, 0) * 6, 18);
  const movementBoost = input.marketMovement
    ? Math.min(input.marketMovement.consensusPercent * 16 + Math.max(input.marketMovement.sportsbookCount - 1, 0) * 4, 20)
    : 0;
  const freshnessHours = hoursSince(input.lastUpdated || input.firstDetected, now);
  const freshnessBoost = freshnessHours <= 2 ? 8 : freshnessHours <= 12 ? 5 : freshnessHours <= 36 ? 2 : -5;
  const score =
    sourceReliability * 0.55 +
    topReliability * 0.25 +
    providerBoost +
    agreementBoost +
    movementBoost +
    freshnessBoost;

  return Math.min(Math.max(Math.round(score), 0), 100);
}
