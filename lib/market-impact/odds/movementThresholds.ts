export const MLB_ODDS_MOVEMENT_THRESHOLDS = {
  recentWindowMinutes: 30,
  moneyline: {
    lowImpliedProbabilityDelta: 0.015,
    mediumImpliedProbabilityDelta: 0.03,
    highImpliedProbabilityDelta: 0.05,
    lowPriceDelta: 8,
  },
  spreads: {
    lowImpliedProbabilityDelta: 0.015,
    mediumPointDelta: 0.5,
    highPointDelta: 1,
  },
  totals: {
    lowImpliedProbabilityDelta: 0.015,
    mediumPointDelta: 0.5,
    highPointDelta: 1,
  },
  consensus: {
    mediumSportsbooks: 2,
    highConsensusPercent: 0.5,
    extremeMagnitudeScore: 90,
  },
} as const;
