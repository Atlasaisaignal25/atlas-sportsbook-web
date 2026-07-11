import crypto from "node:crypto";
import {
  buildConsensusMovementFromSnapshots,
  normalizeMlbMarketName,
} from "@/app/lib/mlb-engine/marketFeatures";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { getRecentSnapshots } from "@/lib/market-impact/odds/snapshotRepository";
import { loadLatestCanonicalBullpenTeamFeatures } from "../bullpen/bullpen-feature-repository";
import {
  buildAtlasDecisionResearch,
  decisionDistribution,
  MLB_DECISION_RESEARCH_VERSION,
  type DecisionResearchSnapshot,
  type MarketIntelligenceInput,
} from "./decision-research-engine";

const TABLE = "mlb_decision_research_snapshots";

type ProjectionRow = {
  official_game_id: string;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  projected_home_runs: number | string | null;
  projected_away_runs: number | string | null;
  projected_total_runs: number | string | null;
  home_win_probability: number | string | null;
  away_win_probability: number | string | null;
  projection_confidence_score: number | string | null;
  projection_availability: string;
  component_breakdown: any;
  captured_at: string;
};

type TeamResearchRow = {
  official_game_id: string;
  team_id: string;
  team_name: string;
  side: "HOME" | "AWAY";
  team_quality_v2_research_score: number | string | null;
  offense_score: number | string | null;
  starting_pitcher_quality_score: number | string | null;
  bullpen_quality_score: number | string | null;
  game_readiness_score: number | string | null;
  context_certainty_score: number | string | null;
};

export type DecisionResearchCaptureResult = {
  asOf: string;
  gamesInspected: number;
  decisions: DecisionResearchSnapshot[];
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

function rowNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function gameSideKey(gameId?: string, side?: string) {
  return `${gameId ?? "none"}:${side ?? "none"}`;
}

function teamGameKey(homeTeam: string, awayTeam: string) {
  return `${normalizeMlbMarketName(homeTeam)}|${normalizeMlbMarketName(awayTeam)}`;
}

async function loadCanonicalProjectionRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_projection_research_snapshots")
    .select("official_game_id,home_team_id,home_team_name,away_team_id,away_team_name,projected_home_runs,projected_away_runs,projected_total_runs,home_win_probability,away_win_probability,projection_confidence_score,projection_availability,component_breakdown,captured_at")
    .eq("model_version", "mlb_projection_research_v1")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ProjectionRow[];
}

async function loadTeamResearchRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_team_intelligence_snapshots")
    .select("official_game_id,team_id,team_name,side,team_quality_v2_research_score,offense_score,starting_pitcher_quality_score,bullpen_quality_score,game_readiness_score,context_certainty_score")
    .eq("team_quality_version", "team_quality_v2_research")
    .eq("canonical", true)
    .not("official_game_id", "is", null)
    .limit(300);
  if (error) throw error;
  return (data ?? []) as TeamResearchRow[];
}

async function buildMarketIntelligenceByGame() {
  const snapshots = await getRecentSnapshots("MLB", 180);
  const booksByEvent = new Map<string, Set<string>>();
  snapshots.forEach((snapshot) => {
    const books = booksByEvent.get(snapshot.eventId) ?? new Set<string>();
    books.add(snapshot.bookmaker);
    booksByEvent.set(snapshot.eventId, books);
  });
  const monitored = new Map(Array.from(booksByEvent.entries()).map(([eventId, books]) => [eventId, books.size]));
  const movements = buildConsensusMovementFromSnapshots(snapshots, monitored);
  const byTeams = new Map<string, MarketIntelligenceInput>();
  movements.forEach((movement) => {
    const sample = snapshots.find((snapshot) => snapshot.eventId === movement.eventId);
    if (!sample) return;
    const key = teamGameKey(sample.homeTeam, sample.awayTeam);
    const current = byTeams.get(key);
    const nextMagnitude = movement.magnitudeScore ?? 0;
    const currentMagnitude = current?.magnitudeScore ?? -1;
    if (!current || nextMagnitude > currentMagnitude) {
      byTeams.set(key, {
        movementCount: movements.filter((item) => item.eventId === movement.eventId).length,
        strongestDirection: movement.direction,
        strongestImpact: movement.impact,
        sportsbookCount: movement.sportsbookCount,
        consensusPercent: movement.consensusPercent,
        magnitudeScore: movement.magnitudeScore,
      });
    }
  });
  return byTeams;
}

