import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import {
  buildGameReadiness,
  buildTeamIntelligence,
  buildTeamQuality,
  buildContextCertainty,
  TEAM_QUALITY_VERSION,
} from "../app/lib/mlb-engine/sports-intelligence/team-intelligence/team-intelligence-engine";
import { buildTeamIntelligenceSnapshotRows } from "../app/lib/mlb-engine/sports-intelligence/team-intelligence/team-intelligence-repository";

function baseInput(overrides: Partial<Parameters<typeof buildTeamIntelligence>[0]> = {}) {
  return {
    teamId: "116",
    teamName: "Detroit Tigers",
    offense: {
      teamId: "116",
      teamName: "Detroit Tigers",
      atlasOffensiveScore: 74,
      availability: "AVAILABLE" as const,
      source: "BASEBALL_SAVANT" as const,
      rollingWindows: {},
      componentBreakdown: [],
    },
    bullpen: {
      teamId: "116",
      teamName: "Detroit Tigers",
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
      qualityScore: 55,
      qualityScoreV2: 55,
      qualityConfidence: {
        score: 80,
        tier: "HIGH" as const,
        seasonSampleQuality: "SUFFICIENT",
        recentSampleQuality: "SUFFICIENT",
        windowCoverage: 1,
        warnings: [],
      },
      effectiveDepth: {
        restedRelieverCount: 4,
        normalRelieverCount: 3,
        elevatedFatigueCount: 0,
        highFatigueCount: 0,
        availableHighLeverageCandidates: 2,
        depthAvailability: "DEEP" as const,
      },
      metadata: { availability: "AVAILABLE" as const, source: "MLB_OFFICIAL" as const, warnings: [] },
      warnings: [],
    },
    lineupStability: {
      confirmedLineup: true,
      battingOrderComplete: true,
      playerCount: 9,
      lineupChangesLast7Days: 0,
      lateScratchesLast7Days: 0,
      daysSinceLineupDisruption: 3,
    },
    pitcherStatus: "CONFIRMED" as const,
    weatherPark: {
      officialGameId: "game-1",
      venueId: "1",
      roof: { roofType: "OPEN_AIR" as const, roofStatus: "OPEN" as const, verified: true, warnings: [] },
      forecast: { validTime: "2026-07-10T23:00:00.000Z", source: "NWS_FORECAST" as const, warnings: [] },
      parkEnvironmentScore: 62,
      metadata: { availability: "AVAILABLE" as const, source: "NWS" as const, warnings: [] },
    },
    asOf: "2026-07-10T22:00:00.000Z",
    ...overrides,
  };
}

function range(value: number | undefined) {
  assert.ok(value !== undefined);
  assert.ok(value >= 0 && value <= 100);
}

