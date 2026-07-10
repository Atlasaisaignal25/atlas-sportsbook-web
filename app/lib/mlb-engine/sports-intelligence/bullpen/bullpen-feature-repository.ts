import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type { MlbTeamBullpenFeatures } from "../types";

export type BullpenSnapshotInsertResult = {
  attempted: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function featureHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

export function buildBullpenFeatureSnapshotRows(teams: MlbTeamBullpenFeatures[], asOf: string) {
  return teams.map((team) => {
    const stableRelievers = [...team.relievers].sort((a, b) => a.playerId.localeCompare(b.playerId));
    const stableHighLeverage = [...team.highLeverageRelievers].sort((a, b) => a.playerId.localeCompare(b.playerId));
    const payload = {
      teamId: team.teamId,
      gamesIncluded: team.metadata.gamesIncluded,
      relievers: stableRelievers.map((reliever) => ({
        playerId: reliever.playerId,
        appearancesLast1Day: reliever.appearancesLast1Day,
        appearancesLast2Days: reliever.appearancesLast2Days,
        appearancesLast3Days: reliever.appearancesLast3Days,
        appearancesLast7Days: reliever.appearancesLast7Days,
        pitchesLast3Days: reliever.pitchesLast3Days,
        consecutiveDaysUsed: reliever.consecutiveDaysUsed,
        workloadAvailability: reliever.workloadAvailability,
      })),
      totalAppearancesLast3Days: team.totalAppearancesLast3Days,
      totalPitchesLast3Days: team.totalPitchesLast3Days,
      totalInningsLast3Days: team.totalInningsLast3Days,
      closerCandidate: team.closerCandidate,
      highLeverageRelievers: stableHighLeverage,
      fatigueScoreV1: team.fatigueScoreV1,
      fatigueScoreV2: team.fatigueScoreV2,
      fatigueScore: team.fatigueScore,
      fatigueScoreVersion: team.fatigueScoreVersion,
      qualityScore: team.qualityScore,
      qualityScoreVersion: team.qualityScoreVersion,
      effectiveDepth: team.effectiveDepth,
      availability: team.metadata.availability,
    };
    return {
      team_id: team.teamId,
      team_name: team.teamName,
      as_of: asOf,
      games_included: team.metadata.gamesIncluded ?? 0,
      total_appearances_last_3_days: team.totalAppearancesLast3Days,
      total_pitches_last_3_days: team.totalPitchesLast3Days,
      total_innings_last_3_days: team.totalInningsLast3Days,
      relievers_used_last_1_day: team.relieversUsedLast1Day,
      relievers_used_last_2_days: team.relieversUsedLast2Days,
      relievers_used_last_3_days: team.relieversUsedLast3Days,
      relievers_on_consecutive_days: team.relieversOnConsecutiveDays,
      relievers_with_heavy_workload: team.relieversWithHeavyWorkload,
      closer_candidate: team.closerCandidate,
      high_leverage_relievers: team.highLeverageRelievers,
      reliever_workloads: team.relievers,
      fatigue_score: team.fatigueScore,
      fatigue_score_v1: team.fatigueScoreV1,
      fatigue_score_v2: team.fatigueScoreV2,
      fatigue_score_version: team.fatigueScoreVersion,
      fatigue_components: team.fatigueComponents,
      quality_score: team.qualityScore,
      quality_score_version: team.qualityScoreVersion,
      quality_components: team.qualityComponents,
      effective_depth: team.effectiveDepth,
      quality_sample: team.qualitySample,
      data_version: "bullpen_features_v2",
      availability: team.metadata.availability,
      source: team.metadata.source ?? "MLB_OFFICIAL",
      source_updated_at: team.metadata.updatedAt,
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: new Date().toISOString(),
    };
  });
}

export async function insertBullpenFeatureSnapshotsDeduped(input: {
  teams: MlbTeamBullpenFeatures[];
  asOf: string;
}): Promise<BullpenSnapshotInsertResult> {
  const rows = buildBullpenFeatureSnapshotRows(input.teams, input.asOf);
  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped: 0, errors: [] };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_bullpen_feature_snapshots")
    .upsert(rows, { onConflict: "feature_hash", ignoreDuplicates: true })
    .select("id");

  if (error) return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };

  const hashes = rows.map((row) => row.feature_hash);
  const markOld = await supabase
    .from("mlb_bullpen_feature_snapshots")
    .update({
      canonical: false,
      superseded_at: new Date().toISOString(),
      invalid_reason: "SUPERSEDED_BY_BULLPEN_PHASE_6_1_CANONICAL_CAPTURE",
    })
    .not("feature_hash", "in", `(${hashes.join(",")})`)
    .eq("canonical", true);
  if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };

  const markCurrent = await supabase
    .from("mlb_bullpen_feature_snapshots")
    .update({ canonical: true, superseded_at: null, invalid_reason: null })
    .in("feature_hash", hashes);
  if (markCurrent.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };

  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] };
}

export async function getBullpenFeatureSnapshotStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("mlb_bullpen_feature_snapshots")
    .select("id", { count: "exact", head: true });
  if (error) {
    return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, teamsTracked: 0, latestRefresh: undefined as string | undefined, errors: [error.message] };
  }
  const { count: canonicalSnapshots } = await supabase
    .from("mlb_bullpen_feature_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from("mlb_bullpen_feature_snapshots")
    .select("team_id,captured_at,fatigue_score,quality_score,availability")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    teamsTracked: new Set((data ?? []).map((row: any) => row.team_id)).size,
    teamsScored: new Set((data ?? []).filter((row: any) => row.fatigue_score !== null).map((row: any) => row.team_id)).size,
    teamsQualityScored: new Set((data ?? []).filter((row: any) => row.quality_score !== null).map((row: any) => row.team_id)).size,
    latestRefresh: data?.[0]?.captured_at as string | undefined,
    availabilityCounts: (data ?? []).reduce((acc: Record<string, number>, row: any) => {
      acc[row.availability] = (acc[row.availability] ?? 0) + 1;
      return acc;
    }, {}),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}

export async function loadLatestCanonicalBullpenTeamFeatures(): Promise<MlbTeamBullpenFeatures[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_bullpen_feature_snapshots")
    .select("*")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  if (error) return [];
  const seen = new Set<string>();
  return (data ?? []).filter((row: any) => {
    if (seen.has(row.team_id)) return false;
    seen.add(row.team_id);
    return true;
  }).map((row: any): MlbTeamBullpenFeatures => ({
    teamId: row.team_id,
    teamName: row.team_name,
    relievers: row.reliever_workloads ?? [],
    totalAppearancesLast3Days: row.total_appearances_last_3_days ?? 0,
    totalPitchesLast3Days: row.total_pitches_last_3_days ?? undefined,
    totalInningsLast3Days: row.total_innings_last_3_days ?? undefined,
    relieversUsedLast1Day: row.relievers_used_last_1_day ?? 0,
    relieversUsedLast2Days: row.relievers_used_last_2_days ?? 0,
    relieversUsedLast3Days: row.relievers_used_last_3_days ?? 0,
    relieversOnConsecutiveDays: row.relievers_on_consecutive_days ?? 0,
    relieversWithHeavyWorkload: row.relievers_with_heavy_workload ?? 0,
    closerCandidate: row.closer_candidate ?? undefined,
    highLeverageRelievers: row.high_leverage_relievers ?? [],
    fatigueScore: row.fatigue_score ?? undefined,
    fatigueScoreV1: row.fatigue_score_v1 ?? undefined,
    fatigueScoreV2: row.fatigue_score_v2 ?? undefined,
    fatigueScoreVersion: row.fatigue_score_version ?? undefined,
    fatigueComponents: row.fatigue_components ?? undefined,
    qualityScore: row.quality_score ?? undefined,
    qualityScoreVersion: row.quality_score_version ?? undefined,
    qualityComponents: row.quality_components ?? undefined,
    effectiveDepth: row.effective_depth ?? undefined,
    qualitySample: row.quality_sample ?? undefined,
    metadata: {
      availability: row.availability,
      source: row.source,
      observedAt: row.as_of,
      updatedAt: row.source_updated_at,
      gamesIncluded: row.games_included,
      warnings: [],
    },
    warnings: [],
  }));
}
