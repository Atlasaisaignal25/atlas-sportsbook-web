import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { loadLatestCanonicalBullpenTeamFeatures } from "../bullpen/bullpen-feature-repository";
import { MLB_TEAM_IDENTITIES } from "../mlb-team-mapping";
import { loadLatestCanonicalOffensiveTeamForms } from "../offense/offensive-baseline-repository";
import type { WeatherParkFeatures } from "../types";
import { loadLatestCanonicalWeatherParkFeatures } from "../weather/weather-feature-repository";
import { getVenueById } from "../weather/venue-registry";
import type { TeamStrengthLineupStabilityInput, TeamStrengthPitcherStatus, TeamStrengthSnapshot } from "../team-strength/team-strength-engine";
import { loadLatestCanonicalTeamStrengthSnapshots } from "../team-strength/team-strength-repository";
import {
  buildTeamIntelligence,
  GAME_CONTEXT_CERTAINTY_VERSION,
  GAME_READINESS_VERSION,
  intelligenceScoreDistribution,
  TEAM_INTELLIGENCE_CONFIDENCE_VERSION,
  TEAM_QUALITY_VERSION,
  type TeamIntelligenceSnapshot,
} from "./team-intelligence-engine";

const TABLE = "mlb_team_intelligence_snapshots";

