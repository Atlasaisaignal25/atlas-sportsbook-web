import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import {
  buildMlbProjectionResearchSnapshots,
  getProjectionResearchStatus,
  insertProjectionResearchSnapshotsDeduped,
  projectionResearchAuditRankings,
} from "@/app/lib/mlb-engine/sports-intelligence/projection-research/projection-research-repository";
import { MLB_PROJECTION_RESEARCH_VERSION } from "@/app/lib/mlb-engine/sports-intelligence/projection-research/projection-research-engine";

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
    flags.projectionResearchEnabled &&
    flags.projectionResearchMode === "RESEARCH_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.projectionResearchMode,
      message: "MLB Projection Research is disabled or not in RESEARCH_ONLY mode.",
    });
  }

  try {
    const capture = await buildMlbProjectionResearchSnapshots();
    const storage = await insertProjectionResearchSnapshotsDeduped(capture.projections);
    const status = await getProjectionResearchStatus();
    const rankings = projectionResearchAuditRankings(capture.projections);

    return NextResponse.json({
      ok: true,
      enabled,
      mode: "RESEARCH_ONLY",
      version: MLB_PROJECTION_RESEARCH_VERSION,
      researchOnly: true,
      publicScoringImpact: "NONE",
      asOf: capture.asOf,
      gamesInspected: capture.gamesInspected,
      gamesProjected: capture.projections.length,
      available: capture.projections.filter((projection) => projection.availability === "AVAILABLE").length,
      partial: capture.projections.filter((projection) => projection.availability === "PARTIAL").length,
      unavailable: capture.projections.filter((projection) => projection.availability === "UNAVAILABLE").length,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      providerErrors: capture.providerErrors,
      rankings,
      distributions: {
        projectedTotalRuns: status.projectedTotalDistribution,
        homeWinProbability: status.homeWinProbabilityDistribution,
      },
      examples: capture.projections.slice(0, 5),
      storageHealth: {
        healthy: storage.errors.length === 0 && status.healthy,
        ...storage,
        snapshotStatus: status,
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB Projection Research capture error",
    }, { status: 500 });
  }
}
