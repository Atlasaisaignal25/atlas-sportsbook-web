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
      fatigueScore: team.fatigueScore,
      fatigueScoreVersion: team.fatigueScoreVersion,
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
      fatigue_score_version: team.fatigueScoreVersion,
      fatigue_components: team.fatigueComponents,
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
    .update({ canonical: false })
    .not("feature_hash", "in", `(${hashes.join(",")})`)
    .eq("canonical", true);
  if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };

  const markCurrent = await supabase
    .from("mlb_bullpen_feature_snapshots")
    .update({ canonical: true })
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
    .select("team_id,captured_at,fatigue_score,availability")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    teamsTracked: new Set((data ?? []).map((row: any) => row.team_id)).size,
    teamsScored: new Set((data ?? []).filter((row: any) => row.fatigue_score !== null).map((row: any) => row.team_id)).size,
    latestRefresh: data?.[0]?.captured_at as string | undefined,
    availabilityCounts: (data ?? []).reduce((acc: Record<string, number>, row: any) => {
      acc[row.availability] = (acc[row.availability] ?? 0) + 1;
      return acc;
    }, {}),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}
