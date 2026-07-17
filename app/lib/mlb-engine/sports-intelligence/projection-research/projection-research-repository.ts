import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { resolveMlbSlateDate, resolveMlbSlateWindow } from "@/app/lib/mlb-engine/slate-date";
import { loadLatestCanonicalBullpenTeamFeatures } from "../bullpen/bullpen-feature-repository";
import { loadLatestCanonicalWeatherParkFeatures } from "../weather/weather-feature-repository";
import {
  buildMlbProjectionResearch,
  MLB_PROJECTION_RESEARCH_VERSION,
  projectionDistribution,
  type MlbProjectionResearchSnapshot,
} from "./projection-research-engine";

const TABLE = "mlb_projection_research_snapshots";

export type ProjectionResearchCaptureResult = {
  asOf: string;
  gamesInspected: number;
  projections: MlbProjectionResearchSnapshot[];
  providerErrors: string[];
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

function rowNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function key(gameId?: string, side?: string) {
  return `${gameId ?? "none"}:${side ?? "none"}`;
}

async function loadTeamQualityResearchRows() {
  const supabase = getSupabaseAdmin();
  const { startUtc, endUtc } = resolveMlbSlateWindow();
  const { data, error } = await supabase
    .from("mlb_team_intelligence_snapshots")
    .select("official_game_id,team_id,team_name,side,team_quality_v2_research_score,team_quality_availability,quality_confidence,offense_score,starting_pitcher_quality_score,bullpen_quality_score,game_readiness_score,context_certainty_score,captured_at")
    .eq("team_quality_version", "team_quality_v2_research")
    .eq("canonical", true)
    .not("official_game_id", "is", null)
    .gte("captured_at", startUtc)
    .lt("captured_at", endUtc)
    .order("captured_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data ?? [];
}

export async function buildMlbProjectionResearchSnapshots(asOf = new Date().toISOString()): Promise<ProjectionResearchCaptureResult> {
  const [teamRows, bullpenRows, weatherRows] = await Promise.all([
    loadTeamQualityResearchRows(),
    loadLatestCanonicalBullpenTeamFeatures(),
    loadLatestCanonicalWeatherParkFeatures(),
  ]);
  const byGameSide = new Map(teamRows.map((row: any) => [key(row.official_game_id, row.side), row]));
  const bullpenByTeam = new Map(bullpenRows.map((team) => [team.teamId, team]));
  const weatherByGame = new Map(weatherRows.map((weather) => [weather.officialGameId, weather]));
  const gameIds: string[] = Array.from(
    new Set<string>(teamRows.map((row: any) => String(row.official_game_id ?? "")).filter(Boolean)),
  );

  const projections = gameIds.flatMap((officialGameId: string) => {
    const home: any = byGameSide.get(key(officialGameId, "HOME"));
    const away: any = byGameSide.get(key(officialGameId, "AWAY"));
    if (!home || !away) return [];
    const homeBullpen = bullpenByTeam.get(home.team_id);
    const awayBullpen = bullpenByTeam.get(away.team_id);
    const weather = weatherByGame.get(officialGameId);
    return buildMlbProjectionResearch({
      officialGameId,
      home: {
        teamId: String(home.team_id),
        teamName: String(home.team_name),
        teamQuality: rowNumber(home.team_quality_v2_research_score),
        offense: rowNumber(home.offense_score),
        startingPitcherQuality: rowNumber(home.starting_pitcher_quality_score),
        bullpenQuality: rowNumber(home.bullpen_quality_score),
        bullpenFatigue: rowNumber(homeBullpen?.fatigueScoreV2 ?? homeBullpen?.fatigueScore),
        gameReadiness: rowNumber(home.game_readiness_score),
        contextCertainty: rowNumber(home.context_certainty_score),
        qualityAvailability: home.team_quality_availability,
        confidenceTier: home.quality_confidence?.tier,
      },
      away: {
        teamId: String(away.team_id),
        teamName: String(away.team_name),
        teamQuality: rowNumber(away.team_quality_v2_research_score),
        offense: rowNumber(away.offense_score),
        startingPitcherQuality: rowNumber(away.starting_pitcher_quality_score),
        bullpenQuality: rowNumber(away.bullpen_quality_score),
        bullpenFatigue: rowNumber(awayBullpen?.fatigueScoreV2 ?? awayBullpen?.fatigueScore),
        gameReadiness: rowNumber(away.game_readiness_score),
        contextCertainty: rowNumber(away.context_certainty_score),
        qualityAvailability: away.team_quality_availability,
        confidenceTier: away.quality_confidence?.tier,
      },
      weatherRunEnvironment: rowNumber(weather?.runEnvironmentScore),
      parkEnvironment: rowNumber(weather?.parkEnvironmentScore),
      asOf,
    });
  });

  return {
    asOf,
    gamesInspected: gameIds.length,
    projections,
    providerErrors: [],
  };
}

export function buildProjectionResearchRows(projections: MlbProjectionResearchSnapshot[]) {
  const slateDate = resolveMlbSlateDate();
  return projections.map((projection) => {
    const payload = {
      officialGameId: projection.officialGameId,
      homeTeamId: projection.homeTeamId,
      awayTeamId: projection.awayTeamId,
      projectedHomeRuns: projection.projectedHomeRuns,
      projectedAwayRuns: projection.projectedAwayRuns,
      projectedTotalRuns: projection.projectedTotalRuns,
      homeWinProbability: projection.homeWinProbability,
      awayWinProbability: projection.awayWinProbability,
      componentBreakdown: projection.componentBreakdown,
      modelVersion: projection.modelVersion,
      slateDate,
    };
    return {
      slate_date: slateDate,
      official_game_id: projection.officialGameId,
      home_team_id: projection.homeTeamId,
      home_team_name: projection.homeTeamName,
      away_team_id: projection.awayTeamId,
      away_team_name: projection.awayTeamName,
      projected_home_runs: projection.projectedHomeRuns,
      projected_away_runs: projection.projectedAwayRuns,
      projected_total_runs: projection.projectedTotalRuns,
      home_win_probability: projection.homeWinProbability,
      away_win_probability: projection.awayWinProbability,
      fair_moneyline_home: projection.fairMoneylineHome,
      fair_moneyline_away: projection.fairMoneylineAway,
      projection_confidence_score: projection.projectionConfidence.score,
      projection_confidence_tier: projection.projectionConfidence.tier,
      projection_availability: projection.availability,
      component_breakdown: projection.componentBreakdown,
      source_versions: projection.sourceVersions,
      model_version: projection.modelVersion,
      warnings: projection.warnings,
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: projection.capturedAt,
      source_updated_at: projection.capturedAt,
      freshness_status: "FRESH",
      freshness_reason: "CAPTURED_FOR_CURRENT_ET_SLATE",
    };
  });
}

export async function insertProjectionResearchSnapshotsDeduped(projections: MlbProjectionResearchSnapshot[]) {
  const rows = buildProjectionResearchRows(projections);
  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "feature_hash", ignoreDuplicates: true })
    .select("id");
  if (error) return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };
  const hashes = rows.map((row) => row.feature_hash);
  const quotedHashes = hashes.map((hash) => `"${hash}"`).join(",");
  const markOld = await supabase
    .from(TABLE)
    .update({
      canonical: false,
      superseded_at: new Date().toISOString(),
      invalid_reason: "SUPERSEDED_BY_MLB_PROJECTION_RESEARCH_CAPTURE",
    })
    .eq("model_version", MLB_PROJECTION_RESEARCH_VERSION)
    .eq("slate_date", rows[0]?.slate_date)
    .not("feature_hash", "in", `(${quotedHashes})`)
    .eq("canonical", true);
  if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };
  const markCurrent = await supabase
    .from(TABLE)
    .update({ canonical: true, superseded_at: null, invalid_reason: null, freshness_status: "FRESH", freshness_reason: "CAPTURED_FOR_CURRENT_ET_SLATE" })
    .in("feature_hash", hashes);
  if (markCurrent.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };
  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] as string[] };
}

