import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  buildConsensusMovementFromSnapshots,
  buildMarketMovementFeatureMap,
} from "@/app/lib/mlb-engine/marketFeatures";
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
    .select("date,game_id,away_team,home_team,pick,market,line,odds,status,model_factors,start_time")
    .order("date", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

async function recentTop5Rows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_top5_live")
    .select("date,rank,game_id,away_team,home_team,pick,market,line,odds,status,is_top_signal,model_factors,start_time")
    .order("date", { ascending: false })
    .order("rank", { ascending: true })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
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