export async function buildDecisionResearchSnapshots(asOf = new Date().toISOString()): Promise<DecisionResearchCaptureResult> {
  const [projections, teamRows, marketByGame, bullpenRows] = await Promise.all([
    loadCanonicalProjectionRows(),
    loadTeamResearchRows(),
    buildMarketIntelligenceByGame(),
    loadLatestCanonicalBullpenTeamFeatures(),
  ]);
  const teamByGameSide = new Map(teamRows.map((row) => [gameSideKey(row.official_game_id, row.side), row]));
  const bullpenByTeam = new Map(bullpenRows.map((team) => [team.teamId, team]));

  const decisions = projections.map((projection) => {
    const home = teamByGameSide.get(gameSideKey(projection.official_game_id, "HOME"));
    const away = teamByGameSide.get(gameSideKey(projection.official_game_id, "AWAY"));
    const homeBullpen = bullpenByTeam.get(projection.home_team_id);
    const awayBullpen = bullpenByTeam.get(projection.away_team_id);
    const environment = projection.component_breakdown?.environment ?? {};
    const marketIntelligence = marketByGame.get(teamGameKey(projection.home_team_name, projection.away_team_name)) ?? {
      movementCount: 0,
      warnings: ["No recent matched Market Intelligence movement for this official game."],
    };

    return buildAtlasDecisionResearch({
      officialGameId: projection.official_game_id,
      home: {
        teamId: projection.home_team_id,
        teamName: projection.home_team_name,
        teamQuality: rowNumber(home?.team_quality_v2_research_score),
        offense: rowNumber(home?.offense_score),
        pitcherQuality: rowNumber(home?.starting_pitcher_quality_score),
        bullpenQuality: rowNumber(home?.bullpen_quality_score),
        bullpenFatigue: rowNumber(homeBullpen?.fatigueScoreV2 ?? homeBullpen?.fatigueScore),
        gameReadiness: rowNumber(home?.game_readiness_score),
        contextCertainty: rowNumber(home?.context_certainty_score),
      },
      away: {
        teamId: projection.away_team_id,
        teamName: projection.away_team_name,
        teamQuality: rowNumber(away?.team_quality_v2_research_score),
        offense: rowNumber(away?.offense_score),
        pitcherQuality: rowNumber(away?.starting_pitcher_quality_score),
        bullpenQuality: rowNumber(away?.bullpen_quality_score),
        bullpenFatigue: rowNumber(awayBullpen?.fatigueScoreV2 ?? awayBullpen?.fatigueScore),
        gameReadiness: rowNumber(away?.game_readiness_score),
        contextCertainty: rowNumber(away?.context_certainty_score),
      },
      projectedHomeRuns: rowNumber(projection.projected_home_runs),
      projectedAwayRuns: rowNumber(projection.projected_away_runs),
      projectedTotalRuns: rowNumber(projection.projected_total_runs),
      homeWinProbability: rowNumber(projection.home_win_probability),
      awayWinProbability: rowNumber(projection.away_win_probability),
      projectionConfidenceScore: rowNumber(projection.projection_confidence_score),
      projectionAvailability: projection.projection_availability,
      weatherRunEnvironment: rowNumber(environment.weatherRunEnvironment),
      parkEnvironment: rowNumber(environment.parkEnvironment),
      marketIntelligence,
      asOf,
    });
  });

  return {
    asOf,
    gamesInspected: projections.length,
    decisions,
    providerErrors: [],
  };
}

export function buildDecisionResearchRows(decisions: DecisionResearchSnapshot[]) {
  return decisions.map((decision) => {
    const payload = {
      officialGameId: decision.officialGameId,
      homeTeamId: decision.homeTeamId,
      awayTeamId: decision.awayTeamId,
      consensus: decision.consensus,
      conviction: decision.conviction,
      decision: decision.decision,
      noPick: decision.noPick,
      modelVersion: decision.modelVersion,
    };
    return {
      official_game_id: decision.officialGameId,
      home_team_id: decision.homeTeamId,
      home_team_name: decision.homeTeamName,
      away_team_id: decision.awayTeamId,
      away_team_name: decision.awayTeamName,
      consensus_grade: decision.consensus.grade,
      consensus_side: decision.consensus.side,
      consensus_score: decision.consensus.score,
      module_agreement: decision.consensus.moduleAgreement,
      conviction_grade: decision.conviction.grade,
      conviction_score: decision.conviction.score,
      decision: decision.decision,
      no_pick: decision.noPick.isNoPick,
      no_pick_reasons: decision.noPick.reasons,
      decision_confidence_score: decision.decisionConfidence.score,
      decision_confidence_tier: decision.decisionConfidence.tier,
      input_coverage: decision.decisionConfidence.coveragePercent,
      component_breakdown: decision.componentBreakdown,
      source_versions: decision.sourceVersions,
      model_version: decision.modelVersion,
      feature_hash: featureHash(payload),
      canonical: true,
      captured_at: decision.capturedAt,
    };
  });
}

export async function insertDecisionResearchSnapshotsDeduped(decisions: DecisionResearchSnapshot[]) {
  const rows = buildDecisionResearchRows(decisions);
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
      invalid_reason: "SUPERSEDED_BY_MLB_DECISION_RESEARCH_CAPTURE",
    })
    .eq("model_version", MLB_DECISION_RESEARCH_VERSION)
    .not("feature_hash", "in", `(${quotedHashes})`)
    .eq("canonical", true);
  if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };

  const markCurrent = await supabase
    .from(TABLE)
    .update({ canonical: true, superseded_at: null, invalid_reason: null })
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

export async function getDecisionResearchStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("model_version", MLB_DECISION_RESEARCH_VERSION);
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, errors: [error.message] };
  const { count: canonicalSnapshots } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("model_version", MLB_DECISION_RESEARCH_VERSION)
    .eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from(TABLE)
    .select("official_game_id,home_team_name,away_team_name,consensus_grade,consensus_side,consensus_score,module_agreement,conviction_grade,conviction_score,decision,no_pick,no_pick_reasons,decision_confidence_score,decision_confidence_tier,input_coverage,component_breakdown,captured_at")
    .eq("model_version", MLB_DECISION_RESEARCH_VERSION)
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    latestCapture: rows[0]?.captured_at as string | undefined,
    gamesDecided: rows.length,
    consensusDistribution: countBy(rows, "consensus_grade"),
    convictionDistribution: countBy(rows, "conviction_grade"),
    decisionDistribution: countBy(rows, "decision"),
    noPickCount: rows.filter((row: any) => Boolean(row.no_pick)).length,
    noPickReasons: decisionDistribution(rows.flatMap((row: any) => row.no_pick_reasons ?? [])),
    examples: rows.slice(0, 5),
    noPickExamples: rows.filter((row: any) => Boolean(row.no_pick)).slice(0, 5),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}
