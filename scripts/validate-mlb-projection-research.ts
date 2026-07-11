import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildMlbProjectionResearch,
  MLB_PROJECTION_RESEARCH_VERSION,
  projectionDistribution,
  type MlbProjectionResearchInput,
} from "../app/lib/mlb-engine/sports-intelligence/projection-research/projection-research-engine";
import { buildMlbSportsProjection } from "../app/lib/mlb-engine/sports-intelligence/projection";

const completeInput: MlbProjectionResearchInput = {
  officialGameId: "mlb-2026-07-11-example",
  asOf: "2026-07-11T16:00:00.000Z",
  home: {
    teamId: "147",
    teamName: "New York Yankees",
    teamQuality: 66,
    offense: 71,
    startingPitcherQuality: 62,
    bullpenQuality: 58,
    bullpenFatigue: 45,
    gameReadiness: 82,
    contextCertainty: 88,
  },
  away: {
    teamId: "111",
    teamName: "Boston Red Sox",
    teamQuality: 54,
    offense: 49,
    startingPitcherQuality: 52,
    bullpenQuality: 47,
    bullpenFatigue: 63,
    gameReadiness: 74,
    contextCertainty: 86,
  },
  weatherRunEnvironment: 57,
  parkEnvironment: 55,
};

function clone(input: MlbProjectionResearchInput): MlbProjectionResearchInput {
  return structuredClone(input);
}

function assertProjectionMath() {
  const complete = buildMlbProjectionResearch(completeInput);
  assert.equal(complete.modelVersion, MLB_PROJECTION_RESEARCH_VERSION);
  assert.equal(complete.availability, "AVAILABLE");
  assert.equal(complete.projectedHomeRuns, 5.7);
  assert.equal(complete.projectedAwayRuns, 4.14);
  assert.equal(complete.projectedTotalRuns, 9.84);
  assert.equal(complete.homeWinProbability, 0.7055);
  assert.equal(complete.awayWinProbability, 0.2945);
  assert.equal(complete.fairMoneylineHome, -240);
  assert.equal(complete.fairMoneylineAway, 240);
  assert.equal(complete.projectionConfidence.tier, "HIGH");
  assert.match(String(complete.componentBreakdown.documentedTransform), /delta from neutral 50/);

  const partialInput = clone(completeInput);
  delete partialInput.away.offense;
  const partial = buildMlbProjectionResearch(partialInput);
  assert.equal(partial.availability, "PARTIAL");
  assert.equal(partial.projectionConfidence.criticalCoveragePercent, 87.5);
  assert.equal(partial.projectedAwayRuns, 4.16);
  assert.notEqual(partial.projectedAwayRuns, 0, "Missing data must not become zero.");

  const unavailableInput = clone(completeInput);
  delete unavailableInput.home.teamQuality;
  delete unavailableInput.away.teamQuality;
  delete unavailableInput.home.offense;
  delete unavailableInput.away.offense;
  delete unavailableInput.home.startingPitcherQuality;
  const unavailable = buildMlbProjectionResearch(unavailableInput);
  assert.equal(unavailable.availability, "UNAVAILABLE");
  assert.equal(unavailable.projectedTotalRuns, undefined);

  const weatherUnavailableInput = clone(completeInput);
  delete weatherUnavailableInput.weatherRunEnvironment;
  delete weatherUnavailableInput.parkEnvironment;
  const weatherUnavailable = buildMlbProjectionResearch(weatherUnavailableInput);
  assert.equal(weatherUnavailable.availability, "AVAILABLE");
  assert.ok(weatherUnavailable.warnings.includes("Weather run environment unavailable."));
  assert.ok(weatherUnavailable.warnings.includes("Park environment unavailable."));
  assert.equal(weatherUnavailable.projectedTotalRuns, 9.63);

  const starterMismatchInput = clone(completeInput);
  starterMismatchInput.warnings = ["Starter mismatch detected by verified upstream evidence."];
  const starterMismatch = buildMlbProjectionResearch(starterMismatchInput);
  assert.equal(starterMismatch.availability, "AVAILABLE");
  assert.ok(starterMismatch.projectionConfidence.score! < complete.projectionConfidence.score!);
  assert.ok(starterMismatch.warnings.some((warning) => warning.includes("Starter mismatch")));

  const distribution = projectionDistribution([
    complete.projectedTotalRuns,
    partial.projectedTotalRuns,
    weatherUnavailable.projectedTotalRuns,
  ]);
  assert.equal(distribution.count, 3);
  assert.equal(distribution.max, 9.86);
}

async function assertResearchOnlyIsolation() {
  const projection = await readFile("app/lib/mlb-engine/sports-intelligence/projection.ts", "utf8");
  assert.equal(projection.includes("mlb_projection_research"), false);
  assert.equal(projection.includes("Team Quality Research"), false);

  const automationUtils = await readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(automationUtils.includes("projection-research"), false);
  assert.equal(automationUtils.includes("MLB_PROJECTION_RESEARCH"), false);

  const publicHome = await readFile("app/page.tsx", "utf8");
  assert.equal(publicHome.includes("mlbProjectionResearch"), false);
  assert.equal(publicHome.includes("projection-research"), false);

  const engine = await readFile("app/lib/mlb-engine/sports-intelligence/projection-research/projection-research-engine.ts", "utf8");
  assert.equal(/\bodds\b|\bmarket line\b|\bsportsbook\b/i.test(engine), false, "Projection Research v1 must not use market odds.");

  const packageJson = await readFile("package.json", "utf8");
  assert.match(packageJson, /validate:mlb-projection-research/);

  const route = await readFile("app/api/internal/mlb-sports-intelligence/projection-research/capture/route.ts", "utf8");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /RESEARCH_ONLY/);
  assert.match(route, /publicScoringImpact/);

  const auditRoute = await readFile("app/api/internal/mlb-engine-audit/route.ts", "utf8");
  assert.match(auditRoute, /mlbProjectionResearch/);
  assert.match(auditRoute, /public_signals/);

  const legacyProjection = buildMlbSportsProjection({
    eventId: "legacy-projection-check",
    overallAvailability: "UNAVAILABLE",
    availableModuleCount: 0,
    totalModuleCount: 8,
    warnings: [],
  } as any);
  assert.equal(legacyProjection.projectionAvailability, "UNAVAILABLE");
}

async function main() {
  assertProjectionMath();
  await assertResearchOnlyIsolation();
  console.log("validate:mlb-projection-research passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
