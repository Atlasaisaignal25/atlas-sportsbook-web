import crypto from "crypto";
import { teamBranding } from "@/app/lib/teamBranding";
import type { GNewsArticle } from "@/lib/market-impact/normalizeGNewsArticle";
import type {
  TeamImpactConfidence,
  TeamImpactEvent,
  TeamImpactEventType,
  TeamImpactSport,
} from "@/types/teamImpact";

type GNewsResponse = {
  articles?: GNewsArticle[];
};

const teamImpactSports: TeamImpactSport[] = ["MLB", "NBA", "NFL", "NHL", "SOCCER"];

const sportQueries: Record<TeamImpactSport, string> = {
  MLB: '(MLB OR baseball) ("starting pitcher" OR lineup OR scratched OR "placed on IL" OR activated OR bullpen OR questionable OR injury)',
  NBA: '(NBA OR basketball) ("starting lineup" OR "minutes restriction" OR questionable OR "ruled out" OR activated OR injury)',
  NFL: '(NFL OR football) ("starting QB" OR "injury report" OR inactive OR active OR "starter out")',
  NHL: '(NHL OR hockey) ("starting goalie" OR "line changes" OR "defense pair" OR scratched OR injury OR "player out")',
  SOCCER: '(soccer OR football) ("starting XI" OR injury OR suspension OR "player out" OR formation)',
};

const ignoredTerms = [
  "recap",
  "power ranking",
  "fantasy",
  "tickets",
  "merchandise",
  "jersey",
  "opinion",
  "rumors roundup",
  "highlights",
  "mock draft",
  "government",
  "minister",
  "parliament",
  "election",
  "court",
  "gaza",
  "israel",
];

const ignoredSources = ["Middle East Monitor"];

const eventRules: Record<TeamImpactSport, Array<{ eventType: TeamImpactEventType; terms: string[] }>> = {
  MLB: [
    { eventType: "Starting Pitcher Change", terms: ["starting pitcher change", "starter changed", "will start instead", "scratched from start"] },
    { eventType: "Bullpen Change", terms: ["bullpen", "reliever unavailable", "closer unavailable", "available out of the bullpen"] },
    { eventType: "Lineup Confirmed", terms: ["lineup confirmed", "starting lineup", "batting order"] },
    { eventType: "Player Scratched", terms: ["scratched", "late scratch"] },
    { eventType: "Player Out", terms: ["ruled out", "will not play", "out of the lineup"] },
    { eventType: "Player Questionable", terms: ["questionable", "day-to-day", "game-time decision"] },
    { eventType: "Player Activated", terms: ["activated", "reinstated"] },
    { eventType: "Player Placed on IL", terms: ["placed on il", "injured list", "placed on the il"] },
  ],
  NBA: [
    { eventType: "Starting Lineup Change", terms: ["starting lineup", "lineup change", "will start"] },
    { eventType: "Player Out", terms: ["ruled out", "will not play", "out against"] },
    { eventType: "Player Questionable", terms: ["questionable", "game-time decision", "probable"] },
    { eventType: "Minutes Restriction", terms: ["minutes restriction", "limited minutes", "minute limit"] },
    { eventType: "Player Activated", terms: ["activated", "available to play", "cleared to play"] },
  ],
  NFL: [
    { eventType: "Starting QB Change", terms: ["starting qb", "quarterback change", "will start at quarterback"] },
    { eventType: "Injury Report", terms: ["injury report", "questionable", "doubtful", "probable"] },
    { eventType: "Starter Out", terms: ["starter out", "ruled out", "will not play"] },
    { eventType: "Active / Inactive List", terms: ["inactive", "active list", "inactive list"] },
  ],
  NHL: [
    { eventType: "Starting Goalie Change", terms: ["starting goalie", "goalie change", "in net"] },
    { eventType: "Line Changes", terms: ["line changes", "line combinations", "forward lines"] },
    { eventType: "Defense Pair Changes", terms: ["defense pair", "defensive pair", "blue line"] },
    { eventType: "Player Out", terms: ["ruled out", "will not play", "out against", "scratched"] },
  ],
  SOCCER: [
    { eventType: "Starting XI", terms: ["starting xi", "lineup announced", "starting lineup"] },
    { eventType: "Injury", terms: ["injury", "injured", "fitness test"] },
    { eventType: "Suspension", terms: ["suspended", "suspension", "red card ban"] },
    { eventType: "Player Out", terms: ["ruled out", "will miss", "unavailable"] },
    { eventType: "Formation Change", terms: ["formation change", "switch formation", "formation"] },
  ],
};

const highConfidenceTerms = ["official", "confirmed", "announced", "lineup confirmed", "activated", "placed on il", "ruled out"];
const lowConfidenceTerms = ["rumor", "could", "may", "unconfirmed", "expected to", "reportedly"];

function nyDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function isTodayInNewYork(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  return nyDateKey(date) === nyDateKey(new Date());
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trim()}…`;
}

function findEventType(sport: TeamImpactSport, text: string): TeamImpactEventType | null {
  const normalized = normalize(text);

  for (const rule of eventRules[sport]) {
    if (rule.terms.some((term) => normalized.includes(normalize(term)))) {
      return rule.eventType;
    }
  }

  return null;
}

function confidenceFromText(text: string, source: string): TeamImpactConfidence {
  const normalized = normalize(`${text} ${source}`);
  if (highConfidenceTerms.some((term) => normalized.includes(normalize(term)))) return "HIGH";
  if (lowConfidenceTerms.some((term) => normalized.includes(normalize(term)))) return "LOW";
  return "MEDIUM";
}

function logoSportSegment(sport: TeamImpactSport) {
  return sport === "SOCCER" ? "/soccer/" : `/${sport.toLowerCase()}/`;
}

function teamMatchesForText(text: string, sport: TeamImpactSport) {
  const normalized = normalize(text);
  const matches = Object.keys(teamBranding)
    .filter((team) => teamBranding[team].logo.includes(logoSportSegment(sport)))
    .filter((team) => normalized.includes(normalize(team)) || normalized.includes(normalize(teamBranding[team].shortName)))
  const byLogo = new Map<string, string>();

  for (const team of matches) {
    if (!byLogo.has(teamBranding[team].logo)) byLogo.set(teamBranding[team].logo, team);
  }

  return [...byLogo.values()].slice(0, 2);
}

function extractPlayerName(text: string, teams: string[]) {
  const title = text.split(/[.:|–-]/)[0].trim();
  const cleaned = teams.reduce((current, team) => current.replace(new RegExp(team, "gi"), ""), title);
  const match = cleaned.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,2})\b/);
  return match?.[1] ?? null;
}

function impactForEvent(eventType: TeamImpactEventType, sport: TeamImpactSport) {
  if (eventType.includes("Pitcher") || eventType.includes("QB") || eventType.includes("Goalie") || eventType.includes("Scratched")) {
    return "Core starter news can materially shift win probability and pregame validation.";
  }

  if (eventType.includes("Lineup") || eventType.includes("Starting XI") || eventType.includes("Formation")) {
    return "Confirmed team structure improves context certainty for today’s matchup.";
  }

  if (eventType.includes("Out") || eventType.includes("IL") || eventType.includes("Suspension")) {
    return "Player availability changes can affect team strength and market confidence.";
  }

  if (eventType.includes("Bullpen")) {
    return "Bullpen availability can affect late-game risk and run prevention context.";
  }

  return `${sport} team news that may affect game readiness and market context.`;
}

function titleForEvent(eventType: TeamImpactEventType, team: string | null, player: string | null) {
  if (player && team) return `${team}: ${player} · ${eventType}`;
  if (team) return `${team}: ${eventType}`;
  return eventType;
}

function eventHash(parts: string[]) {
  return crypto.createHash("sha256").update(parts.map((part) => normalize(part)).join("|")).digest("hex").slice(0, 32);
}

export async function fetchGNewsTeamImpactArticles(input: {
  apiKey: string;
  sport: TeamImpactSport;
  limit?: number;
}) {
  const params = new URLSearchParams({
    q: sportQueries[input.sport],
    lang: "en",
    max: String(Math.min(Math.max(input.limit ?? 50, 1), 50)),
    sortby: "publishedAt",
    apikey: input.apiKey,
  });

  const response = await fetch(`https://gnews.io/api/v4/search?${params.toString()}`, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`GNews Team Impact returned ${response.status}`);
  }

  const data = (await response.json()) as GNewsResponse;
  return data.articles ?? [];
}

export function classifyTeamImpactArticle(article: GNewsArticle, sport: TeamImpactSport): TeamImpactEvent | null {
  const publishedAt = article.publishedAt || new Date().toISOString();
  if (!isTodayInNewYork(publishedAt)) return null;

  const source = article.source?.name || "GNews";
  if (ignoredSources.some((ignored) => normalize(source) === normalize(ignored))) return null;

  const text = [article.title, article.description, article.content].filter(Boolean).join(" ");
  const normalized = normalize(text);
  if (!text || ignoredTerms.some((term) => normalized.includes(normalize(term)))) return null;

  const eventType = findEventType(sport, text);
  if (!eventType) return null;

  const teams = teamMatchesForText(text, sport);
  if (teams.length === 0) return null;

  const playerName = extractPlayerName(article.title ?? text, teams);
  const homeTeam = teams[1] ?? null;
  const awayTeam = teams[0] ?? teams[1] ?? null;
  const primaryTeam = teams[0] ?? null;
  const confidence = confidenceFromText(text, source);
  const why = truncate(article.description || article.title || `${eventType} detected.`, 150);
  const impact = truncate(impactForEvent(eventType, sport), 150);

  return {
    sport,
    eventId: eventHash([sport, eventType, primaryTeam ?? "", playerName ?? "", source, article.title ?? "", publishedAt.slice(0, 10)]),
    homeTeam,
    awayTeam,
    playerName,
    eventType,
    confidence,
    why,
    impact,
    publishedAt,
    source,
    sourceUrl: article.url ?? null,
    status: "ACTIVE",
  };
}

export async function discoverTeamImpactEvents(input: {
  apiKey: string;
  sport?: TeamImpactSport | "ALL";
  limit?: number;
}) {
  const sports = input.sport && input.sport !== "ALL" ? [input.sport] : teamImpactSports;
  const articlesBySport = await Promise.all(
    sports.map(async (sport) => ({
      sport,
      articles: await fetchGNewsTeamImpactArticles({ apiKey: input.apiKey, sport, limit: 50 }),
    })),
  );

  const events = articlesBySport.flatMap(({ sport, articles }) =>
    articles
      .map((article) => classifyTeamImpactArticle(article, sport))
      .filter((event): event is TeamImpactEvent => Boolean(event)),
  );
  const unique = new Map<string, TeamImpactEvent>();

  for (const event of events) {
    unique.set(event.eventId, event);
  }

  return [...unique.values()]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, input.limit ?? 50);
}

export function isTeamImpactSport(value: string): value is TeamImpactSport {
  return teamImpactSports.includes(value as TeamImpactSport);
}
