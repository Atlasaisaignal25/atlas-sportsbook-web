import type { PulseCategory, PulseImpact, PulseMarket } from "@/types/marketImpact";

type Classification = {
  impact: PulseImpact;
  category: PulseCategory;
  markets: PulseMarket[];
  relevanceScore: number;
};

const highPhrases = [
  "ruled out",
  "scratched",
  "will not start",
  "starting pitcher change",
  "new starting pitcher",
  "placed on injured list",
  "suspended",
  "postponed",
  "severe weather",
  "closer unavailable",
  "line moved",
  "odds shifted",
  "late lineup change",
];

const mediumPhrases = [
  "questionable",
  "game-time decision",
  "limited",
  "pitch count",
  "day-to-day",
  "activated",
  "bullpen workload",
  "wind",
  "expected lineup",
  "roster move",
  "called up",
];

const lowPhrases = [
  "probable",
  "expected to play",
  "available",
  "no limitations",
  "minor",
  "routine rest",
];

const irrelevantPhrases = [
  "recap",
  "opinion",
  "history",
  "historic",
  "retrospective",
  "ranking",
  "rankings",
  "merchandise",
  "tickets",
  "ticket",
  "celebrity",
  "bobblehead",
  "giveaway",
  "rumors with no",
];

function includesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function scorePhrases(text: string, title: string, phrases: string[], weight: number) {
  return phrases.reduce((score, phrase) => {
    if (!text.includes(phrase)) return score;
    return score + weight + (title.includes(phrase) ? weight : 0);
  }, 0);
}

function detectCategory(text: string): PulseCategory {
  if (/(starting pitcher|new starting pitcher|will not start|pitcher change|starter changed)/.test(text)) {
    return "STARTING_PITCHER";
  }

  if (/(lineup|scratched|will not start|batting order|confirmed lineup)/.test(text)) {
    return "LINEUP";
  }

  if (/(injury|injured|injured list|il\b|ruled out|questionable|day-to-day|probable|limited)/.test(text)) {
    return "INJURY";
  }

  if (/(bullpen|closer|reliever|relief|pitch count)/.test(text)) {
    return "BULLPEN";
  }

  if (/(weather|wind|rain|storm|postponed|delay|severe weather)/.test(text)) {
    return "WEATHER";
  }

  if (/(roster|called up|optioned|activated|placed on injured list)/.test(text)) {
    return "ROSTER";
  }

  if (/(trade|transaction|acquired|designated for assignment|dfa)/.test(text)) {
    return "TRANSACTION";
  }

  if (/(suspended|suspension|discipline)/.test(text)) {
    return "SUSPENSION";
  }

  if (/(odds|betting|moneyline|total|run line|line moved|odds shifted|market)/.test(text)) {
    return "MARKET";
  }

  return "GENERAL";
}

function marketsForCategory(category: PulseCategory): PulseMarket[] {
  switch (category) {
    case "INJURY":
      return ["Moneyline", "Run Line", "Team Total", "Player Props"];
    case "LINEUP":
      return ["Moneyline", "Team Total", "Player Props"];
    case "STARTING_PITCHER":
      return ["Moneyline", "Run Line", "Total", "First Five", "Player Props"];
    case "BULLPEN":
      return ["Moneyline", "Total", "Live Market"];
    case "WEATHER":
      return ["Total", "Team Total", "First Five"];
    case "ROSTER":
    case "TRANSACTION":
      return ["Moneyline", "Player Props"];
    case "SUSPENSION":
      return ["Moneyline", "Run Line", "Team Total", "Player Props"];
    case "MARKET":
      return ["Moneyline", "Run Line", "Total", "Live Market"];
    default:
      return ["Moneyline"];
  }
}

export function classifyMarketImpact(input: {
  title: string;
  description?: string;
}): Classification {
  const title = input.title.toLowerCase();
  const description = (input.description ?? "").toLowerCase();
  const combined = `${title} ${description}`;

  let relevanceScore = 0;
  relevanceScore += scorePhrases(combined, title, highPhrases, 5);
  relevanceScore += scorePhrases(combined, title, mediumPhrases, 3);
  relevanceScore += scorePhrases(combined, title, lowPhrases, 1);

  if (/(mlb|major league baseball|baseball)/.test(combined)) relevanceScore += 1;
  if (/(odds|betting|moneyline|total|run line|market)/.test(combined)) relevanceScore += 2;

  irrelevantPhrases.forEach((phrase) => {
    if (combined.includes(phrase)) relevanceScore -= title.includes(phrase) ? 6 : 3;
  });

  const category = detectCategory(combined);
  if (category !== "GENERAL") relevanceScore += 2;

  let impact: PulseImpact = "LOW";
  if (includesAny(combined, highPhrases) || relevanceScore >= 9) {
    impact = "HIGH";
  } else if (includesAny(combined, mediumPhrases) || relevanceScore >= 5) {
    impact = "MEDIUM";
  } else if (includesAny(combined, lowPhrases)) {
    impact = "LOW";
  }

  return {
    impact,
    category,
    markets: marketsForCategory(category),
    relevanceScore,
  };
}
