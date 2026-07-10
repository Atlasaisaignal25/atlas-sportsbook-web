import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  buildConsensusMovementFromSnapshots,
  buildMarketMovementFeatureMap,
} from "@/app/lib/mlb-engine/marketFeatures";
import {
  buildMlbSportsProjection,
  buildUnavailableMlbSportsIntelligenceFeatures,
  getMlbOfficialPitcherProviderWhenEnabled,
  getMlbSportsIntelligenceFeatures,
  getMlbSportsIntelligenceFlags,
  unavailableMlbSportsIntelligenceProvider,
  type MlbGameContext,
  type MlbOfficialPitcherProviderHealth,
  type MlbSportsIntelligenceFeatures,
} from "@/app/lib/mlb-engine/sports-intelligence";
import { getRecentSnapshots, getSnapshotStatus } from "@/lib/market-impact/odds/snapshotRepository";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

async function recentPublicRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_public_signals")
    .select("date,game_id,away_team,home_team,pick,market,line,odds,status,start_time")
    .order("date", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

async function recentTop5Rows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_top5_live")
    .select("date,rank,game_id,away_team,home_team,pick,market,line,odds,status,is_top_signal,start_time")
    .order("date", { ascending: false })
    .order("rank", { ascending: true })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

function auditContextFromRows(publicSignals: any[], liveTop5: any[]): MlbGameContext {
  const row = publicSignals[0] ?? liveTop5[0] ?? {};

  return {
    eventId: String(row.game_id ?? "audit-context-unavailable"),
    homeTeam: String(row.home_team ?? ""),
    awayTeam: String(row.away_team ?? ""),
    commenceTime: String(row.start_time ?? new Date().toISOString()),
    currentTime: new Date().toISOString(),
    marketKeys: ["h2h", "spreads", "totals"],
  };
}

function auditContextsFromRows(publicSignals: any[], liveTop5: any[], eventId?: string | null) {
  const rowsById = new Map<string, any>();

  [...publicSignals, ...liveTop5].forEach((row) => {
    const gameId = String(row.game_id ?? "");
    if (!gameId || rowsById.has(gameId)) return;
    rowsById.set(gameId, row);
  });

  const rows = eventId
    ? Array.from(rowsById.values()).filter((row) => String(row.game_id ?? "") === eventId)
    : Array.from(rowsById.values()).slice(0, 3);

  return rows.map((row): MlbGameContext => ({
    eventId: String(row.game_id ?? "audit-context-unavailable"),
    homeTeam: String(row.home_team ?? ""),
    awayTeam: String(row.away_team ?? ""),
    commenceTime: String(row.start_time ?? new Date().toISOString()),
    currentTime: new Date().toISOString(),
    marketKeys: ["h2h", "spreads", "totals"],
  }));
}

function sportsIntelligenceAuditSummary(input: {
  enabled: boolean;
  provider: string;
  features: MlbSportsIntelligenceFeatures;
  health?: MlbOfficialPitcherProviderHealth | null;
}) {
  const projection = buildMlbSportsProjection(input.features);

  return {
    enabled: input.enabled,
    provider: input.provider,
    overallAvailability: input.features.overallAvailability,
    availableModuleCount: input.features.availableModuleCount,
    totalModuleCount: input.features.totalModuleCount,
    pitcherAvailability: input.features.startingPitcher.metadata.availability,
    lineupAvailability: input.features.lineup.metadata.availability,
    offensiveFormAvailability: input.features.offensiveForm.metadata.availability,
    bullpenAvailability: input.features.bullpen.metadata.availability,
    weatherAvailability: input.features.weatherPark.metadata.availability,
    warnings: input.features.warnings,
    projectionAvailability: projection.projectionAvailability,
    providerHealth: input.health ?? {
      source: "MLB_STATS_API",
      reachable: false,
      gamesMapped: 0,
      gamesUnmatched: 0,
      bothPitchersAvailable: 0,
      onePitcherAvailable: 0,
      zeroPitchersAvailable: 0,
      staleRecords: 0,
      errors: [],
      cacheStatus: "DISABLED",
    },
  };
}

function pitcherAuditItem(context: MlbGameContext, features: MlbSportsIntelligenceFeatures) {
  return {
    oddsEventId: context.eventId,
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    commenceTime: context.commenceTime,
    featureAvailability: features.startingPitcher.metadata.availability,
    dataSource: features.startingPitcher.metadata.source,
    sourceTimestamp: features.startingPitcher.metadata.updatedAt,
    mappingConfidence: features.startingPitcher.metadata.confidence,
    homePitcher: features.startingPitcher.homeStarter
      ? {
          playerId: features.startingPitcher.homeStarter.playerId,
          name: features.startingPitcher.homeStarter.name,
          status: features.startingPitcher.homeStarter.status,
          confirmed: features.startingPitcher.homeStarter.confirmed,
          throwingHand: features.startingPitcher.homeStarter.throwingHand,
          restDays: features.startingPitcher.homeStarter.restDays,
          recentPitchCount: features.startingPitcher.homeStarter.recentPitchCount,
          season: {
            era: features.startingPitcher.homeStarter.era,
            whip: features.startingPitcher.homeStarter.whip,
            strikeoutRate: features.startingPitcher.homeStarter.strikeoutRate,
            walkRate: features.startingPitcher.homeStarter.walkRate,
          },
        }
      : undefined,
    awayPitcher: features.startingPitcher.awayStarter
      ? {
          playerId: features.startingPitcher.awayStarter.playerId,
          name: features.startingPitcher.awayStarter.name,
          status: features.startingPitcher.awayStarter.status,
          confirmed: features.startingPitcher.awayStarter.confirmed,
          throwingHand: features.startingPitcher.awayStarter.throwingHand,
          restDays: features.startingPitcher.awayStarter.restDays,
          recentPitchCount: features.startingPitcher.awayStarter.recentPitchCount,
          season: {
            era: features.startingPitcher.awayStarter.era,
            whip: features.startingPitcher.awayStarter.whip,
            strikeoutRate: features.startingPitcher.awayStarter.strikeoutRate,
            walkRate: features.startingPitcher.awayStarter.walkRate,
          },
        }
      : undefined,
    warnings: features.startingPitcher.metadata.warnings ?? [],
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedEventId = url.searchParams.get("eventId");
    const [publicSignals, liveTop5, snapshotStatus, snapshots] = await Promise.all([
      recentPublicRows(),
      recentTop5Rows(),
      getSnapshotStatus(),
      getRecentSnapshots("MLB", 180),
    ]);
    const booksByEvent = new Map<string, Set<string>>();

    snapshots.forEach((snapshot) => {
      const books = booksByEvent.get(snapshot.eventId) ?? new Set<string>();
      books.add(snapshot.bookmaker);
      booksByEvent.set(snapshot.eventId, books);
    });

    const monitoredSportsbookCountByEvent = new Map(
      Array.from(booksByEvent.entries()).map(([eventId, books]) => [eventId, books.size]),
    );
    const consensusMovement = buildConsensusMovementFromSnapshots(
      snapshots,
      monitoredSportsbookCountByEvent,
    );
    const movementFeatures = buildMarketMovementFeatureMap(consensusMovement);
    const sportsFlags = getMlbSportsIntelligenceFlags();
    const sportsContext = auditContextFromRows(publicSignals, liveTop5);
    const pitcherContexts = auditContextsFromRows(publicSignals, liveTop5, requestedEventId);
    const sportsProvider = getMlbOfficialPitcherProviderWhenEnabled(sportsFlags);
    const sportsFeatures =
      sportsFlags.sportsIntelligenceEnabled && sportsFlags.pitcherModelEnabled
        ? await getMlbSportsIntelligenceFeatures(sportsContext, sportsProvider)
        : buildUnavailableMlbSportsIntelligenceFeatures(sportsContext);
    const pitcherDiagnostics =
      sportsFlags.sportsIntelligenceEnabled && sportsFlags.pitcherModelEnabled
        ? await Promise.all(
            pitcherContexts.map(async (context) =>
              pitcherAuditItem(
                context,
                await getMlbSportsIntelligenceFeatures(context, sportsProvider),
              ),
            ),
          )
        : pitcherContexts.map((context) =>
            pitcherAuditItem(context, buildUnavailableMlbSportsIntelligenceFeatures(context)),
          );
    const providerHealth =
      "getHealth" in sportsProvider && typeof sportsProvider.getHealth === "function"
        ? sportsProvider.getHealth()
        : null;

    return NextResponse.json({
      ok: true,
      engine: "atlas-mlb-automated-market-engine",
      generatedAt: new Date().toISOString(),
      verifiedDataSources: {
        odds: "The Odds API h2h, spreads/run line, totals",
        scores: "SportsDataIO when configured, The Odds API completed scores fallback",
        movements: "Supabase public.market_odds_snapshots, recent 180 minutes",
        unavailableInputsNotUsed: [
          "confirmed starting pitchers",
          "lineups",
          "injuries",
          "weather",
          "team-level rolling stats",
          "player props",
          "live odds",
        ],
      },
      selectionRules: {
        allowedMarkets: ["moneyline", "run line/spread", "totals"],
        automatedOddsRange: "-150 to +120",
        mlbMinimumBookCoverage: 2,
        staleOddsPolicy: "Reject when Odds API last_update is older than 240 minutes; missing timestamp is not treated as stale.",
        rankingInputs: [
          "American price",
          "no-vig two-way consensus when available",
          "book coverage",
          "price spread",
          "bounded recent odds movement context when backed by snapshots",
        ],
        abstentionPolicy: "Top 5 publishes fewer than five rows when fewer qualified candidates exist.",
      },
      snapshotStatus,
      movementSummary: {
        recentSnapshotRows: snapshots.length,
        consensusMovements: consensusMovement.length,
        featureKeys: movementFeatures.size,
        examples: consensusMovement.slice(0, 3),
      },
      sportsIntelligence: sportsIntelligenceAuditSummary({
        enabled: sportsFlags.sportsIntelligenceEnabled && sportsFlags.pitcherModelEnabled,
        provider: sportsProvider.name ?? unavailableMlbSportsIntelligenceProvider.name,
        features: sportsFeatures,
        health: providerHealth,
      }),
      startingPitchers: {
        requestedEventId: requestedEventId ?? null,
        count: pitcherDiagnostics.length,
        items: pitcherDiagnostics,
      },
      recentPublicSignals: publicSignals,
      recentTop5: liveTop5,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "MLB engine audit unavailable",
        details: serializeError(error),
      },
      { status: 500 },
    );
  }
}
