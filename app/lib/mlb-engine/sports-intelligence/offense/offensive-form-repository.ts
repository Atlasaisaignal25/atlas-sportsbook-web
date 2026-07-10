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

function snapshotRows(team: OffensiveTeamForm | undefined, asOf: string) {
  if (!team?.teamId) return [];
  return Object.values(team.rollingWindows).filter(Boolean).map((window) => {
    const payload = {
      teamId: team.teamId,
      asOf,
      windowGames: window.gamesRequested ?? window.games,
      gamesIncluded: window.gamesIncluded ?? window.games,
      metrics: {
        plateAppearances: window.plateAppearances,
        battedBallEvents: window.battedBallEvents,
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
      batted_ball_events: window.battedBallEvents,
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
  asOf: string;
}): Promise<OffensiveFormSnapshotInsertResult> {
  const rows = [...snapshotRows(input.home, input.asOf), ...snapshotRows(input.away, input.asOf)];
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