function countBy(rows: any[], keyName: string) {
  return rows.reduce((acc: Record<string, number>, row) => {
    const value = row[keyName] ?? "UNAVAILABLE";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getProjectionResearchStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("model_version", MLB_PROJECTION_RESEARCH_VERSION);
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, errors: [error.message] };
  const { count: canonicalSnapshots } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("model_version", MLB_PROJECTION_RESEARCH_VERSION)
    .eq("slate_date", resolveMlbSlateDate())
    .eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("official_game_id,home_team_name,away_team_name,projected_home_runs,projected_away_runs,projected_total_runs,home_win_probability,away_win_probability,fair_moneyline_home,fair_moneyline_away,projection_confidence_score,projection_confidence_tier,projection_availability,component_breakdown,captured_at,slate_date,freshness_status,freshness_reason")
    .eq("model_version", MLB_PROJECTION_RESEARCH_VERSION)
    .eq("slate_date", resolveMlbSlateDate())
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    latestCapture: rows[0]?.captured_at as string | undefined,
    gamesProjected: rows.length,
    availabilityCounts: countBy(rows, "projection_availability"),
    confidenceCounts: countBy(rows, "projection_confidence_tier"),
    projectedTotalDistribution: projectionDistribution(rows.map((row: any) => rowNumber(row.projected_total_runs))),
    homeWinProbabilityDistribution: projectionDistribution(rows.map((row: any) => rowNumber(row.home_win_probability))),
    examples: rows.slice(0, 5),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}

export function projectionResearchAuditRankings(projections: MlbProjectionResearchSnapshot[]) {
  const rows = projections
    .filter((projection) => isNumber(projection.projectedTotalRuns))
    .toSorted((a, b) => (b.projectedTotalRuns ?? 0) - (a.projectedTotalRuns ?? 0));
  return {
    highestTotals: rows.slice(0, 5),
    lowestTotals: [...rows].reverse().slice(0, 5),
  };
}
