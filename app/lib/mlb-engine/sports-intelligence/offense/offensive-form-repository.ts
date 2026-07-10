import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type { OffensiveTeamForm } from "../types";

export type OffensiveFormSnapshotInsertResult = {
  attempted: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

function featureHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function buildOffensiveFormSnapshotRows(team: OffensiveTeamForm | undefined, asOf: string) {
  if (!team?.teamId) return [];
  return Object.values(team.rollingWindows).filter(Boolean).map((window) => {
    const payload = {
      teamId: team.teamId,
      windowGames: window.gamesRequested ?? window.games,
      selectedGamePks: window.selectedGamePks ?? [],
      gamesIncluded: window.gamesIncluded ?? window.games,
      metrics: {
        plateAppearances: window.plateAppearances,
        wobaEligiblePlateAppearances: window.wobaEligiblePlateAppearances,
        battedBallEvents: window.battedBallEvents,
        untrackedBattedBallEvents: window.untrackedBattedBallEvents,
        statcastCoverage: window.statcastCoverage,
        hardHitRate: window.hardHitRate,
        barrelRate: window.barrelRate,
        averageExitVelocity: window.averageExitVelocity ?? window.exitVelocity,
        walkRate: window.walkRate,
        strikeoutRate: window.strikeoutRate,
        expectedBAOnContact: window.expectedBAOnContact,
        expectedSLGOnContact: window.expectedSLGOnContact,
        expectedWOBAOnContact: window.expectedWOBAOnContact,
        atlasExpectedOffenseRate: window.atlasExpectedOffenseRate,
        atlasOffensiveScore: window.score,
        sampleQuality: window.sampleQuality,
      },
    };

    return {
      team_id: team.teamId,
      team_name: team.teamName,
      as_of: asOf,
      window_games: window.gamesRequested ?? window.games,
      games_included: window.gamesIncluded ?? window.games,
      start_date: window.startDate,
      end_date: window.endDate,
      plate_appearances: window.plateAppearances,
      woba_eligible_plate_appearances: window.wobaEligiblePlateAppearances,
      batted_ball_events: window.battedBallEvents,
      untracked_batted_ball_events: window.untrackedBattedBallEvents,
      statcast_coverage: window.statcastCoverage,
      hard_hit_rate: window.hardHitRate,
      barrel_rate: window.barrelRate,
      average_exit_velocity: window.averageExitVelocity ?? window.exitVelocity,
      walk_rate: window.walkRate,
      strikeout_rate: window.strikeoutRate,
      expected_ba_on_contact: window.expectedBAOnContact,
      expected_slg_on_contact: window.expectedSLGOnContact,
      expected_woba_on_contact: window.expectedWOBAOnContact,
      atlas_expected_offense_rate: window.atlasExpectedOffenseRate,
      atlas_offensive_score: window.score,
      sample_quality: window.sampleQuality,
      source: team.source,
      source_updated_at: team.scoreTimestamp,
      feature_hash: featureHash(payload),
      captured_at: new Date().toISOString(),
    };
  });
}

export async function insertOffensiveFormSnapshotsDeduped(input: {
  home?: OffensiveTeamForm;
  away?: OffensiveTeamForm;
  teams?: OffensiveTeamForm[];
  asOf: string;
}): Promise<OffensiveFormSnapshotInsertResult> {
  const teamForms = input.teams ?? [input.home, input.away];
  const rows = teamForms.flatMap((team) => buildOffensiveFormSnapshotRows(team, input.asOf));
  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped: 0, errors: [] };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_offensive_form_snapshots")
    .upsert(rows, { onConflict: "feature_hash", ignoreDuplicates: true })
    .select("id");

  if (error) {
    return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };
  }

  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] };
}

export async function getOffensiveFormSnapshotStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("mlb_offensive_form_snapshots")
    .select("id", { count: "exact", head: true });
  if (error) {
    return {
      healthy: false,
      totalSnapshots: 0,
      teamsTracked: 0,
      windowsTracked: 0,
      latestRefresh: undefined as string | undefined,
      errors: [error.message],
    };
  }

  const { data, error: latestError } = await supabase
    .from("mlb_offensive_form_snapshots")
    .select("team_id,window_games,captured_at")
    .order("captured_at", { ascending: false })
    .limit(500);

  if (latestError) {
    return {
      healthy: false,
      totalSnapshots: count ?? 0,
      teamsTracked: 0,
      windowsTracked: 0,
      latestRefresh: undefined as string | undefined,
      errors: [latestError.message],
    };
  }

  return {
    healthy: true,
    totalSnapshots: count ?? 0,
    teamsTracked: new Set((data ?? []).map((row: any) => row.team_id)).size,
    windowsTracked: new Set((data ?? []).map((row: any) => row.window_games)).size,
    latestRefresh: data?.[0]?.captured_at as string | undefined,
    errors: [] as string[],
  };
}
