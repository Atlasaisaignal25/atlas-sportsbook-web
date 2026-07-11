import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import {
  buildTeamQualityResearch,
  DEFAULT_TEAM_QUALITY_RESEARCH_WEIGHTS,
  TEAM_QUALITY_RESEARCH_VERSION,
  TEAM_QUALITY_RESEARCH_WEIGHT_VERSION,
  TEAM_QUALITY_RESEARCH_WEIGHTS,
  type TeamQualityResearchInput,
} from "../app/lib/mlb-engine/sports-intelligence/team-intelligence/team-quality-research-engine";
import { buildTeamQualityResearchRows } from "../app/lib/mlb-engine/sports-intelligence/team-intelligence/team-intelligence-repository";

function baseInput(overrides: Partial<TeamQualityResearchInput> = {}): TeamQualityResearchInput {
  return {
    officialGameId: "game-1",
    teamId: "116",
    teamName: "Detroit Tigers",
    side: "HOME",
    offenseScore: 74,
    offenseVersion: "atlas_offensive_score_v1",
    offenseConfidence: 85,
    startingPitcherQualityScore: 68,
    startingPitcherQualityVersion: "starting_pitcher_quality_v1",
    startingPitcherBaselineVersion: "starting_pitcher_baseline_v1",
    startingPitcherBaselineSource: "PRODUCTION_BASELINE",
    startingPitcherId: "pitcher-1",
    startingPitcherName: "Verified Starter",
    startingPitcherConfidence: 80,
    bullpenQualityScore: 58,
    bullpenQualityVersion: "bullpen_quality_score_v2",
    bullpenConfidence: 78,
    gameReadiness: {
      score: 22,
      version: "game_readiness_v1",
      readinessCoveragePercent: 100,
      availability: "AVAILABLE",
      confidence: "HIGH",
      components: {},
      warnings: ["Low readiness fixture for research isolation."],
    },
    weights: DEFAULT_TEAM_QUALITY_RESEARCH_WEIGHTS,
    weightVersion: TEAM_QUALITY_RESEARCH_WEIGHT_VERSION,
    asOf: "2026-07-11T12:00:00.000Z",
    warnings: [],
    ...overrides,
  };
}

function inRange(value: number | undefined) {
  assert.ok(value !== undefined);
  assert.ok(value >= 0 && value <= 100);
}

