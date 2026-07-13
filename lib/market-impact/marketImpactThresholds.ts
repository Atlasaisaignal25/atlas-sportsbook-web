export const MARKET_IMPACT_ENGINE_VERSION = "market_impact_v1";

export const MARKET_IMPACT_THRESHOLDS = {
  moneyline: {
    minOddsDelta: 15,
    mediumOddsDelta: 25,
    highOddsDelta: 35,
  },
  spread: {
    minLineDelta: 0.5,
    mediumLineDelta: 0.75,
    highLineDelta: 1,
    minOddsDelta: 15,
    mediumOddsDelta: 25,
    highOddsDelta: 35,
  },
  totals: {
    minLineDelta: 0.5,
    mediumLineDelta: 0.75,
    highLineDelta: 1,
    minOddsDelta: 15,
    mediumOddsDelta: 25,
    highOddsDelta: 35,
  },
} as const;
