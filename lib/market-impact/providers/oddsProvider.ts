import type { AtlasEvent, AtlasMarketMovement } from "@/types/atlasEvent";
import type { ConsensusMovement, OddsSnapshot } from "@/types/oddsMovement";
import { calculateOddsMovement } from "@/lib/market-impact/odds/calculateOddsMovement";
import { buildConsensusMovement } from "@/lib/market-impact/odds/buildConsensusMovement";
import {
  getLatestSnapshotsForSport,
  getRecentSnapshots,
  insertSnapshotsDeduped,
} from "@/lib/market-impact/odds/snapshotRepository";
import { calculateAtlasImpactScore } from "@/lib/market-impact/impactScore";
import { buildWhyItMatters } from "@/lib/market-impact/whyItMatters";
import { formatAmericanPrice, formatPoint } from "@/lib/market-impact/odds/oddsConversion";
import { calculateEventConfidence } from "@/lib/market-impact/eventConfidence";

type OddsOutcome = {
  name?: string;
  price?: number;
  point?: number;
};

type OddsMarket = {
  key?: string;
  outcomes?: OddsOutcome[];
};

type OddsBookmaker = {
  key?: string;
  title?: string;
  markets?: OddsMarket[];
};

export type OddsGame = {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: OddsBookmaker[];
};

export type OddsProviderHealth = {
  ok: boolean;
  error?: string;
  requestsRemaining?: string | null;
  requestsUsed?: string | null;
  requestsCost?: string | null;
};

export type OddsSnapshotResult = {
  ok: boolean;
  health: OddsProviderHealth;
  snapshotsCaptured: number;
  snapshotsInserted: number;
  snapshotsSkipped: number;
  movementsDetected: number;
  events: AtlasEvent[];
};

const ODDS_API_MLB_SPORT_KEY = "baseball_mlb";
const ODDS_MARKETS = ["h2h", "spreads", "totals"] as const;

function fetchUrl(apiKey: string) {
  const params = new URLSearchParams({
    apiKey,
    regions: "us",
    markets: ODDS_MARKETS.join(","),
    oddsFormat: "american",
  });

  return `https://api.the-odds-api.com/v4/sports/${ODDS_API_MLB_SPORT_KEY}/odds/?${params.toString()}`;
}

function normalizeBookmakerName(bookmaker: OddsBookmaker) {
  return bookmaker.title?.trim() || bookmaker.key?.trim() || "Sportsbook";
}

