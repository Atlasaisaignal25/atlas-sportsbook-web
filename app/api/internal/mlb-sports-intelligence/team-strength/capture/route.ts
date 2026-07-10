import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import {
  buildLatestTeamStrengthSnapshots,
  getTeamStrengthSnapshotStatus,
  insertTeamStrengthSnapshotsDeduped,
  summarizeExampleTeamStrength,
  teamStrengthAuditRanking,
} from "@/app/lib/mlb-engine/sports-intelligence/team-strength/team-strength-repository";
import { teamStrengthDistribution } from "@/app/lib/mlb-engine/sports-intelligence/team-strength/team-strength-engine";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const flags = getMlbSportsIntelligenceFlags();
  const enabled = flags.sportsIntelligenceEnabled && flags.teamStrengthEnabled && flags.teamStrengthScoreMode === "AUDIT_ONLY";
  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      scoreMode: flags.teamStrengthScoreMode,
      message: "MLB Team Strength is disabled or not in AUDIT_ONLY mode.",
    });
  }

  try {
    const asOf = new Date().toISOString();
    const snapshots = await buildLatestTeamStrengthSnapshots(asOf);
    const storage = await insertTeamStrengthSnapshotsDeduped(snapshots);
    const status = await getTeamStrengthSnapshotStatus();
    const ranking = teamStrengthAuditRanking(snapshots);

    return NextResponse.json({
      ok: true,
      enabled,
      asOf,
      scoreVersion: "team_strength_v1",
      scoreMode: "AUDIT_ONLY",
      teamsInspected: snapshots.length,
      teamsScored: snapshots.filter((snapshot) => snapshot.teamStrength !== undefined).length,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      distribution: teamStrengthDistribution(snapshots),
      internalAuditRanking: ranking,
      example: summarizeExampleTeamStrength(
        snapshots
          .filter((snapshot) => snapshot.teamStrength !== undefined)
          .sort((a, b) => (b.teamStrength ?? 0) - (a.teamStrength ?? 0))[0],
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
      error: error instanceof Error ? error.message : "Unknown MLB Team Strength capture error",
    }, { status: 500 });
  }
}
