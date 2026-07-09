import type { PulseCategory, PulseMarket } from "@/types/marketImpact";
import { getPrimaryMarket } from "./primaryMarket";

export function buildWhyItMatters(input: {
  category: PulseCategory;
  markets: PulseMarket[];
}) {
  const primary = getPrimaryMarket(input.category, input.markets);

  switch (input.category) {
    case "STARTING_PITCHER":
      return "Starting pitcher changes often influence Moneyline, First Five and Total markets.";
    case "LINEUP":
      return "A missing offensive player may reduce run production and affect Team Totals and Moneyline.";
    case "INJURY":
      return "Player availability can shift team strength and affect props, totals and Moneyline.";
    case "WEATHER":
      return "Weather can change run expectations and increase total market volatility.";
    case "BULLPEN":
      return "Heavy bullpen usage may affect late-game performance and live markets.";
    case "ROSTER":
    case "TRANSACTION":
      return "Roster changes may affect team strength and market perception.";
    case "SUSPENSION":
      return "Suspensions can reduce lineup strength and affect team markets.";
    case "MARKET":
      return "Market movement can signal changing expectations worth monitoring.";
    default:
      return `${primary} may be the first market to monitor for this update.`;
  }
}