async function assertNoPublicScoringReferences() {
  const files = [
    "app/lib/mlb-engine/candidate.ts",
    "app/lib/mlb-engine/scoring.ts",
    "app/api/cron/automationUtils.ts",
    "app/page.tsx",
  ];
  for (const file of files) {
    try {
      const text = await fs.readFile(file, "utf8");
      assert.doesNotMatch(
        text,
        /team_quality_v2_research|MLB_TEAM_QUALITY_RESEARCH|teamQualityResearch/i,
        `${file} must not connect Team Quality Research to public scoring, picks, or UI.`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const projection = await fs.readFile("app/lib/mlb-engine/sports-intelligence/projection.ts", "utf8");
  assert.match(projection, /projectionAvailability: "UNAVAILABLE"/);
  assert.doesNotMatch(projection, /teamQualityResearch|team_quality_v2_research/i);
}

async function main() {
  const base = buildTeamQualityResearch(baseInput());
  assert.equal(base.version, TEAM_QUALITY_RESEARCH_VERSION);
  assert.equal(base.weightVersion, TEAM_QUALITY_RESEARCH_WEIGHT_VERSION);
  assert.equal(base.availability, "AVAILABLE");
  assert.equal(base.qualityCoveragePercent, 100);
  assert.equal(base.confidence.baselineCompatibility, true);
  inRange(base.score);

  const betterPitcher = buildTeamQualityResearch(baseInput({ startingPitcherQualityScore: 92 }));
  assert.ok((betterPitcher.score ?? 0) > (base.score ?? 0), "Starting Pitcher Quality must enter Team Quality Research.");

  const betterOffense = buildTeamQualityResearch(baseInput({ offenseScore: 94 }));
  assert.ok((betterOffense.score ?? 0) > (base.score ?? 0), "Atlas Offensive Score must enter Team Quality Research.");

  const betterBullpen = buildTeamQualityResearch(baseInput({ bullpenQualityScore: 92 }));
  assert.ok((betterBullpen.score ?? 0) > (base.score ?? 0), "Bullpen Quality v2 must enter Team Quality Research.");

  const highReadiness = buildTeamQualityResearch(baseInput({
    gameReadiness: {
      ...baseInput().gameReadiness!,
      score: 98,
      warnings: [],
    },
  }));
  assert.equal(highReadiness.score, base.score, "Game Readiness must be preserved but not used in Team Quality Research.");

  const highConfidence = buildTeamQualityResearch(baseInput({
    offenseConfidence: 99,
    startingPitcherConfidence: 99,
    bullpenConfidence: 99,
  }));
  assert.equal(highConfidence.score, base.score, "Intelligence confidence must not change Team Quality Research score.");
  assert.ok((highConfidence.confidence.score ?? 0) > (base.confidence.score ?? 0));

  const incompatiblePitcher = buildTeamQualityResearch(baseInput({ startingPitcherBaselineSource: "INITIAL_PRIOR_FALLBACK" }));
  assert.equal(incompatiblePitcher.availability, "PARTIAL");
  assert.equal(incompatiblePitcher.components.startingPitcherQuality?.availability, "UNAVAILABLE");
  assert.equal(incompatiblePitcher.confidence.baselineCompatibility, false);

  const changedStarter = buildTeamQualityResearch(baseInput({ startingPitcherId: "pitcher-2", startingPitcherName: "Changed Starter" }));
  const rows = buildTeamQualityResearchRows([base, { ...base, capturedAt: "2026-07-11T12:10:00.000Z" }, changedStarter]);
  assert.equal(rows[0].feature_hash, rows[1].feature_hash, "Identical research state must dedupe.");
  assert.notEqual(rows[0].feature_hash, rows[2].feature_hash, "Changed starter must create a distinct research state.");
  assert.equal(rows[0].team_quality_version, TEAM_QUALITY_RESEARCH_VERSION);
  assert.equal(rows[0].team_quality_v2_research_score, base.score);
  assert.equal(rows[0].starting_pitcher_id, "pitcher-1");

  const missingOffense = buildTeamQualityResearch(baseInput({ offenseScore: undefined }));
  assert.equal(missingOffense.availability, "PARTIAL");
  assert.notEqual(missingOffense.score, 0, "Missing offense must not become zero.");

  const pitcherOnly = buildTeamQualityResearch(baseInput({ offenseScore: undefined, bullpenQualityScore: undefined }));
  assert.equal(pitcherOnly.availability, "LIMITED");
  assert.notEqual(pitcherOnly.score, 0, "Limited coverage must preserve known evidence instead of fabricating zeros.");

  const unavailable = buildTeamQualityResearch(baseInput({
    offenseScore: undefined,
    startingPitcherQualityScore: undefined,
    bullpenQualityScore: undefined,
  }));
  assert.equal(unavailable.availability, "UNAVAILABLE");
  assert.equal(unavailable.score, undefined);

  const highQualityLowReadiness = buildTeamQualityResearch(baseInput({
    offenseScore: 94,
    startingPitcherQualityScore: 93,
    bullpenQualityScore: 90,
    gameReadiness: { ...baseInput().gameReadiness!, score: 18 },
  }));
  assert.ok((highQualityLowReadiness.score ?? 0) > 85);
  assert.equal(highQualityLowReadiness.gameReadiness?.score, 18);

  const lowQualityHighReadiness = buildTeamQualityResearch(baseInput({
    offenseScore: 32,
    startingPitcherQualityScore: 35,
    bullpenQualityScore: 30,
    gameReadiness: { ...baseInput().gameReadiness!, score: 96 },
  }));
  assert.ok((lowQualityHighReadiness.score ?? 0) < 40);
  assert.equal(lowQualityHighReadiness.gameReadiness?.score, 96);

  Object.entries(TEAM_QUALITY_RESEARCH_WEIGHTS).forEach(([label, weights]) => {
    const total = weights.startingPitcherQuality + weights.offense + weights.bullpenQuality;
    assert.equal(Math.round(total * 1000) / 1000, 1, `${label} weights must normalize to 1.`);
  });

  const envExample = await fs.readFile(".env.example", "utf8");
  assert.match(envExample, /MLB_TEAM_QUALITY_RESEARCH_ENABLED=false/);
  assert.match(envExample, /MLB_TEAM_QUALITY_RESEARCH_MODE=RESEARCH_ONLY/);
  assert.match(envExample, /MLB_TEAM_QUALITY_RESEARCH_WEIGHT_VERSION=tq_research_v1/);

  const auditRoute = await fs.readFile("app/api/internal/mlb-engine-audit/route.ts", "utf8");
  assert.match(auditRoute, /teamQualityResearch/);
  assert.match(auditRoute, /publicScoringImpact: "NONE"/);

  await assertNoPublicScoringReferences();

  console.log("validate:mlb-team-quality-research passed");
  console.log(JSON.stringify({
    version: base.version,
    weightVersion: base.weightVersion,
    exampleScore: base.score,
    componentBreakdown: base.components,
    confidence: base.confidence,
    partialScore: missingOffense.score,
    limitedScore: pitcherOnly.score,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
