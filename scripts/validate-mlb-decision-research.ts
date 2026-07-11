import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildAtlasDecisionResearch,
  MLB_DECISION_RESEARCH_VERSION,
  type DecisionResearchInput,
} from "../app/lib/mlb-engine/sports-intelligence/decision-research/decision-research-engine";

const completeInput: DecisionResearchInput = {
  officialGameId: "mlb-decision-v1-example",
  asOf: "2026-07-11T18:00:00.000Z",
  home: {
    teamId: "147",
    teamName: "New York Yankees",
    teamQuality: 68,
    offense: 72,
    pitcherQuality: 66,
    bullpenQuality: 62,
    bullpenFatigue: 43,
    gameReadiness: 82,
    contextCertainty: 84,
  },
  away: {
    teamId: "111",
    teamName: "Boston Red Sox",
    teamQuality: 51,
    offense: 48,
    pitcherQuality: 47,
    bullpenQuality: 45,
    bullpenFatigue: 65,
    gameReadiness: 70,
    contextCertainty: 78,
  },
  projectedHomeRuns: 5.45,
  projectedAwayRuns: 3.92,
  projectedTotalRuns: 9.37,
  homeWinProbability: 0.702,
  awayWinProbability: 0.298,
  projectionConfidenceScore: 94,
  projectionAvailability: "AVAILABLE",
  weatherRunEnvironment: 56,
  parkEnvironment: 54,
  marketIntelligence: {
    movementCount: 2,
    strongestDirection: "STEAM",
    strongestImpact: "MEDIUM",
    sportsbookCount: 4,
    consensusPercent: 75,
    magnitudeScore: 18,
  },
};

function clone(input: DecisionResearchInput): DecisionResearchInput {
  return structuredClone(input);
}

function assertDecisionEngine() {
  const decision = buildAtlasDecisionResearch(completeInput);
  assert.equal(decision.modelVersion, MLB_DECISION_RESEARCH_VERSION);
  assert.equal(decision.consensus.side, "HOME");
  assert.match(decision.consensus.grade, /HOME/);
  assert.equal(decision.conviction.grade, "HIGH");
  assert.equal(decision.decision, "HOME_ML");
  assert.equal(decision.noPick.isNoPick, false);
  assert.ok(decision.decisionConfidence.score! >= 80);
  assert.equal(decision.sourceVersions.projectionResearch, "mlb_projection_research_v1");

  const noConsensus = clone(completeInput);
  noConsensus.home.teamQuality = 51;
  noConsensus.away.teamQuality = 50;
  noConsensus.home.offense = 50;
  noConsensus.away.offense = 50;
  noConsensus.home.pitcherQuality = 50;
  noConsensus.away.pitcherQuality = 50;
  noConsensus.home.bullpenQuality = 50;
  noConsensus.away.bullpenQuality = 50;
  noConsensus.home.bullpenFatigue = 50;
  noConsensus.away.bullpenFatigue = 50;
  noConsensus.projectedHomeRuns = 4.36;
  noConsensus.projectedAwayRuns = 4.34;
  noConsensus.projectedTotalRuns = 8.7;
  noConsensus.homeWinProbability = 0.503;
  noConsensus.awayWinProbability = 0.497;
  noConsensus.weatherRunEnvironment = 50;
  noConsensus.parkEnvironment = 50;
  const noPick = buildAtlasDecisionResearch(noConsensus);
  assert.equal(noPick.decision, "NO_PICK");
  assert.equal(noPick.noPick.isNoPick, true);
  assert.ok(noPick.noPick.reasons.includes("Consensus did not align across modules."));

  const partial = clone(completeInput);
  delete partial.home.offense;
  delete partial.away.offense;
  delete partial.weatherRunEnvironment;
  delete partial.parkEnvironment;
  partial.projectionAvailability = "PARTIAL";
  const partialDecision = buildAtlasDecisionResearch(partial);
  assert.equal(partialDecision.noPick.isNoPick, true);
  assert.ok(partialDecision.noPick.reasons.includes("Projection Research is not fully available."));
  assert.notEqual(partialDecision.decisionConfidence.score, undefined);
}

async function assertResearchOnlyIsolation() {
  const automationUtils = await readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(automationUtils.includes("decision-research"), false);
  assert.equal(automationUtils.includes("MLB_DECISION_RESEARCH"), false);

  const publicHome = await readFile("app/page.tsx", "utf8");
  assert.equal(publicHome.includes("atlasDecisionResearch"), false);
  assert.equal(publicHome.includes("decision-research"), false);

  const packageJson = await readFile("package.json", "utf8");
  assert.match(packageJson, /validate:mlb-decision-research/);

  const route = await readFile("app/api/internal/mlb-sports-intelligence/decision-research/capture/route.ts", "utf8");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /RESEARCH_ONLY/);
  assert.match(route, /publicScoringImpact/);

  const auditRoute = await readFile("app/api/internal/mlb-engine-audit/route.ts", "utf8");
  assert.match(auditRoute, /atlasDecisionResearch/);
  assert.match(auditRoute, /candidateScore/);

  const candidateSource = await readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.match(candidateSource, /function candidateScore/);
  assert.match(candidateSource, /function buildCandidate/);
  assert.equal(candidateSource.includes("buildAtlasDecisionResearch"), false);
}

async function main() {
  assertDecisionEngine();
  await assertResearchOnlyIsolation();
  console.log("validate:mlb-decision-research passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
