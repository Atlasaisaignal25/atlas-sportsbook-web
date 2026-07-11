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
import {
  buildTeamQualityResearch,
  compareTeamQualityV1V2,
  DEFAULT_TEAM_QUALITY_RESEARCH_WEIGHTS,
  researchScoreDistribution,
  TEAM_QUALITY_RESEARCH_VERSION,
  TEAM_QUALITY_RESEARCH_WEIGHT_VERSION,
  TEAM_QUALITY_RESEARCH_WEIGHTS,
  type TeamQualityResearchSnapshot,
  type TeamQualityResearchWeights,
} from "./team-quality-research-engine";

const TABLE = "mlb_team_intelligence_snapshots";

export type TeamIntelligenceInsertResult = {
  attempted: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

export type TeamQualityResearchCaptureResult = {
  asOf: string;
  gamesInspected: number;
  teamSidesInspected: number;
  snapshots: TeamQualityResearchSnapshot[];
  v1ByKey: Map<string, TeamIntelligenceSnapshot>;
  starterMismatches: number;
  baselineMismatches: number;
  providerErrors: string[];
  sensitivity: Record<string, unknown>;
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

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function keyForGameTeam(input: { officialGameId?: string; teamId?: string; side?: string }) {
  return `${input.officialGameId ?? "none"}:${input.teamId ?? "none"}:${input.side ?? "none"}`;
}

function keyForTeam(input: { teamId?: string }) {
  return input.teamId ?? "none";
}

async function loadLatestCanonicalPitcherQualityRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_starting_pitcher_quality_snapshots")
    .select("official_game_id,team_id,team_name,side,player_id,player_name,quality_score,quality_version,baseline_version,baseline_source,quality_confidence,readiness_score,readiness_version,captured_at")
    .eq("canonical", true)
    .not("official_game_id", "is", null)
    .order("captured_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const seen = new Set<string>();
  return (data ?? []).filter((row: any) => {
    const key = keyForGameTeam({ officialGameId: row.official_game_id, teamId: row.team_id, side: row.side });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function offensiveResearchScore(form: Awaited<ReturnType<typeof loadLatestCanonicalOffensiveTeamForms>>[number] | undefined) {
  if (!form) return undefined;
  if (isNumber(form.atlasOffensiveScore)) return form.atlasOffensiveScore;
  if (isNumber(form.currentScore)) return form.currentScore;
  return undefined;
}

function v1ByTeam(snapshots: TeamIntelligenceSnapshot[]) {
  const byGame = new Map<string, TeamIntelligenceSnapshot>();
  const byTeam = new Map<string, TeamIntelligenceSnapshot>();
  snapshots.forEach((snapshot) => {
    if (snapshot.officialGameId && snapshot.side) byGame.set(keyForGameTeam(snapshot), snapshot);
    if (!byTeam.has(snapshot.teamId)) byTeam.set(keyForTeam(snapshot), snapshot);
  });
  return { byGame, byTeam };
}

function buildResearchSensitivity(baseInputs: Array<Parameters<typeof buildTeamQualityResearch>[0]>) {
  const built = Object.fromEntries(Object.entries(TEAM_QUALITY_RESEARCH_WEIGHTS).map(([label, weights]) => [
    label,
    baseInputs.map((input) => buildTeamQualityResearch({ ...input, weights, weightVersion: `${TEAM_QUALITY_RESEARCH_WEIGHT_VERSION}_${label}` })),
  ]));
  const base = built.A ?? [];
  const rank = (rows: TeamQualityResearchSnapshot[]) => rows
    .filter((row) => row.score !== undefined)
    .toSorted((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((row) => keyForGameTeam(row));
  const baseRank = rank(base);
  function rankCorrelation(rows: TeamQualityResearchSnapshot[]) {
    const otherRank = rank(rows);
    const pairs = otherRank
      .map((key, index) => ({ key, other: index + 1, base: baseRank.indexOf(key) + 1 }))
      .filter((item) => item.base > 0);
    if (pairs.length < 2) return undefined;
    const n = pairs.length;
    const d2 = pairs.reduce((sum, item) => sum + (item.base - item.other) ** 2, 0);
    return round(1 - (6 * d2) / (n * (n ** 2 - 1)), 3);
  }
  return Object.fromEntries(Object.entries(built).map(([label, rows]) => {
    const deltas = rows.map((row) => {
      const original = base.find((item) => keyForGameTeam(item) === keyForGameTeam(row));
      return {
        teamName: row.teamName,
        officialGameId: row.officialGameId,
        side: row.side,
        score: row.score,
        deltaFromA: row.score !== undefined && original?.score !== undefined ? round(row.score - original.score) : undefined,
      };
    });
    return [label, {
      weights: TEAM_QUALITY_RESEARCH_WEIGHTS[label as keyof typeof TEAM_QUALITY_RESEARCH_WEIGHTS],
      rankingCorrelationToA: label === "A" ? 1 : rankCorrelation(rows),
      distribution: researchScoreDistribution(rows.map((row) => row.score)),
      completeDistribution: researchScoreDistribution(rows.filter((row) => row.availability === "AVAILABLE").map((row) => row.score)),
      partialDistribution: researchScoreDistribution(rows.filter((row) => row.availability === "PARTIAL").map((row) => row.score)),
      limitedDistribution: researchScoreDistribution(rows.filter((row) => row.availability === "LIMITED").map((row) => row.score)),
      meanScoreChangeFromA: label === "A" ? 0 : round(deltas.filter((item) => isNumber(item.deltaFromA)).reduce((sum, item) => sum + Math.abs(item.deltaFromA ?? 0), 0) / Math.max(1, deltas.filter((item) => isNumber(item.deltaFromA)).length)),
      largestDeltasFromA: deltas.filter((item) => isNumber(item.deltaFromA)).toSorted((a, b) => Math.abs(b.deltaFromA ?? 0) - Math.abs(a.deltaFromA ?? 0)).slice(0, 5),
    }];
  }));
}

function buildResearchSensitivityFromRows(rows: any[]) {
  const inputs = rows.map((row) => ({
    officialGameId: row.official_game_id,
    teamId: String(row.team_id),
    teamName: row.team_name ?? String(row.team_id),
    side: row.side,
    offenseScore: row.offense_score ?? undefined,
    offenseConfidence: row.quality_confidence?.moduleConfidence?.offense,
    startingPitcherQualityScore: row.starting_pitcher_quality_score ?? undefined,
    startingPitcherQualityVersion: row.starting_pitcher_quality_version ?? undefined,
    startingPitcherBaselineVersion: row.starting_pitcher_baseline_version ?? undefined,
    startingPitcherBaselineSource: row.quality_confidence?.baselineCompatibility ? "PRODUCTION_BASELINE" : undefined,
    startingPitcherId: row.player_id ?? undefined,
    startingPitcherConfidence: row.quality_confidence?.moduleConfidence?.startingPitcher,
    bullpenQualityScore: row.bullpen_quality_score ?? undefined,
    bullpenConfidence: row.quality_confidence?.moduleConfidence?.bullpen,
    weightVersion: TEAM_QUALITY_RESEARCH_WEIGHT_VERSION,
    asOf: row.captured_at,
    warnings: [],
  } satisfies Parameters<typeof buildTeamQualityResearch>[0]));
  return buildResearchSensitivity(inputs);
}

export async function buildTeamQualityResearchSnapshots(input: {
  asOf?: string;
  weights?: TeamQualityResearchWeights;
} = {}): Promise<TeamQualityResearchCaptureResult> {
  const asOf = input.asOf ?? new Date().toISOString();
  const [offense, bullpen, v1Snapshots, pitcherRows] = await Promise.all([
    loadLatestCanonicalOffensiveTeamForms(),
    loadLatestCanonicalBullpenTeamFeatures(),
    loadLatestCanonicalTeamIntelligenceSnapshots(),
    loadLatestCanonicalPitcherQualityRows(),
  ]);
  const offenseByTeam = new Map(offense.filter((team) => team.teamId).map((team) => [String(team.teamId), team]));
  const bullpenByTeam = new Map(bullpen.map((team) => [team.teamId, team]));
  const v1Maps = v1ByTeam(v1Snapshots);
  let baselineMismatches = 0;
  const providerErrors: string[] = [];
  const baseInputs: Array<Parameters<typeof buildTeamQualityResearch>[0]> = pitcherRows.map((pitcher: any) => {
    const teamId = String(pitcher.team_id);
    const teamName = pitcher.team_name ?? teamId;
    const offenseForm = offenseByTeam.get(teamId);
    const bullpenTeam = bullpenByTeam.get(teamId);
    const gameKey = keyForGameTeam({ officialGameId: pitcher.official_game_id, teamId, side: pitcher.side });
    const v1 = v1Maps.byGame.get(gameKey) ?? v1Maps.byTeam.get(teamId);
    if (pitcher.baseline_source !== "PRODUCTION_BASELINE" || pitcher.baseline_version !== "starting_pitcher_baseline_v1") baselineMismatches += 1;
    return {
      officialGameId: pitcher.official_game_id,
      teamId,
      teamName,
      side: pitcher.side,
      offenseScore: offensiveResearchScore(offenseForm),
      offenseVersion: offenseForm?.scoreVersion,
      offenseConfidence: offenseForm?.availability === "AVAILABLE" ? 85 : offenseForm ? 45 : undefined,
      startingPitcherQualityScore: pitcher.quality_score ?? undefined,
      startingPitcherQualityVersion: pitcher.quality_version,
      startingPitcherBaselineVersion: pitcher.baseline_version,
      startingPitcherBaselineSource: pitcher.baseline_source,
      startingPitcherId: pitcher.player_id,
      startingPitcherName: pitcher.player_name,
      startingPitcherConfidence: pitcher.quality_confidence?.score,
      bullpenQualityScore: bullpenTeam?.qualityScoreV2 ?? bullpenTeam?.qualityScore,
      bullpenQualityVersion: bullpenTeam?.qualityScoreVersion,
      bullpenConfidence: bullpenTeam?.qualityConfidence?.score,
      gameReadiness: v1?.gameReadiness,
      weights: input.weights ?? DEFAULT_TEAM_QUALITY_RESEARCH_WEIGHTS,
      weightVersion: TEAM_QUALITY_RESEARCH_WEIGHT_VERSION,
      asOf,
      warnings: [],
    } satisfies Parameters<typeof buildTeamQualityResearch>[0];
  });
  const snapshots = baseInputs.map((item) => buildTeamQualityResearch(item));
  const v1Entries = snapshots.flatMap((snapshot) => {
    const v1 = v1Maps.byGame.get(keyForGameTeam(snapshot)) ?? v1Maps.byTeam.get(snapshot.teamId);
    return v1 ? [[keyForGameTeam(snapshot), v1] as [string, TeamIntelligenceSnapshot]] : [];
  });
  return {
    asOf,
    gamesInspected: new Set(snapshots.map((snapshot) => snapshot.officialGameId).filter(Boolean)).size,
    teamSidesInspected: snapshots.length,
    snapshots,
    v1ByKey: new Map(v1Entries),
    starterMismatches: 0,
    baselineMismatches,
    providerErrors,
    sensitivity: buildResearchSensitivity(baseInputs),
  };
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
    .eq("team_quality_version", TEAM_QUALITY_VERSION)
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

export function buildTeamQualityResearchRows(snapshots: TeamQualityResearchSnapshot[], v1ByKey = new Map<string, TeamIntelligenceSnapshot>()) {
  return snapshots.map((snapshot) => {
    const v1 = v1ByKey.get(keyForGameTeam(snapshot));
    const payload = {
      officialGameId: snapshot.officialGameId,
      teamId: snapshot.teamId,
      side: snapshot.side,
      playerId: snapshot.startingPitcherId,
      offenseScore: snapshot.offenseScore,
      offenseVersion: snapshot.offenseVersion,
      pitcherQualityScore: snapshot.startingPitcherQualityScore,
      pitcherQualityVersion: snapshot.startingPitcherQualityVersion,
      pitcherBaselineVersion: snapshot.startingPitcherBaselineVersion,
      bullpenQualityScore: snapshot.bullpenQualityScore,
      bullpenQualityVersion: snapshot.bullpenQualityVersion,
      researchWeightVersion: snapshot.weightVersion,
      weights: snapshot.weights,
      coverage: snapshot.qualityCoveragePercent,
      confidence: snapshot.confidence,
      warnings: snapshot.warnings,
    };
    return {
      official_game_id: snapshot.officialGameId,
      team_id: snapshot.teamId,
      team_name: snapshot.teamName,
      side: snapshot.side,
      team_quality_score: snapshot.score,
      team_quality_version: snapshot.version,
      team_quality_availability: snapshot.availability === "AVAILABLE" ? "AVAILABLE" : snapshot.availability === "UNAVAILABLE" ? "UNAVAILABLE" : "PARTIAL",
      team_quality_confidence: snapshot.confidence.tier,
      team_quality_coverage: snapshot.qualityCoveragePercent,
      team_quality_components: snapshot.components,
      game_readiness_score: snapshot.gameReadiness?.score,
      game_readiness_version: snapshot.gameReadiness?.version ?? GAME_READINESS_VERSION,
      game_readiness_availability: snapshot.gameReadiness?.availability ?? "UNAVAILABLE",
      game_readiness_confidence: snapshot.gameReadiness?.confidence ?? "UNAVAILABLE",
      game_readiness_components: snapshot.gameReadiness?.components ?? {},
      context_certainty_score: null,
      context_certainty_version: GAME_CONTEXT_CERTAINTY_VERSION,
      context_certainty_components: [],
      intelligence_confidence_score: snapshot.confidence.score,
      intelligence_confidence_tier: snapshot.confidence.tier,
      confidence_components: [],
      source_versions: {
        teamQualityV1: v1?.teamQuality.version,
        teamQualityResearch: snapshot.version,
        offense: snapshot.offenseVersion,
        startingPitcherQuality: snapshot.startingPitcherQualityVersion,
        startingPitcherBaseline: snapshot.startingPitcherBaselineVersion,
        bullpenQuality: snapshot.bullpenQualityVersion,
      },
      warnings: snapshot.warnings,
      team_quality_v1_score: v1?.teamQuality.score,
      team_quality_v2_research_score: snapshot.score,
      research_weight_version: snapshot.weightVersion,
      starting_pitcher_quality_score: snapshot.startingPitcherQualityScore,
      starting_pitcher_quality_version: snapshot.startingPitcherQualityVersion,
      starting_pitcher_baseline_version: snapshot.startingPitcherBaselineVersion,
      starting_pitcher_id: snapshot.startingPitcherId,
      player_id: snapshot.startingPitcherId,
      offense_score: snapshot.offenseScore,
      bullpen_quality_score: snapshot.bullpenQualityScore,
      quality_coverage: snapshot.qualityCoveragePercent,
      quality_confidence: snapshot.confidence,
      quality_components: snapshot.components,
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: snapshot.capturedAt,
    };
  });
}

export async function insertTeamQualityResearchSnapshotsDeduped(
  snapshots: TeamQualityResearchSnapshot[],
  v1ByKey = new Map<string, TeamIntelligenceSnapshot>(),
): Promise<TeamIntelligenceInsertResult> {
  const rows = buildTeamQualityResearchRows(snapshots, v1ByKey);
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
      invalid_reason: "SUPERSEDED_BY_TEAM_QUALITY_RESEARCH_CANONICAL_CAPTURE",
    })
    .eq("team_quality_version", TEAM_QUALITY_RESEARCH_VERSION)
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
  const gameReadinessComponents = row.game_readiness_components ?? {};
  const readinessCoveragePercent = Object.values(gameReadinessComponents as Record<string, any>).reduce((sum, component: any) => (
    component?.normalizedValue === undefined ? sum : sum + Number(component.weight ?? 0)
  ), 0) * 100;
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
      components: gameReadinessComponents,
      readinessCoveragePercent: round(readinessCoveragePercent),
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
    .eq("team_quality_version", TEAM_QUALITY_VERSION)
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
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("team_quality_version", TEAM_QUALITY_VERSION);
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, teamsTracked: 0, latestRefresh: undefined as string | undefined, errors: [error.message] };
  const { count: canonicalSnapshots } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("team_quality_version", TEAM_QUALITY_VERSION)
    .eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("team_id,captured_at,team_quality_score,team_quality_availability,game_readiness_score,game_readiness_availability,context_certainty_score,intelligence_confidence_tier")
    .eq("canonical", true)
    .eq("team_quality_version", TEAM_QUALITY_VERSION)
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

export async function getTeamQualityResearchStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("team_quality_version", TEAM_QUALITY_RESEARCH_VERSION);
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, errors: [error.message] };
  const { count: canonicalSnapshots } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("team_quality_version", TEAM_QUALITY_RESEARCH_VERSION)
    .eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("official_game_id,team_id,team_name,side,team_quality_v1_score,team_quality_v2_research_score,research_weight_version,team_quality_availability,quality_coverage,quality_confidence,quality_components,starting_pitcher_quality_score,starting_pitcher_quality_version,starting_pitcher_baseline_version,player_id,offense_score,bullpen_quality_score,game_readiness_score,captured_at")
    .eq("team_quality_version", TEAM_QUALITY_RESEARCH_VERSION)
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(300);
  const rows = data ?? [];
  const complete = rows.filter((row: any) => row.team_quality_availability === "AVAILABLE");
  const partial = rows.filter((row: any) => row.team_quality_availability === "PARTIAL" && Number(row.quality_coverage) >= 66);
  const limited = rows.filter((row: any) => row.team_quality_availability === "PARTIAL" && Number(row.quality_coverage) < 66);
  const v1v2 = compareTeamQualityV1V2(rows.map((row: any) => ({
    teamId: row.team_id,
    teamName: row.team_name,
    officialGameId: row.official_game_id,
    side: row.side,
    v1Score: row.team_quality_v1_score ?? undefined,
    v2Score: row.team_quality_v2_research_score ?? undefined,
  })));
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    latestCapture: rows[0]?.captured_at as string | undefined,
    completeCount: complete.length,
    partialCount: partial.length,
    limitedCount: limited.length,
    unavailableCount: rows.filter((row: any) => row.team_quality_availability === "UNAVAILABLE").length,
    distribution: researchScoreDistribution(complete.map((row: any) => row.team_quality_v2_research_score ?? undefined)),
    partialDistribution: researchScoreDistribution(partial.map((row: any) => row.team_quality_v2_research_score ?? undefined)),
    limitedDistribution: researchScoreDistribution(limited.map((row: any) => row.team_quality_v2_research_score ?? undefined)),
    confidenceDistribution: rows.reduce((acc: Record<string, number>, row: any) => {
      const tier = row.quality_confidence?.tier ?? "UNAVAILABLE";
      acc[tier] = (acc[tier] ?? 0) + 1;
      return acc;
    }, {}),
    v1VsV2Summary: v1v2,
    sensitivitySummary: buildResearchSensitivityFromRows(rows),
    baselineCompatibility: rows.every((row: any) => row.starting_pitcher_baseline_version === "starting_pitcher_baseline_v1"),
    starterMismatchCount: rows.filter((row: any) => !row.player_id).length,
    completeRows: complete.slice(0, 20),
    partialRows: partial.slice(0, 20),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}

export function teamQualityResearchAuditRankings(rows: TeamQualityResearchSnapshot[]) {
  const mapped = rows.map((row) => ({
    teamId: row.teamId,
    teamName: row.teamName,
    officialGameId: row.officialGameId,
    side: row.side,
    score: row.score,
    availability: row.availability,
    confidence: row.confidence.tier,
    coverage: row.qualityCoveragePercent,
    offense: row.offenseScore,
    startingPitcherQuality: row.startingPitcherQualityScore,
    bullpenQuality: row.bullpenQualityScore,
  }));
  return {
    complete: {
      label: "Atlas Complete Team Quality Research Audit",
      rows: mapped.filter((row) => row.availability === "AVAILABLE" && row.score !== undefined).toSorted((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    },
    partial: {
      label: "Atlas Partial Team Quality Research Audit",
      rows: mapped.filter((row) => row.availability === "PARTIAL" && row.score !== undefined).toSorted((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    },
    limited: {
      label: "Atlas Limited Team Quality Research Diagnostics",
      rows: mapped.filter((row) => row.availability === "LIMITED" && row.score !== undefined).toSorted((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    },
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
