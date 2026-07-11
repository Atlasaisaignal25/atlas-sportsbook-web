import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import {
  buildTeamQualityResearchSnapshots,
  getTeamQualityResearchStatus,
  insertTeamQualityResearchSnapshotsDeduped,
  teamQualityResearchAuditRankings,
} from "@/app/lib/mlb-engine/sports-intelligence/team-intelligence/team-intelligence-repository";

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
    flags.teamQualityResearchEnabled &&
    flags.teamQualityResearchMode === "RESEARCH_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.teamQualityResearchMode,
      message: "MLB Team Quality Research is disabled or not in RESEARCH_ONLY mode.",
    });
  }

  try {
    const capture = await buildTeamQualityResearchSnapshots();
    const storage = await insertTeamQualityResearchSnapshotsDeduped(capture.snapshots, capture.v1ByKey);
    const status = await getTeamQualityResearchStatus();
    const rankings = teamQualityResearchAuditRankings(capture.snapshots);

    return NextResponse.json({
      ok: true,
      enabled,
      mode: "RESEARCH_ONLY",
      version: "team_quality_v2_research",
      weightsVersion: flags.teamQualityResearchWeightVersion,
      asOf: capture.asOf,
      gamesInspected: capture.gamesInspected,
      teamSidesInspected: capture.teamSidesInspected,
      qualityV2Available: capture.snapshots.filter((snapshot) => snapshot.availability === "AVAILABLE").length,
      qualityV2Partial: capture.snapshots.filter((snapshot) => snapshot.availability === "PARTIAL").length,
      qualityV2Limited: capture.snapshots.filter((snapshot) => snapshot.availability === "LIMITED").length,
      qualityV2Unavailable: capture.snapshots.filter((snapshot) => snapshot.availability === "UNAVAILABLE").length,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      starterMismatches: capture.starterMismatches,
      baselineMismatches: capture.baselineMismatches,
      providerErrors: capture.providerErrors,
      sensitivitySummary: capture.sensitivity,
      rankings: {
        completeTop5: rankings.complete.rows.slice(0, 5),
        partialTop5: rankings.partial.rows.slice(0, 5),
        limitedTop5: rankings.limited.rows.slice(0, 5),
      },
      examples: capture.snapshots.slice(0, 6),
      storageHealth: {
        healthy: storage.errors.length === 0 && status.healthy,
        ...storage,
        snapshotStatus: status,
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB Team Quality Research capture error",
    }, { status: 500 });
  }
}
