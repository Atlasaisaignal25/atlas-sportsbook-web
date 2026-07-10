import type { PulseCategory, PulseMarket } from "@/types/marketImpact";
import { getPrimaryMarket } from "./primaryMarket";

export function buildWhyItMatters(input: {
  category: PulseCategory;
  markets: PulseMarket[];
}) {
  const primary = getPrimaryMarket(input.category, input.markets);

  switch (input.category) {
    case "STARTING_PITCHER":
      return "This change may significantly affect Moneyline, First Five and Total markets.";
    case "LINEUP":
      return "Lineup changes may affect Moneyline, Team Total and Player Props.";
    case "INJURY":
      return "Player availability may affect Moneyline, Team Total and Player Props.";
    case "WEATHER":
      return "Wind conditions may influence run production and total markets.";
    case "BULLPEN":
      return "Bullpen availability may affect late-game performance and live markets.";
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
