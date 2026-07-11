import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import { MLB_MARKET_EDGE_RESEARCH_VERSION } from "@/app/lib/mlb-engine/sports-intelligence/market-edge/market-edge-engine";
import {
  buildMarketEdgeResearchSnapshots,
  getMarketEdgeResearchStatus,
  insertMarketEdgeSnapshotsDeduped,
} from "@/app/lib/mlb-engine/sports-intelligence/market-edge/market-edge-repository";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const flags = getMlbSportsIntelligenceFlags();
  const enabled =
    flags.sportsIntelligenceEnabled &&
    flags.marketEdgeResearchEnabled &&
    flags.marketEdgeResearchMode === "RESEARCH_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.marketEdgeResearchMode,
      message: "MLB Market Edge Research is disabled or not in RESEARCH_ONLY mode.",
    });
  }

  try {
    const capture = await buildMarketEdgeResearchSnapshots();
    const storage = await insertMarketEdgeSnapshotsDeduped(capture.marketEdges);
    const status = await getMarketEdgeResearchStatus();

    return NextResponse.json({
      ok: true,
      enabled,
      mode: "RESEARCH_ONLY",
      version: MLB_MARKET_EDGE_RESEARCH_VERSION,
      researchOnly: true,
      publicScoringImpact: "NONE",
      asOf: capture.asOf,
      gamesInspected: capture.gamesInspected,
      gamesAnalyzed: capture.gamesAnalyzed,
      marketEdgesComputed: capture.marketEdges.length,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      providerErrors: capture.providerErrors,
      distributions: {
        edge: status.edgeDistribution,
        market: status.marketDistribution,
      },
      summaries: capture.summaries.slice(0, 10),
      bestEdges: status.bestEdges,
      examples: capture.marketEdges.slice(0, 10),
      storageHealth: {
        healthy: storage.errors.length === 0 && status.healthy,
        ...storage,
        snapshotStatus: status,
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB Market Edge Research capture error",
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
