import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { loadLatestCanonicalBullpenTeamFeatures } from "../bullpen/bullpen-feature-repository";
import { MLB_TEAM_IDENTITIES } from "../mlb-team-mapping";
import { loadLatestCanonicalOffensiveTeamForms } from "../offense/offensive-baseline-repository";
import type { WeatherParkFeatures } from "../types";
import { loadLatestCanonicalWeatherParkFeatures } from "../weather/weather-feature-repository";
import { getVenueById } from "../weather/venue-registry";
import {
  buildTeamStrength,
  TEAM_STRENGTH_VERSION,
  teamStrengthDistribution,
  type TeamStrengthLineupStabilityInput,
  type TeamStrengthPitcherStatus,
  type TeamStrengthSnapshot,
} from "./team-strength-engine";

const TABLE = "mlb_team_strength_snapshots";

export type TeamStrengthSnapshotInsertResult = {
  attempted: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

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

function teamStatusFromStarterStatus(value: unknown): TeamStrengthPitcherStatus {
  if (value === "MATCHED") return "CONFIRMED";
  if (value === "PROBABLE_ONLY") return "PROBABLE";
  if (value === "CHANGED") return "CHANGED";
  return "UNKNOWN";
}

function daysBetween(from: string | undefined, to: string) {
  if (!from) return undefined;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

async function latestLineupEvidence(asOf: string) {
  const supabase = getSupabaseAdmin();
  const since = new Date(new Date(asOf).getTime() - 7 * 86_400_000).toISOString();
  const [snapshotResult, eventResult] = await Promise.all([
    supabase
      .from("mlb_lineup_snapshots")
      .select("team_id,team_name,confirmed,batting_order_complete,player_count,captured_at")
      .not("team_id", "is", null)
      .order("captured_at", { ascending: false })
      .limit(500),
    supabase
      .from("mlb_lineup_change_events")
      .select("team_id,event_type,captured_at")
      .not("team_id", "is", null)
      .gte("captured_at", since)
      .order("captured_at", { ascending: false })
      .limit(1000),
  ]);
  if (snapshotResult.error || eventResult.error) return new Map<string, TeamStrengthLineupStabilityInput>();

  const latestByTeam = new Map<string, any>();
  (snapshotResult.data ?? []).forEach((row: any) => {
    if (!latestByTeam.has(row.team_id)) latestByTeam.set(row.team_id, row);
  });

  const changesByTeam = new Map<string, { changes: number; lateScratches: number; latest?: string }>();
  (eventResult.data ?? []).forEach((row: any) => {
    const current = changesByTeam.get(row.team_id) ?? { changes: 0, lateScratches: 0 };
    current.changes += 1;
    if (row.event_type === "LATE_SCRATCH") current.lateScratches += 1;
    if (!current.latest || String(row.captured_at) > current.latest) current.latest = row.captured_at;
    changesByTeam.set(row.team_id, current);
  });

  const evidence = new Map<string, TeamStrengthLineupStabilityInput>();
  const ids = new Set([...latestByTeam.keys(), ...changesByTeam.keys()]);
  ids.forEach((teamId) => {
    const snapshot = latestByTeam.get(teamId);
    const changes = changesByTeam.get(teamId);
    evidence.set(teamId, {
      confirmedLineup: snapshot?.confirmed,
      battingOrderComplete: snapshot?.batting_order_complete,
      playerCount: snapshot?.player_count,
      lineupChangesLast7Days: changes?.changes ?? 0,
      lateScratchesLast7Days: changes?.lateScratches ?? 0,
      daysSinceLineupDisruption: daysBetween(changes?.latest, asOf),
      latestSnapshotAt: snapshot?.captured_at,
    });
  });
  return evidence;
}

async function latestStarterEvidence() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_starter_verification_snapshots")
    .select("team_id,team_name,verification_status,captured_at")
    .not("team_id", "is", null)
    .order("captured_at", { ascending: false })
    .limit(500);
  if (error) return new Map<string, TeamStrengthPitcherStatus>();
  const latest = new Map<string, TeamStrengthPitcherStatus>();
  (data ?? []).forEach((row: any) => {
    if (!latest.has(row.team_id)) latest.set(row.team_id, teamStatusFromStarterStatus(row.verification_status));
  });
  return latest;
}

function latestWeatherByHomeTeam(features: WeatherParkFeatures[]) {
  const byTeam = new Map<string, WeatherParkFeatures>();
  features
    .filter((feature) => feature.scheduledStartTime)
    .sort((a, b) => String(b.scheduledStartTime).localeCompare(String(a.scheduledStartTime)))
    .forEach((feature) => {
      const venue = getVenueById(feature.venueId);
      (venue?.homeTeamIds ?? []).forEach((teamId) => {
        if (!byTeam.has(teamId)) byTeam.set(teamId, feature);
      });
    });
  return byTeam;
}

export async function buildLatestTeamStrengthSnapshots(asOf = new Date().toISOString()) {
  const [offense, bullpen, weather, lineup, starter] = await Promise.all([
    loadLatestCanonicalOffensiveTeamForms(),
    loadLatestCanonicalBullpenTeamFeatures(),
    loadLatestCanonicalWeatherParkFeatures(),
    latestLineupEvidence(asOf),
    latestStarterEvidence(),
  ]);
  const offenseByTeam = new Map(offense.filter((team) => team.teamId).map((team) => [String(team.teamId), team]));
  const bullpenByTeam = new Map(bullpen.map((team) => [team.teamId, team]));
  const weatherByTeam = latestWeatherByHomeTeam(weather);
  const teams = new Map(MLB_TEAM_IDENTITIES.map((team) => [team.officialTeamId, team.officialTeamName]));

  [...offenseByTeam.keys(), ...bullpenByTeam.keys(), ...weatherByTeam.keys(), ...lineup.keys(), ...starter.keys()].forEach((teamId) => {
    const identity = MLB_TEAM_IDENTITIES.find((team) => team.officialTeamId === teamId);
    teams.set(teamId, identity?.officialTeamName ?? offenseByTeam.get(teamId)?.teamName ?? bullpenByTeam.get(teamId)?.teamName ?? teamId);
  });

  return Array.from(teams.entries()).map(([teamId, teamName]) =>
    buildTeamStrength({
      teamId,
      teamName,
      offense: offenseByTeam.get(teamId),
      bullpen: bullpenByTeam.get(teamId),
      lineupStability: lineup.get(teamId),
      pitcherStatus: starter.get(teamId),
      weatherPark: weatherByTeam.get(teamId),
      asOf,
    }),
  );
}

export function buildTeamStrengthSnapshotRows(snapshots: TeamStrengthSnapshot[]) {
  return snapshots.map((snapshot) => {
    const payload = {
      teamId: snapshot.teamId,
      offensiveScore: snapshot.offensiveScore,
      bullpenQuality: snapshot.bullpenQuality,
      bullpenFatigue: snapshot.bullpenFatigue,
      bullpenReadiness: snapshot.bullpenReadiness,
      lineupStability: snapshot.lineupStability,
      pitcherStatus: snapshot.pitcherStatus,
      weatherConfidence: snapshot.weatherConfidence,
      parkEnvironment: snapshot.parkEnvironment,
      teamStrength: snapshot.teamStrength,
      teamConfidence: snapshot.teamConfidence,
      componentBreakdown: snapshot.componentBreakdown,
      scoreVersion: snapshot.scoreVersion,
    };
    return {
      team_id: snapshot.teamId,
      team_name: snapshot.teamName,
      offensive_score: snapshot.offensiveScore,
      bullpen_quality: snapshot.bullpenQuality,
      bullpen_fatigue: snapshot.bullpenFatigue,
      bullpen_readiness: snapshot.bullpenReadiness,
      lineup_stability: snapshot.lineupStability,
      pitcher_status: snapshot.pitcherStatus,
      weather_confidence: snapshot.weatherConfidence,
      park_environment: snapshot.parkEnvironment,
      team_strength: snapshot.teamStrength,
      team_confidence: snapshot.teamConfidence,
      component_breakdown: snapshot.componentBreakdown,
      score_version: snapshot.scoreVersion,
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: snapshot.capturedAt,
    };
  });
}

export async function insertTeamStrengthSnapshotsDeduped(snapshots: TeamStrengthSnapshot[]): Promise<TeamStrengthSnapshotInsertResult> {
  const rows = buildTeamStrengthSnapshotRows(snapshots);
  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped: 0, errors: [] };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "feature_hash", ignoreDuplicates: true })
    .select("id");
  if (error) return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };
  const hashes = rows.map((row) => row.feature_hash);
  const markOld = await supabase
    .from(TABLE)
    .update({
      canonical: false,
      superseded_at: new Date().toISOString(),
      invalid_reason: "SUPERSEDED_BY_TEAM_STRENGTH_CANONICAL_CAPTURE",
    })
    .not("feature_hash", "in", `(${hashes.join(",")})`)
    .eq("canonical", true);
  if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };
  const markCurrent = await supabase
    .from(TABLE)
    .update({ canonical: true, superseded_at: null, invalid_reason: null })
    .in("feature_hash", hashes);
  if (markCurrent.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };
  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] };
}

