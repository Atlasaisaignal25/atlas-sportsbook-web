import { NextResponse } from "next/server";
import { getMlbSportsIntelligenceFlags } from "@/app/lib/mlb-engine/sports-intelligence";
import {
  captureStartingPitcherQuality,
  getStartingPitcherQualitySnapshotStatus,
  insertPitcherQualityBaselinesDeduped,
  insertStartingPitcherQualitySnapshotsDeduped,
} from "@/app/lib/mlb-engine/sports-intelligence/pitcher-quality/pitcher-quality-repository";

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
    flags.pitcherQualityEnabled &&
    flags.pitcherReadinessEnabled &&
    flags.pitcherQualityMode === "AUDIT_ONLY";

  if (!enabled) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      mode: flags.pitcherQualityMode,
      message: "MLB Pitcher Quality is disabled or not in AUDIT_ONLY mode.",
    });
  }

  try {
    const capture = await captureStartingPitcherQuality();
    const baselineStorage = flags.pitcherProductionBaselinesEnabled
      ? await insertPitcherQualityBaselinesDeduped(capture.baselines)
      : { attempted: 0, inserted: 0, skipped: 0, errors: ["MLB_PITCHER_PRODUCTION_BASELINES_ENABLED is false."] };
    const storage = await insertStartingPitcherQualitySnapshotsDeduped(capture.snapshots);
    const snapshotStatus = await getStartingPitcherQualitySnapshotStatus();
    return NextResponse.json({
      ok: true,
      enabled,
      mode: "AUDIT_ONLY",
      asOf: capture.asOf,
      season: capture.season,
      gamesInspected: capture.gamesInspected,
      starterPopulationCount: capture.starterPopulationCount,
      baselineEligiblePitchers: capture.baselineEligiblePitchers,
      starterArchiveDiagnostics: capture.starterArchiveDiagnostics,
      baselinesReady: capture.baselineSet.ready,
      baselineVersion: capture.baselineSet.baselineVersion,
      baselineWarnings: capture.baselineSet.warnings.slice(0, 20),
      baselinesCreated: capture.baselines.length,
      baselinesInserted: baselineStorage.inserted,
      duplicateBaselinesSkipped: baselineStorage.skipped,
      priorScoresCompared: capture.priorVsProduction.compared,
      productionScoresCalculated: capture.priorVsProduction.productionScoresCalculated,
      priorFallbackScores: capture.priorVsProduction.priorFallbackScores,
      priorVsProductionSummary: capture.priorVsProduction,
      pitchersResolved: capture.pitchersResolved,
      pitchersQualityScored: capture.snapshots.filter((snapshot) => snapshot.qualityScore !== undefined).length,
      pitchersQualityUnavailable: capture.snapshots.filter((snapshot) => snapshot.qualityScore === undefined).length,
      pitchersReadinessScored: capture.snapshots.filter((snapshot) => snapshot.readinessScore !== undefined).length,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      providerErrors: [...capture.providerErrors, ...baselineStorage.errors],
      storageHealth: {
        healthy: storage.errors.length === 0 && baselineStorage.errors.length === 0 && snapshotStatus.healthy,
        ...storage,
        baselineStorage,
        snapshotStatus,
      },
      examples: capture.snapshots.slice(0, 6).map((snapshot) => ({
        playerName: snapshot.playerName,
        teamName: snapshot.teamName,
        qualityScore: snapshot.qualityScore,
        readinessScore: snapshot.readinessScore,
        baselineSource: snapshot.baselineSource,
        baselineAsOf: snapshot.baselineAsOf,
        confidence: snapshot.qualityConfidence,
        sampleQuality: snapshot.sampleQuality,
      })),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB pitcher quality capture error",
    }, { status: 500 });
  }
}