export type TeamIntelligenceInsertResult = {
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

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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

export async function buildLatestTeamIntelligenceSnapshots(asOf = new Date().toISOString()) {
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

  return Array.from(teams.entries()).map(([teamId, teamName]) => {
    const weatherPark = weatherByTeam.get(teamId);
    return buildTeamIntelligence({
      teamId,
      teamName,
      side: weatherPark ? "HOME" : undefined,
      officialGameId: weatherPark?.officialGameId,
      offense: offenseByTeam.get(teamId),
      bullpen: bullpenByTeam.get(teamId),
      lineupStability: lineup.get(teamId),
      pitcherStatus: starter.get(teamId),
      weatherPark,
      asOf,
      sourceVersions: {
        teamStrengthV1Deprecated: "team_strength_v1",
        offense: offenseByTeam.get(teamId)?.scoreVersion,
        bullpenFatigue: bullpenByTeam.get(teamId)?.fatigueScoreVersion,
        bullpenQuality: bullpenByTeam.get(teamId)?.qualityScoreVersion,
        weatherPark: weatherPark?.parkEnvironmentVersion,
      },
    });
  });
}

export function buildTeamIntelligenceSnapshotRows(snapshots: TeamIntelligenceSnapshot[]) {
  return snapshots.map((snapshot) => {
    const payload = {
      officialGameId: snapshot.officialGameId,
      oddsEventId: snapshot.oddsEventId,
      teamId: snapshot.teamId,
      side: snapshot.side,
      teamQuality: snapshot.teamQuality,
      gameReadiness: snapshot.gameReadiness,
      contextCertainty: snapshot.contextCertainty,
      intelligenceConfidence: snapshot.intelligenceConfidence,
      sourceVersions: snapshot.sourceVersions,
    };
    return {
      official_game_id: snapshot.officialGameId,
      odds_event_id: snapshot.oddsEventId,
      team_id: snapshot.teamId,
      team_name: snapshot.teamName,
      side: snapshot.side,
      team_quality_score: snapshot.teamQuality.score,
      team_quality_version: snapshot.teamQuality.version,
      team_quality_availability: snapshot.teamQuality.availability,
      team_quality_confidence: snapshot.teamQuality.confidence,
      team_quality_coverage: snapshot.teamQuality.qualityCoveragePercent,
      team_quality_components: snapshot.teamQuality.components,
      game_readiness_score: snapshot.gameReadiness.score,
      game_readiness_version: snapshot.gameReadiness.version,
      game_readiness_availability: snapshot.gameReadiness.availability,
      game_readiness_confidence: snapshot.gameReadiness.confidence,
      game_readiness_components: snapshot.gameReadiness.components,
      context_certainty_score: snapshot.contextCertainty.score,
      context_certainty_version: snapshot.contextCertainty.version,
      context_certainty_components: snapshot.contextCertainty.components,
      intelligence_confidence_score: snapshot.intelligenceConfidence.score,
      intelligence_confidence_tier: snapshot.intelligenceConfidence.tier,
      confidence_components: snapshot.intelligenceConfidence.components,
      source_versions: snapshot.sourceVersions,
      warnings: snapshot.warnings,
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: snapshot.capturedAt,
    };
  });
}

export async function insertTeamIntelligenceSnapshotsDeduped(snapshots: TeamIntelligenceSnapshot[]): Promise<TeamIntelligenceInsertResult> {
  const rows = buildTeamIntelligenceSnapshotRows(snapshots);
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
      invalid_reason: "SUPERSEDED_BY_TEAM_INTELLIGENCE_CANONICAL_CAPTURE",
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

function rowToSnapshot(row: any): TeamIntelligenceSnapshot {
  return {
    officialGameId: row.official_game_id ?? undefined,
    oddsEventId: row.odds_event_id ?? undefined,
    teamId: row.team_id,
    teamName: row.team_name,
    side: row.side ?? undefined,
    teamQuality: {
      score: row.team_quality_score ?? undefined,
      version: row.team_quality_version ?? TEAM_QUALITY_VERSION,
      components: row.team_quality_components ?? {},
      availableQualityWeight: row.team_quality_coverage ? round(Number(row.team_quality_coverage) / 100, 4) : 0,
      expectedQualityWeight: 1,
      qualityCoveragePercent: row.team_quality_coverage ?? 0,
      availability: row.team_quality_availability ?? "UNAVAILABLE",
      confidence: row.team_quality_confidence ?? "UNAVAILABLE",
      warnings: [],
    },
    gameReadiness: {
      score: row.game_readiness_score ?? undefined,
      version: row.game_readiness_version ?? GAME_READINESS_VERSION,
      components: row.game_readiness_components ?? {},
      readinessCoveragePercent: 0,
      availability: row.game_readiness_availability ?? "UNAVAILABLE",
      confidence: row.game_readiness_confidence ?? "UNAVAILABLE",
      warnings: [],
    },
    contextCertainty: {
      score: row.context_certainty_score ?? undefined,
      version: row.context_certainty_version ?? GAME_CONTEXT_CERTAINTY_VERSION,
      components: row.context_certainty_components ?? [],
      availability: row.context_certainty_score === null ? "UNAVAILABLE" : "AVAILABLE",
      warnings: [],
    },
    intelligenceConfidence: {
      score: row.intelligence_confidence_score ?? undefined,
      version: TEAM_INTELLIGENCE_CONFIDENCE_VERSION,
      tier: row.intelligence_confidence_tier ?? "UNAVAILABLE",
      qualityConfidence: row.team_quality_confidence ?? "UNAVAILABLE",
      readinessConfidence: row.game_readiness_confidence ?? "UNAVAILABLE",
      components: row.confidence_components ?? [],
      warnings: [],
    },
    sourceVersions: row.source_versions ?? {},
    warnings: row.warnings ?? [],
    capturedAt: row.captured_at,
  };
}

export async function loadLatestCanonicalTeamIntelligenceSnapshots(): Promise<TeamIntelligenceSnapshot[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(500);
  if (error) return [];
  const seen = new Set<string>();
  return (data ?? [])
    .filter((row: any) => {
      const key = `${row.team_id}:${row.official_game_id ?? "team"}:${row.side ?? "none"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(rowToSnapshot);
}

export async function getTeamIntelligenceSnapshotStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from(TABLE).select("id", { count: "exact", head: true });
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, teamsTracked: 0, latestRefresh: undefined as string | undefined, errors: [error.message] };
  const { count: canonicalSnapshots } = await supabase.from(TABLE).select("id", { count: "exact", head: true }).eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("team_id,captured_at,team_quality_score,team_quality_availability,game_readiness_score,game_readiness_availability,context_certainty_score,intelligence_confidence_tier")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(500);
  const rows = data ?? [];
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    teamsTracked: new Set(rows.map((row: any) => row.team_id)).size,
    latestRefresh: rows[0]?.captured_at as string | undefined,
    qualityAvailabilityCounts: countBy(rows, "team_quality_availability"),
    readinessAvailabilityCounts: countBy(rows, "game_readiness_availability"),
    confidenceCounts: countBy(rows, "intelligence_confidence_tier"),
    qualityDistribution: intelligenceScoreDistribution(rows.filter((row: any) => row.team_quality_availability === "AVAILABLE").map((row: any) => row.team_quality_score ?? undefined)),
    partialQualityDistribution: intelligenceScoreDistribution(rows.filter((row: any) => row.team_quality_availability === "PARTIAL").map((row: any) => row.team_quality_score ?? undefined)),
    readinessDistribution: intelligenceScoreDistribution(rows.map((row: any) => row.game_readiness_score ?? undefined)),
    contextCertaintyDistribution: intelligenceScoreDistribution(rows.map((row: any) => row.context_certainty_score ?? undefined)),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}

function countBy(rows: any[], key: string) {
  return rows.reduce((acc: Record<string, number>, row) => {
    const value = row[key] ?? "UNAVAILABLE";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export function teamIntelligenceAuditRankings(snapshots: TeamIntelligenceSnapshot[]) {
  const qualityRow = (snapshot: TeamIntelligenceSnapshot) => ({
    teamId: snapshot.teamId,
    teamName: snapshot.teamName,
    teamQuality: snapshot.teamQuality.score,
    availability: snapshot.teamQuality.availability,
    confidence: snapshot.teamQuality.confidence,
    coverage: snapshot.teamQuality.qualityCoveragePercent,
  });
  const completeQuality = snapshots
    .filter((snapshot) => snapshot.teamQuality.availability === "AVAILABLE" && snapshot.teamQuality.score !== undefined)
    .sort((a, b) => (b.teamQuality.score ?? 0) - (a.teamQuality.score ?? 0))
    .map((snapshot, index) => ({ auditRank: index + 1, ...qualityRow(snapshot) }));
  const partialQuality = snapshots
    .filter((snapshot) => snapshot.teamQuality.availability === "PARTIAL" && snapshot.teamQuality.score !== undefined)
    .sort((a, b) => (b.teamQuality.score ?? 0) - (a.teamQuality.score ?? 0))
    .map((snapshot, index) => ({ auditRank: index + 1, ...qualityRow(snapshot) }));
  const readiness = snapshots
    .filter((snapshot) => snapshot.gameReadiness.score !== undefined)
    .sort((a, b) => (b.gameReadiness.score ?? 0) - (a.gameReadiness.score ?? 0))
    .map((snapshot, index) => ({
      auditRank: index + 1,
      teamId: snapshot.teamId,
      teamName: snapshot.teamName,
      officialGameId: snapshot.officialGameId,
      side: snapshot.side,
      gameReadiness: snapshot.gameReadiness.score,
      availability: snapshot.gameReadiness.availability,
      confidence: snapshot.gameReadiness.confidence,
      warnings: snapshot.gameReadiness.warnings,
    }));
  return {
    completeQuality: { label: "Atlas Team Quality Audit", rows: completeQuality },
    partialQuality: { label: "Atlas Partial Team Quality Audit", rows: partialQuality },
    gameReadiness: { label: "Atlas Game Readiness Audit", rows: readiness },
  };
}

export function teamStrengthV1DistortionAudit(strengthRows: TeamStrengthSnapshot[]) {
  return strengthRows.map((row) => {
    const contributions = row.componentBreakdown.map((component) => ({
      component: component.component,
      normalizedValue: component.normalizedValue,
      weight: component.weight,
      effectiveWeight: component.effectiveWeight,
      contribution: component.normalizedValue === undefined ? 0 : round(component.normalizedValue * component.effectiveWeight),
      availability: component.availability,
      warnings: component.warnings,
    }));
    return {
      teamId: row.teamId,
      teamName: row.teamName,
      teamStrengthV1: row.teamStrength,
      deprecated: true,
      deprecationReason: "Mixed team quality, readiness and data-confidence concepts.",
      contributions,
      missingComponents: contributions.filter((item) => item.normalizedValue === undefined).map((item) => item.component),
      readinessContribution: round(contributions.filter((item) => ["bullpenReadiness", "lineupStability", "startingPitcherAvailability", "environmentReadiness"].includes(item.component)).reduce((sum, item) => sum + item.contribution, 0)),
      confidenceContribution: round(contributions.find((item) => item.component === "dataConfidence")?.contribution ?? 0),
      qualityContribution: round(contributions.filter((item) => ["offense", "bullpenQuality"].includes(item.component)).reduce((sum, item) => sum + item.contribution, 0)),
    };
  });
}

export async function loadTeamStrengthV1AuditRows() {
  return teamStrengthV1DistortionAudit(await loadLatestCanonicalTeamStrengthSnapshots());
}

export function summarizeTeamIntelligence(snapshot: TeamIntelligenceSnapshot | undefined) {
  if (!snapshot) return undefined;
  return {
    teamId: snapshot.teamId,
    teamName: snapshot.teamName,
    teamQuality: snapshot.teamQuality,
    gameReadiness: snapshot.gameReadiness,
    contextCertainty: snapshot.contextCertainty,
    intelligenceConfidence: snapshot.intelligenceConfidence,
    warnings: snapshot.warnings,
  };
}