async function main() {
  const full = baseInput();
  const quality = buildTeamQuality(full);
  assert.equal(quality.version, TEAM_QUALITY_VERSION);
  range(quality.score);
  assert.equal(quality.availability, "AVAILABLE");
  assert.equal(quality.qualityCoveragePercent, 100);

  const pitcherChanged = buildTeamQuality(baseInput({ pitcherStatus: "CHANGED" }));
  assert.equal(pitcherChanged.score, quality.score, "Pitcher availability must not increase or decrease Team Quality.");

  const noWeather = buildTeamQuality(baseInput({ weatherPark: undefined }));
  assert.equal(noWeather.score, quality.score, "Environment readiness must not affect Team Quality.");

  const noLineup = buildTeamQuality(baseInput({ lineupStability: undefined }));
  assert.equal(noLineup.score, quality.score, "Data/readiness confidence must not affect Team Quality.");

  const tiredBullpenQuality = buildTeamQuality(baseInput({ bullpen: { ...full.bullpen!, fatigueScore: 95, fatigueScoreV2: 95 } }));
  assert.equal(tiredBullpenQuality.score, quality.score, "Bullpen fatigue must not enter Team Quality.");

  const betterBullpen = buildTeamQuality(baseInput({ bullpen: { ...full.bullpen!, qualityScore: 90, qualityScoreV2: 90 } }));
  assert.ok((betterBullpen.score ?? 0) > (quality.score ?? 0), "Bullpen quality must enter Team Quality.");

  const betterOffense = buildTeamQuality(baseInput({ offense: { ...full.offense!, atlasOffensiveScore: 92 } }));
  assert.ok((betterOffense.score ?? 0) > (quality.score ?? 0), "Offensive Score must enter Team Quality.");

  const bullpenOnly = buildTeamQuality(baseInput({ offense: undefined }));
  assert.equal(bullpenOnly.availability, "PARTIAL");
  assert.equal(bullpenOnly.confidence, "LOW");
  assert.equal(bullpenOnly.qualityCoveragePercent, 35);
  assert.notEqual(bullpenOnly.score, 0, "Missing offense must not become zero.");
  assert.ok((bullpenOnly.score ?? 0) < 55, "Missing offense should apply a coverage penalty.");

  const noQuality = buildTeamQuality(baseInput({ offense: undefined, bullpen: undefined }));
  assert.equal(noQuality.availability, "UNAVAILABLE");
  assert.equal(noQuality.score, undefined);

  const rested = buildGameReadiness(full);
  const exhausted = buildGameReadiness(baseInput({ bullpen: { ...full.bullpen!, fatigueScore: 96, fatigueScoreV2: 96 } }));
  assert.ok((exhausted.score ?? 0) < (rested.score ?? 0), "Bullpen fatigue must affect Game Readiness.");

  const noConfirmedLineup = buildGameReadiness(baseInput({ lineupStability: { ...full.lineupStability!, confirmedLineup: false, battingOrderComplete: false, playerCount: 0 } }));
  assert.ok((noConfirmedLineup.score ?? 0) < (rested.score ?? 0), "Confirmed lineup must affect Game Readiness.");

  const changedStarter = buildGameReadiness(baseInput({ pitcherStatus: "CHANGED" }));
  assert.ok((changedStarter.score ?? 0) < (rested.score ?? 0), "Changed starter must lower readiness.");

  const contextFull = buildContextCertainty(full);
  const contextNoWeather = buildContextCertainty(baseInput({ weatherPark: undefined }));
  assert.ok((contextNoWeather.score ?? 0) < (contextFull.score ?? 0), "Weather completeness must affect Context Certainty.");
  assert.equal(buildTeamQuality(baseInput({ weatherPark: undefined })).score, quality.score);

  const highQualityLowReadiness = buildTeamIntelligence(baseInput({
    offense: { ...full.offense!, atlasOffensiveScore: 96 },
    bullpen: { ...full.bullpen!, qualityScore: 94, qualityScoreV2: 94, fatigueScore: 98, fatigueScoreV2: 98, effectiveDepth: { ...full.bullpen!.effectiveDepth!, depthAvailability: "THIN" } },
    lineupStability: { confirmedLineup: false, battingOrderComplete: false, playerCount: 0, lineupChangesLast7Days: 4, lateScratchesLast7Days: 1 },
    pitcherStatus: "CHANGED",
  }));
  assert.ok((highQualityLowReadiness.teamQuality.score ?? 0) > 80);
  assert.ok((highQualityLowReadiness.gameReadiness.score ?? 0) < 45);

  const lowQualityHighReadiness = buildTeamIntelligence(baseInput({
    offense: { ...full.offense!, atlasOffensiveScore: 30 },
    bullpen: { ...full.bullpen!, qualityScore: 30, qualityScoreV2: 30, fatigueScore: 10, fatigueScoreV2: 10 },
    lineupStability: { confirmedLineup: true, battingOrderComplete: true, playerCount: 9, lineupChangesLast7Days: 0, lateScratchesLast7Days: 0 },
    pitcherStatus: "CONFIRMED",
  }));
  assert.ok((lowQualityHighReadiness.teamQuality.score ?? 0) < 45);
  assert.ok((lowQualityHighReadiness.gameReadiness.score ?? 0) > 80);

  [highQualityLowReadiness, lowQualityHighReadiness].forEach((snapshot) => {
    range(snapshot.teamQuality.score);
    range(snapshot.gameReadiness.score);
    range(snapshot.contextCertainty.score);
    range(snapshot.intelligenceConfidence.score);
  });

  const rows = buildTeamIntelligenceSnapshotRows([highQualityLowReadiness, { ...highQualityLowReadiness, capturedAt: "2026-07-10T22:05:00.000Z" }]);
  assert.equal(rows[0].feature_hash, rows[1].feature_hash, "Identical state must dedupe.");
  const changedRows = buildTeamIntelligenceSnapshotRows([highQualityLowReadiness, lowQualityHighReadiness]);
  assert.notEqual(changedRows[0].feature_hash, changedRows[1].feature_hash);

  const packageJson = await fs.readFile("package.json", "utf8");
  assert.match(packageJson, /validate:mlb-team-intelligence/);

  const envExample = await fs.readFile(".env.example", "utf8");
  assert.match(envExample, /MLB_TEAM_QUALITY_ENABLED=false/);
  assert.match(envExample, /MLB_GAME_READINESS_ENABLED=false/);
  assert.match(envExample, /MLB_CONTEXT_CERTAINTY_ENABLED=false/);
  assert.match(envExample, /MLB_TEAM_INTELLIGENCE_MODE=AUDIT_ONLY/);

  const auditRoute = await fs.readFile("app/api/internal/mlb-engine-audit/route.ts", "utf8");
  assert.match(auditRoute, /teamStrengthV1Deprecated/);
  assert.match(auditRoute, /Atlas Team Quality Audit/);

  const projection = await fs.readFile("app/lib/mlb-engine/sports-intelligence/projection.ts", "utf8");
  assert.doesNotMatch(projection, /teamQuality|gameReadiness|teamIntelligence|mlb_team_intelligence/i);
  assert.match(projection, /projectionAvailability: "UNAVAILABLE"/);

  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.doesNotMatch(automationUtils, /team-intelligence|teamQuality|gameReadiness|MLB_TEAM_QUALITY|MLB_GAME_READINESS/);

  for (const file of ["app/lib/mlb-engine/candidate.ts", "app/lib/mlb-engine/scoring.ts", "app/page.tsx"]) {
    try {
      const text = await fs.readFile(file, "utf8");
      assert.doesNotMatch(text, /teamQuality|gameReadiness|teamIntelligence|mlb_team_intelligence/i, `${file} must not expose or use Team Intelligence.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  console.log("validate:mlb-team-intelligence passed");
  console.log(JSON.stringify({
    quality: quality.score,
    bullpenOnlyQuality: bullpenOnly.score,
    highQualityLowReadiness: {
      quality: highQualityLowReadiness.teamQuality.score,
      readiness: highQualityLowReadiness.gameReadiness.score,
    },
    lowQualityHighReadiness: {
      quality: lowQualityHighReadiness.teamQuality.score,
      readiness: lowQualityHighReadiness.gameReadiness.score,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
