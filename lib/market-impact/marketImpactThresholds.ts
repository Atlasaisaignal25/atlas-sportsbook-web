export const MARKET_IMPACT_ENGINE_VERSION = "market_impact_v1";

function numberFromEnv(key: string, fallback: number) {
  const value = Number.parseFloat(process.env[key] ?? "");
  return Number.isFinite(value) ? value : fallback;
}

export const MARKET_IMPACT_THRESHOLDS = {
  moneyline: {
    minOddsDelta: numberFromEnv("MARKET_ML_MOVE_THRESHOLD", 15),
    mediumOddsDelta: 25,
    highOddsDelta: 35,
  },
  spread: {
    minLineDelta: numberFromEnv("MARKET_SPREAD_MOVE_THRESHOLD", 0.5),
    mediumLineDelta: 0.75,
    highLineDelta: 1,
    minOddsDelta: numberFromEnv("MARKET_ODDS_MOVE_THRESHOLD", 15),
    mediumOddsDelta: 25,
    highOddsDelta: 35,
  },
  totals: {
    minLineDelta: numberFromEnv("MARKET_TOTAL_MOVE_THRESHOLD", 0.5),
    mediumLineDelta: 0.75,
    highLineDelta: 1,
    minOddsDelta: numberFromEnv("MARKET_ODDS_MOVE_THRESHOLD", 15),
    mediumOddsDelta: 25,
    highOddsDelta: 35,
  },
  consensus: {
    windowMinutes: numberFromEnv("MARKET_CONSENSUS_WINDOW_MINUTES", 15),
    mediumPercent: numberFromEnv("MARKET_MEDIUM_CONSENSUS_PERCENT", 30),
    highPercent: numberFromEnv("MARKET_HIGH_CONSENSUS_PERCENT", 60),
  },
} as const;
