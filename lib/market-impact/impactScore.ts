import type { PulseCategory, PulseImpact } from "@/types/marketImpact";

const baseScoreByCategory: Record<PulseCategory, number> = {
  STARTING_PITCHER: 96,
  INJURY: 90,
  BULLPEN: 88,
  LINEUP: 84,
  WEATHER: 76,
  SUSPENSION: 88,
  ROSTER: 66,
  TRANSACTION: 64,
  MARKET: 78,
  GENERAL: 32,
};

const impactAdjustment: Record<PulseImpact, number> = {
  HIGH: 6,
  MEDIUM: 0,
  LOW: -12,
};

export function calculateAtlasImpactScore(input: {
  category: PulseCategory;
  impact: PulseImpact;
  sourceCount?: number;
  topPublisherReliability?: number;
}) {
  const sourceBoost = Math.min(Math.max((input.sourceCount ?? 1) - 1, 0) * 2, 8);
  const qualityBoost = input.topPublisherReliability && input.topPublisherReliability >= 95 ? 3 : 0;
  const score =
    baseScoreByCategory[input.category] +
    impactAdjustment[input.impact] +
    sourceBoost +
    qualityBoost;

  return Math.min(Math.max(Math.round(score), 20), 100);
}
