import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import {
  buildLatestTeamIntelligenceSnapshots,
  getTeamIntelligenceSnapshotStatus,
  insertTeamIntelligenceSnapshotsDeduped,
  loadTeamStrengthV1AuditRows,
  summarizeTeamIntelligence,
  teamIntelligenceAuditRankings,
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
    flags.teamQualityEnabled &&
    flags.gameReadinessEnabled &&
    flags.contextCertaintyEnabled &&
    flags.teamIntelligenceMode === "AUDIT_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.teamIntelligenceMode,
      message: "MLB Team Intelligence is disabled or not in AUDIT_ONLY mode.",
    });
  }

  try {
    const asOf = new Date().toISOString();
    const snapshots = await buildLatestTeamIntelligenceSnapshots(asOf);
    const storage = await insertTeamIntelligenceSnapshotsDeduped(snapshots);
    const status = await getTeamIntelligenceSnapshotStatus();
    const rankings = teamIntelligenceAuditRankings(snapshots);
    const deprecatedStrengthRows = await loadTeamStrengthV1AuditRows();

    return NextResponse.json({
      ok: true,
      enabled,
      asOf,
      mode: "AUDIT_ONLY",
      teamsInspected: snapshots.length,
      gamesInspected: new Set(snapshots.map((snapshot) => snapshot.officialGameId).filter(Boolean)).size,
      qualityAvailable: snapshots.filter((snapshot) => snapshot.teamQuality.availability === "AVAILABLE").length,
      qualityPartial: snapshots.filter((snapshot) => snapshot.teamQuality.availability === "PARTIAL").length,
      qualityUnavailable: snapshots.filter((snapshot) => snapshot.teamQuality.availability === "UNAVAILABLE").length,
      readinessAvailable: snapshots.filter((snapshot) => snapshot.gameReadiness.availability === "AVAILABLE").length,
      readinessPartial: snapshots.filter((snapshot) => snapshot.gameReadiness.availability === "PARTIAL").length,
      readinessUnavailable: snapshots.filter((snapshot) => snapshot.gameReadiness.availability === "UNAVAILABLE").length,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      deprecatedStrengthRows: deprecatedStrengthRows.length,
      rankings: {
        completeQualityTop5: rankings.completeQuality.rows.slice(0, 5),
        partialQualityTop5: rankings.partialQuality.rows.slice(0, 5),
        gameReadinessTop5: rankings.gameReadiness.rows.slice(0, 5),
      },
      example: summarizeTeamIntelligence(
        snapshots.find((snapshot) => snapshot.teamName === "Detroit Tigers") ??
        snapshots.find((snapshot) => snapshot.teamQuality.score !== undefined),
      ),
      storageHealth: {
        healthy: storage.errors.length === 0 && status.healthy,
        ...storage,
        snapshotStatus: status,
      },
      warnings: Array.from(new Set(snapshots.flatMap((snapshot) => snapshot.warnings))).slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB Team Intelligence capture error",
    }, { status: 500 });
  }
}
