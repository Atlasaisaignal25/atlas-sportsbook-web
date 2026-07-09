import type { PulseCategory, PulseMarket } from "@/types/marketImpact";

const categoryPrimaryMarket: Record<PulseCategory, PulseMarket> = {
  INJURY: "Moneyline",
  LINEUP: "Team Total",
  STARTING_PITCHER: "First Five",
  BULLPEN: "Live Market",
  WEATHER: "Total",
  ROSTER: "Moneyline",
  TRANSACTION: "Moneyline",
  SUSPENSION: "Moneyline",
  MARKET: "Moneyline",
  GENERAL: "Moneyline",
};

export function getPrimaryMarket(category: PulseCategory, markets: PulseMarket[]) {
  const preferred = categoryPrimaryMarket[category];
  return markets.includes(preferred) ? preferred : markets[0] ?? "Moneyline";
}

export function getOtherMarkets(primaryMarket: PulseMarket, markets: PulseMarket[]) {
  return markets.filter((market) => market !== primaryMarket);
}
