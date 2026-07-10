import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import {
  buildTeamStrength,
  TEAM_STRENGTH_VERSION,
  teamConfidenceTier,
  teamStrengthDistribution,
  type TeamStrengthSnapshot,
} from "../app/lib/mlb-engine/sports-intelligence/team-strength/team-strength-engine";
import { buildTeamStrengthSnapshotRows } from "../app/lib/mlb-engine/sports-intelligence/team-strength/team-strength-repository";

function fixture(overrides: Partial<Parameters<typeof buildTeamStrength>[0]> = {}) {
  return buildTeamStrength({
    teamId: "119",
    teamName: "Los Angeles Dodgers",
    offense: {
      teamId: "119",
      teamName: "Los Angeles Dodgers",
      atlasOffensiveScore: 72,
      source: "BASEBALL_SAVANT",
      availability: "AVAILABLE",
      rollingWindows: {},
      componentBreakdown: [],
    },
    bullpen: {
      teamId: "119",
      teamName: "Los Angeles Dodgers",
      relievers: [],
      totalAppearancesLast3Days: 2,
      relieversUsedLast1Day: 1,
      relieversUsedLast2Days: 2,
      relieversUsedLast3Days: 3,
      relieversOnConsecutiveDays: 0,
      relieversWithHeavyWorkload: 0,
      highLeverageRelievers: [],
      fatigueScore: 30,
      fatigueScoreV2: 30,
      qualityScore: 66,
      qualityScoreV2: 68,
      qualityConfidence: {
        score: 82,
        tier: "HIGH",
        seasonSampleQuality: "SUFFICIENT",
        recentSampleQuality: "SUFFICIENT",
        windowCoverage: 1,
        warnings: [],
      },
      effectiveDepth: {
        restedRelieverCount: 5,
        normalRelieverCount: 2,
        elevatedFatigueCount: 0,
        highFatigueCount: 0,
        availableHighLeverageCandidates: 2,
        depthAvailability: "DEEP",
      },
      metadata: {
        availability: "AVAILABLE",
        source: "MLB_OFFICIAL",
        updatedAt: "2026-07-10T12:00:00.000Z",
        warnings: [],
      },
      warnings: [],
    },
    lineupStability: {
      confirmedLineup: true,
      battingOrderComplete: true,
      playerCount: 9,
      lineupChangesLast7Days: 0,
      lateScratchesLast7Days: 0,
      daysSinceLineupDisruption: 4,
    },
    pitcherStatus: "CONFIRMED",
    weatherPark: {
      venueId: "22",
      venueName: "UNIQLO Field at Dodger Stadium",
      roof: { roofType: "OPEN_AIR", roofStatus: "OPEN", verified: true, warnings: [] },
      forecast: {
        validTime: "2026-07-10T22:00:00.000Z",
        generatedAt: "2026-07-10T18:00:00.000Z",
        source: "NWS_FORECAST",
        warnings: [],
      },
      parkEnvironmentScore: 57,
      metadata: {
        availability: "AVAILABLE",
        source: "NWS_FORECAST",
        updatedAt: "2026-07-10T18:00:00.000Z",
        warnings: [],
      },
      warnings: [],
    },
    asOf: "2026-07-10T20:00:00.000Z",
    ...overrides,
  });
}

function assertScoreRange(snapshot: TeamStrengthSnapshot) {
  assert.equal(snapshot.scoreVersion, TEAM_STRENGTH_VERSION);
  assert.ok(snapshot.teamStrength !== undefined);
  assert.ok(snapshot.teamStrength >= 0 && snapshot.teamStrength <= 100);
  snapshot.componentBreakdown.forEach((component) => {
    if (component.normalizedValue !== undefined) {
      assert.ok(component.normalizedValue >= 0 && component.normalizedValue <= 100, component.component);
    }
  });
}

async function main() {
  const complete = fixture();
  assertScoreRange(complete);
  assert.equal(complete.pitcherStatus, "CONFIRMED");
  assert.equal(complete.teamConfidence.tier, teamConfidenceTier(complete.teamConfidence.score));

  const missing = fixture({ offense: undefined, weatherPark: undefined, pitcherStatus: "UNKNOWN" });
  assertScoreRange(missing);
  const effectiveWeightSum = missing.componentBreakdown.reduce((sum, component) => sum + component.effectiveWeight, 0);
  assert.ok(effectiveWeightSum > 0.99 && effectiveWeightSum < 1.01);
  assert.equal(missing.componentBreakdown.find((component) => component.component === "offense")?.effectiveWeight, 0);
  assert.notEqual(missing.teamStrength, 0, "Missing components must not become zero-valued inputs.");

  const changedPitcher = fixture({ pitcherStatus: "CHANGED" });
  assert.equal(changedPitcher.componentBreakdown.find((component) => component.component === "startingPitcherAvailability")?.normalizedValue, 38);
  assert.ok((changedPitcher.teamStrength ?? 0) < (complete.teamStrength ?? 0));

  const identicalRows = buildTeamStrengthSnapshotRows([complete, { ...complete, capturedAt: "2026-07-10T20:05:00.000Z" }]);
  assert.equal(identicalRows[0].feature_hash, identicalRows[1].feature_hash, "Feature hash must dedupe identical captures.");
  const updatedRows = buildTeamStrengthSnapshotRows([complete, { ...complete, bullpenReadiness: 12 }]);
  assert.notEqual(updatedRows[0].feature_hash, updatedRows[1].feature_hash, "Changed features must produce a new hash.");

  const distribution = teamStrengthDistribution([complete, missing, changedPitcher]);
  assert.equal(distribution.count, 3);
  assert.ok((distribution.min ?? 0) >= 0);
  assert.ok((distribution.max ?? 0) <= 100);

  const packageJson = await fs.readFile("package.json", "utf8");
  assert.match(packageJson, /validate:mlb-team-strength/);

  const envExample = await fs.readFile(".env.example", "utf8");
  assert.match(envExample, /MLB_TEAM_STRENGTH_ENABLED=false/);
  assert.match(envExample, /MLB_TEAM_STRENGTH_SCORE_MODE=AUDIT_ONLY/);

  const auditRoute = await fs.readFile("app/api/internal/mlb-engine-audit/route.ts", "utf8");
  assert.match(auditRoute, /Atlas Team Strength Audit/);

  const projection = await fs.readFile("app/lib/mlb-engine/sports-intelligence/projection.ts", "utf8");
  assert.doesNotMatch(projection, /teamStrength|TEAM_STRENGTH|mlb_team_strength/i);
  assert.match(projection, /projectionAvailability: "UNAVAILABLE"/);

  const scoringFiles = [
    "app/lib/mlb-engine/candidate.ts",
    "app/lib/mlb-engine/scoring.ts",
    "app/page.tsx",
  ];
  for (const file of scoringFiles) {
    try {
      const text = await fs.readFile(file, "utf8");
      assert.doesNotMatch(text, /teamStrength|TEAM_STRENGTH|mlb_team_strength/i, `${file} must not expose or use Team Strength.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  console.log("validate:mlb-team-strength passed");
  console.log(JSON.stringify({
    example: {
      teamId: complete.teamId,
      teamName: complete.teamName,
      teamStrength: complete.teamStrength,
      confidence: complete.teamConfidence,
    },
    missingComponentScore: missing.teamStrength,
    distribution,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