function rowToSnapshot(row: any): TeamStrengthSnapshot {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    offensiveScore: row.offensive_score ?? undefined,
    bullpenQuality: row.bullpen_quality ?? undefined,
    bullpenFatigue: row.bullpen_fatigue ?? undefined,
    bullpenReadiness: row.bullpen_readiness ?? undefined,
    lineupStability: row.lineup_stability ?? undefined,
    pitcherStatus: row.pitcher_status ?? "UNKNOWN",
    weatherConfidence: row.weather_confidence ?? undefined,
    parkEnvironment: row.park_environment ?? undefined,
    teamStrength: row.team_strength ?? undefined,
    teamConfidence: row.team_confidence ?? { tier: "UNKNOWN", componentAvailability: 0, warnings: [] },
    componentBreakdown: row.component_breakdown ?? [],
    scoreVersion: row.score_version ?? TEAM_STRENGTH_VERSION,
    capturedAt: row.captured_at,
    warnings: row.team_confidence?.warnings ?? [],
  };
}

export async function loadLatestCanonicalTeamStrengthSnapshots(): Promise<TeamStrengthSnapshot[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  if (error) return [];
  const seen = new Set<string>();
  return (data ?? [])
    .filter((row: any) => {
      if (seen.has(row.team_id)) return false;
      seen.add(row.team_id);
      return true;
    })
    .map(rowToSnapshot);
}

export async function getTeamStrengthSnapshotStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from(TABLE).select("id", { count: "exact", head: true });
  if (error) {
    return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, teamsTracked: 0, teamsScored: 0, latestRefresh: undefined as string | undefined, errors: [error.message] };
  }
  const { count: canonicalSnapshots } = await supabase.from(TABLE).select("id", { count: "exact", head: true }).eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("team_id,captured_at,team_strength,team_confidence,score_version")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const confidenceCounts = rows.reduce((acc: Record<string, number>, row: any) => {
    const tier = row.team_confidence?.tier ?? "UNKNOWN";
    acc[tier] = (acc[tier] ?? 0) + 1;
    return acc;
  }, {});
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    teamsTracked: new Set(rows.map((row: any) => row.team_id)).size,
    teamsScored: new Set(rows.filter((row: any) => isNumber(row.team_strength)).map((row: any) => row.team_id)).size,
    latestRefresh: rows[0]?.captured_at as string | undefined,
    scoreVersion: rows[0]?.score_version ?? TEAM_STRENGTH_VERSION,
    confidenceCounts,
    distribution: teamStrengthDistribution(rows.map((row: any) => ({ teamStrength: row.team_strength ?? undefined }))),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}

export function teamStrengthAuditRanking(snapshots: TeamStrengthSnapshot[]) {
  const ranked = snapshots
    .filter((snapshot) => isNumber(snapshot.teamStrength))
    .sort((a, b) => (b.teamStrength ?? 0) - (a.teamStrength ?? 0))
    .map((snapshot, index) => ({
      auditRank: index + 1,
      teamId: snapshot.teamId,
      teamName: snapshot.teamName,
      teamStrength: snapshot.teamStrength,
      confidenceTier: snapshot.teamConfidence.tier,
      scoreVersion: snapshot.scoreVersion,
    }));
  return {
    label: "Atlas Team Strength Audit",
    top5: ranked.slice(0, 5),
    bottom5: [...ranked].reverse().slice(0, 5),
  };
}

export function summarizeExampleTeamStrength(snapshot: TeamStrengthSnapshot | undefined) {
  if (!snapshot) return undefined;
  return {
    teamId: snapshot.teamId,
    teamName: snapshot.teamName,
    teamStrength: snapshot.teamStrength,
    teamConfidence: snapshot.teamConfidence,
    componentBreakdown: snapshot.componentBreakdown.map((component) => ({
      component: component.component,
      normalizedValue: component.normalizedValue,
      weight: round(component.weight, 3),
      effectiveWeight: round(component.effectiveWeight, 3),
      availability: component.availability,
      confidence: component.confidence,
      warnings: component.warnings,
    })),
  };
}