function normalizeBookmakerKey(bookmaker: OddsBookmaker) {
  return bookmaker.key?.trim() || normalizeBookmakerName(bookmaker).toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export async function fetchCurrentMlbOdds(apiKey: string) {
  const response = await fetch(fetchUrl(apiKey), { cache: "no-store" });
  const health: OddsProviderHealth = {
    ok: response.ok,
    requestsRemaining: response.headers.get("x-requests-remaining"),
    requestsUsed: response.headers.get("x-requests-used"),
    requestsCost: response.headers.get("x-requests-last"),
  };

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`The Odds API returned ${response.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
  }

  const data = (await response.json()) as OddsGame[];
  return { games: Array.isArray(data) ? data : [], health };
}

export function normalizeOddsSnapshots(games: OddsGame[], capturedAt = new Date().toISOString()) {
  const snapshots: OddsSnapshot[] = [];
  const monitoredSportsbookCountByEvent = new Map<string, number>();

  games.forEach((game) => {
    const eventId = game.id?.trim();
    const commenceTime = game.commence_time?.trim();
    const homeTeam = game.home_team?.trim();
    const awayTeam = game.away_team?.trim();
    if (!eventId || !commenceTime || !homeTeam || !awayTeam) return;

    const bookmakers = game.bookmakers ?? [];
    monitoredSportsbookCountByEvent.set(eventId, bookmakers.length);

    bookmakers.forEach((bookmaker) => {
      const bookmakerName = normalizeBookmakerName(bookmaker);
      const bookmakerKey = normalizeBookmakerKey(bookmaker);

      (bookmaker.markets ?? []).forEach((market) => {
        if (!ODDS_MARKETS.includes(market.key as OddsSnapshot["marketKey"])) return;

        (market.outcomes ?? []).forEach((outcome) => {
          if (!outcome.name || typeof outcome.price !== "number") return;

          snapshots.push({
            sport: "MLB",
            eventId,
            commenceTime,
            homeTeam,
            awayTeam,
            bookmaker: bookmakerName,
            bookmakerKey,
            bookmakerName,
            marketKey: market.key as OddsSnapshot["marketKey"],
            outcomeName: outcome.name,
            point: typeof outcome.point === "number" ? outcome.point : undefined,
            price: outcome.price,
            capturedAt,
          });
        });
      });
    });
  });

  return { snapshots, monitoredSportsbookCountByEvent };
}

function marketLabel(marketKey: ConsensusMovement["marketKey"]): AtlasMarketMovement["marketLabel"] {
  if (marketKey === "spreads") return "Run Line";
  if (marketKey === "totals") return "Total";
  return "Moneyline";
}

function matchupLabel(movement: ConsensusMovement) {
  return `${movement.awayTeam} vs ${movement.homeTeam}`;
}

function movementTitle(movement: ConsensusMovement) {
  const label = marketLabel(movement.marketKey);
  const matchup = matchupLabel(movement);
  if (movement.marketKey === "totals") return `${matchup}: Total Market Moving`;
  if (movement.marketKey === "spreads") return `${matchup}: Run Line Moving`;
  return `${matchup}: ${movement.outcomeName} ${label} Moving`;
}

function movementSummary(movement: ConsensusMovement) {
  const label = marketLabel(movement.marketKey);
  const matchup = matchupLabel(movement);
  const pointText =
    movement.previousPoint !== undefined || movement.currentPoint !== undefined
      ? `${formatPoint(movement.previousPoint) ?? "N/A"} to ${formatPoint(movement.currentPoint) ?? "N/A"}`
      : `${formatAmericanPrice(movement.previousPrice)} to ${formatAmericanPrice(movement.currentPrice)}`;

  return `Possible market reaction detected for ${matchup}: ${movement.outcomeName} ${label} moved from ${pointText} across ${movement.sportsbookCount} sportsbook${movement.sportsbookCount === 1 ? "" : "s"}.`;
}

function timelineSummary(movement: ConsensusMovement) {
  const label = marketLabel(movement.marketKey).toLowerCase();
  const matchup = matchupLabel(movement);
  const value =
    movement.previousPoint !== undefined || movement.currentPoint !== undefined
      ? `${formatPoint(movement.previousPoint) ?? "N/A"} to ${formatPoint(movement.currentPoint) ?? "N/A"}`
      : `${formatAmericanPrice(movement.previousPrice)} to ${formatAmericanPrice(movement.currentPrice)}`;

  return `${matchup}: ${movement.outcomeName} ${label} moved from ${value} across ${movement.sportsbookCount} sportsbook${movement.sportsbookCount === 1 ? "" : "s"} in ${movement.elapsedMinutes} minutes.`;
}

export function atlasEventFromConsensusMovement(movement: ConsensusMovement): AtlasEvent {
  const markets = movement.marketKey === "totals" ? ["Total"] as const : movement.marketKey === "spreads" ? ["Run Line"] as const : ["Moneyline"] as const;
  const atlasImpactScore = calculateAtlasImpactScore({
    category: "MARKET",
    impact: movement.impact,
    sourceCount: movement.sportsbookCount,
    topPublisherReliability: 96,
  });
  const firstDetected = movement.movementStartedAt;
  const lastUpdated = movement.detectedAt;
  const sources = [
    {
      name: "Atlas Market Scan",
      url: "",
      publishedAt: movement.detectedAt,
      reliability: 96,
      provider: "OddsAPI" as const,
    },
  ];
  const marketMovement: AtlasMarketMovement = {
    marketKey: movement.marketKey,
    marketLabel: markets[0],
    outcomeName: movement.outcomeName,
    homeTeam: movement.homeTeam,
    awayTeam: movement.awayTeam,
    commenceTime: movement.commenceTime,
    previousPoint: movement.previousPoint,
    currentPoint: movement.currentPoint,
    previousPrice: movement.previousPrice,
    currentPrice: movement.currentPrice,
    pointDelta: movement.pointDelta,
    impliedProbabilityDelta: movement.impliedProbabilityDelta,
    sportsbookCount: movement.sportsbookCount,
    monitoredSportsbookCount: movement.monitoredSportsbookCount,
    consensusPercent: movement.consensusPercent,
    movementStartedAt: movement.movementStartedAt,
    detectedAt: movement.detectedAt,
    elapsedMinutes: movement.elapsedMinutes,
    status: movement.status,
  };
  const confidence = calculateEventConfidence({
    sources,
    providerCount: 1,
    firstDetected,
    lastUpdated,
    articleAgreement: movement.sportsbookCount,
    marketMovement,
  });

  return {
    id: `odds-event-${movement.id.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 88)}`,
    title: movementTitle(movement),
    sport: "MLB",
    category: "MARKET",
    impact: movement.impact,
    atlasImpactScore,
    primaryMarket: markets[0],
    secondaryMarkets: [],
    whyItMatters: buildWhyItMatters({ category: "MARKET", markets: [...markets] }),
    sources,
    timeline: [
      {
        timestamp: movement.detectedAt,
        provider: "OddsAPI",
        eventType: "MARKET_MOVEMENT",
        summary: timelineSummary(movement),
      },
    ],
    firstDetected,
    lastUpdated,
    confidence,
    providerCount: 1,
    isResolved: false,
    summary: movementSummary(movement),
    team: movement.outcomeName,
    isLiveData: true,
    markets: [...markets],
    otherMarkets: [],
    source: "Atlas Market Scan",
    sourceUrl: "",
    publishedAt: lastUpdated,
    timestampLabel: "Just now",
    sourceCount: 1,
    publisherReliability: 96,
    groupedEventKey: `MARKET:${movement.eventId}:${movement.marketKey}:${movement.outcomeName}`,
    marketMovement,
  };
}

export async function captureMlbOddsSnapshot(apiKey: string): Promise<OddsSnapshotResult> {
  const capturedAt = new Date().toISOString();
  const { games, health } = await fetchCurrentMlbOdds(apiKey);
  const { snapshots, monitoredSportsbookCountByEvent } = normalizeOddsSnapshots(games, capturedAt);
  const previousSnapshots = await getLatestSnapshotsForSport("MLB");
  const movements = snapshots
    .map((snapshot) => {
      const key = [snapshot.eventId, snapshot.bookmaker, snapshot.marketKey, snapshot.outcomeName].join(":");
      return calculateOddsMovement(previousSnapshots.get(key) ?? null, snapshot);
    })
    .filter((movement): movement is NonNullable<typeof movement> => Boolean(movement));
  const consensus = buildConsensusMovement({ movements, monitoredSportsbookCountByEvent, now: new Date(capturedAt) });
  const writeResult = await insertSnapshotsDeduped(snapshots);

  return {
    ok: true,
    health,
    snapshotsCaptured: snapshots.length,
    snapshotsInserted: writeResult.inserted,
    snapshotsSkipped: writeResult.skipped,
    movementsDetected: consensus.length,
    events: consensus.map(atlasEventFromConsensusMovement),
  };
}

export async function getRecentOddsMovementEvents() {
  const snapshots = await getRecentSnapshots("MLB", 90);
  const byKey = new Map<string, OddsSnapshot[]>();

  snapshots.forEach((snapshot) => {
    const key = [snapshot.eventId, snapshot.bookmaker, snapshot.marketKey, snapshot.outcomeName].join(":");
    byKey.set(key, [...(byKey.get(key) ?? []), snapshot]);
  });

  const eventBookCounts = new Map<string, number>();
  const eventBooks = new Map<string, Set<string>>();
  snapshots.forEach((snapshot) => {
    const books = eventBooks.get(snapshot.eventId) ?? new Set<string>();
    books.add(snapshot.bookmaker);
    eventBooks.set(snapshot.eventId, books);
  });
  eventBooks.forEach((books, eventId) => eventBookCounts.set(eventId, books.size));

  const movements = [...byKey.values()]
    .map((group) => group.sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()))
    .map((group) => {
      if (group.length < 2) return null;
      return calculateOddsMovement(group[group.length - 2] ?? null, group[group.length - 1]);
    })
    .filter((movement): movement is NonNullable<typeof movement> => Boolean(movement));
  const consensus = buildConsensusMovement({ movements, monitoredSportsbookCountByEvent: eventBookCounts });

  return consensus.map(atlasEventFromConsensusMovement);
}
