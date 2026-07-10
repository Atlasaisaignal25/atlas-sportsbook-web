import { NextResponse } from "next/server";
import {
  getMlbSportsIntelligenceFlags,
  insertBullpenFeatureSnapshotsDeduped,
  MlbOfficialBullpenProvider,
} from "@/app/lib/mlb-engine/sports-intelligence";
import {
  fatigueDistribution,
  qualityDistribution,
} from "@/app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-calibration";
import { getBullpenFeatureSnapshotStatus } from "@/app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-feature-repository";
import {
  getBullpenQualityBaselineStatus,
  insertBullpenQualityBaselinesDeduped,
} from "@/app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-feature-repository";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const flags = getMlbSportsIntelligenceFlags();
  const scoreEnabled = flags.bullpenFatigueScoreEnabled && flags.bullpenScoreMode === "AUDIT_ONLY";
  const provider = new MlbOfficialBullpenProvider({
    enabled: flags.sportsIntelligenceEnabled && flags.bullpenModelEnabled && flags.bullpenProviderEnabled,
    scoreEnabled,
    fatigueVersion: flags.bullpenFatigueVersion,
    qualityScoreEnabled: flags.bullpenQualityScoreEnabled && flags.bullpenQualityScoreMode === "AUDIT_ONLY",
    qualityVersion: flags.bullpenQualityVersion,
    seasonArchiveEnabled: flags.bullpenSeasonArchiveEnabled,
  });

  try {
    const asOf = new Date().toISOString();
    const capture = await provider.captureAllTeams(asOf);
    const baselineStorage = flags.bullpenQualityBaselineEnabled && flags.bullpenQualityScoreMode === "AUDIT_ONLY"
      ? await insertBullpenQualityBaselinesDeduped(capture.qualityBaselines ?? [])
      : { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] };
    const storage = await insertBullpenFeatureSnapshotsDeduped({ teams: capture.teams, asOf });
    const snapshotStatus = await getBullpenFeatureSnapshotStatus();
    const baselineStatus = await getBullpenQualityBaselineStatus();
    const available = capture.teams.filter((team) => team.metadata.availability === "AVAILABLE").length;
    const partial = capture.teams.filter((team) => team.metadata.availability === "PARTIAL").length;
    const unavailable = capture.teams.filter((team) => team.metadata.availability === "UNAVAILABLE").length;
    const scored = capture.teams.filter((team) => team.fatigueScore !== undefined).length;
    const qualityScored = capture.teams.filter((team) => team.qualityScore !== undefined).length;
    const v1Scores = capture.teams.map((team) => ({ ...team, fatigueScore: team.fatigueScoreV1 }));
    const v2Scores = capture.teams.map((team) => ({ ...team, fatigueScore: team.fatigueScoreV2 }));
    const v2Distribution = fatigueDistribution(v2Scores);
    const qDistribution = qualityDistribution(capture.teams);

    return NextResponse.json({
      ok: true,
      asOf,
      teamsInspected: capture.teams.length,
      teamsAvailable: available,
      teamsPartial: partial,
      teamsUnavailable: unavailable,
      gamesProcessed: capture.gamesProcessed,
      reliefAppearancesProcessed: capture.reliefAppearancesProcessed,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      teamsScored: scored,
      teamsUnscored: capture.teams.length - scored,
      teamsQualityScored: qualityScored,
      teamsQualityUnscored: capture.teams.length - qualityScored,
      teamsQualityV2Scored: capture.teams.filter((team) => team.qualityScoreV2 !== undefined).length,
      teamsQualityV2Unscored: capture.teams.filter((team) => team.qualityScoreV2 === undefined).length,
      scoreEnabled,
      scoreMode: scoreEnabled ? "AUDIT_ONLY" : "DISABLED",
      fatigueVersion: flags.bullpenFatigueVersion,
      qualityVersion: flags.bullpenQualityVersion,
      seasonArchiveEnabled: flags.bullpenSeasonArchiveEnabled,
      baselineEnabled: flags.bullpenQualityBaselineEnabled,
      seasonGamesProcessed: capture.seasonGamesProcessed ?? 0,
      historicalBoxscoreCacheHits: capture.historicalBoxscoreCacheHits ?? 0,
      historicalBoxscoreCacheMisses: capture.historicalBoxscoreCacheMisses ?? 0,
      fatigueDistribution: fatigueDistribution(capture.teams),
      fatigueV1Distribution: fatigueDistribution(v1Scores),
      fatigueV2Distribution: v2Distribution,
      fatigueV1Mean: fatigueDistribution(v1Scores).mean,
      fatigueV2Mean: v2Distribution.mean,
      fatigueV2Min: v2Distribution.minimum,
      fatigueV2Max: v2Distribution.maximum,
      qualityDistribution: qDistribution,
      qualityMean: qDistribution.mean,
      qualityMin: qDistribution.minimum,
      qualityMax: qDistribution.maximum,
      qualityV1Distribution: qualityDistribution(capture.teams.map((team) => ({ ...team, qualityScore: team.qualityScoreV1 }))),
      qualityV2Distribution: qualityDistribution(capture.teams.map((team) => ({ ...team, qualityScore: team.qualityScoreV2 }))),
      qualitySampleDistributions: capture.qualitySampleDistributions,
      qualityV1V2Summary: capture.qualityV1V2Summary,
      baselinesInserted: baselineStorage.inserted,
      duplicateBaselinesSkipped: baselineStorage.skipped,
      baselineTableStatus: baselineStatus,
      canonicalRows: snapshotStatus.canonicalSnapshots,
      noncanonicalRows: Math.max(0, snapshotStatus.totalSnapshots - snapshotStatus.canonicalSnapshots),
      rawWorkloadDistribution: capture.rawWorkloadDistribution,
      providerErrors: [...capture.errors, ...storage.errors, ...baselineStorage.errors],
      providerHealth: provider.getHealth(),
      storageHealth: {
        healthy: storage.errors.length === 0 && baselineStorage.errors.length === 0,
        ...storage,
        baselineStorage,
      },
      examples: {
        lightUsage: capture.teams
          .filter((team) => team.fatigueScore !== undefined)
          .sort((a, b) => (a.fatigueScore ?? 100) - (b.fatigueScore ?? 100))[0],
        heavyUsage: capture.teams
          .filter((team) => team.fatigueScore !== undefined)
          .sort((a, b) => (b.fatigueScore ?? 0) - (a.fatigueScore ?? 0))[0],
        consecutiveDays: capture.teams.find((team) => team.relieversOnConsecutiveDays > 0),
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown bullpen capture error",
      providerHealth: provider.getHealth(),
    }, { status: 500 });
  }
}
