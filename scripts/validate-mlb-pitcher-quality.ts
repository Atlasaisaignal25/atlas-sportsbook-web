import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import {
  buildPitcherWindows,
  buildStartingPitcherQuality,
  inningsToOuts,
  STARTING_PITCHER_QUALITY_VERSION,
} from "../app/lib/mlb-engine/sports-intelligence/pitcher-quality/pitcher-quality-engine";
import { buildStartingPitcherQualityRows } from "../app/lib/mlb-engine/sports-intelligence/pitcher-quality/pitcher-quality-repository";
import { buildTeamQuality } from "../app/lib/mlb-engine/sports-intelligence/team-intelligence/team-intelligence-engine";

const asOf = "2026-07-10T20:00:00.000Z";

function start(date: string, overrides: Record<string, unknown> = {}) {
  return {
    date,
    stat: {
      gamesStarted: 1,
      inningsPitched: "6.0",
      battersFaced: 24,
      numberOfPitches: 92,
      earnedRuns: 2,
      runs: 2,
      hits: 5,
      baseOnBalls: 2,
      strikeOuts: 7,
      homeRuns: 1,
      ...overrides,
    },
  };
}

function fixture(overrides: Partial<Parameters<typeof buildStartingPitcherQuality>[0]> = {}) {
  return buildStartingPitcherQuality({
    playerId: "42",
    playerName: "Fixture Starter",
    teamId: "116",
    teamName: "Detroit Tigers",
    officialGameId: "game-1",
    side: "HOME",
    handedness: "R",
    status: "CONFIRMED",
    commenceTime: "2026-07-11T00:00:00.000Z",
    asOf,
    seasonStats: {
      gamesStarted: 12,
      inningsPitched: "72.2",
      battersFaced: 290,
      earnedRuns: 26,
      runs: 29,
      hits: 62,
      baseOnBalls: 20,
      strikeOuts: 84,
      homeRuns: 8,
    },
    gameLog: [
      start("2026-07-06", { inningsPitched: "7.1", battersFaced: 27, numberOfPitches: 104, earnedRuns: 1, runs: 1, hits: 4, baseOnBalls: 1, strikeOuts: 9, homeRuns: 0 }),
      start("2026-07-01", { inningsPitched: "6.0", battersFaced: 24, numberOfPitches: 91, earnedRuns: 2, runs: 2, hits: 5, baseOnBalls: 1, strikeOuts: 8, homeRuns: 1 }),
      start("2026-06-25", { inningsPitched: "5.2", battersFaced: 23, numberOfPitches: 88, earnedRuns: 3, runs: 3, hits: 6, baseOnBalls: 2, strikeOuts: 6, homeRuns: 1 }),
      start("2026-06-19"),
      start("2026-06-13"),
      { date: "2026-06-10", stat: { gamesStarted: 0, inningsPitched: "1.0", battersFaced: 4, numberOfPitches: 18, earnedRuns: 0, runs: 0, hits: 1, baseOnBalls: 0, strikeOuts: 1, homeRuns: 0 } },
    ],
    ...overrides,
  });
}

function range(value: number | undefined) {
  assert.ok(value !== undefined);
  assert.ok(value >= 0 && value <= 100);
}

async function main() {
  assert.equal(inningsToOuts("6.2"), 20);
  assert.equal(inningsToOuts("7.1"), 22);

  const windows = buildPitcherWindows({
    asOf,
    gameLog: [
      start("2026-07-01"),
      { date: "2026-06-29", stat: { gamesStarted: 0, inningsPitched: "2.0", battersFaced: 8 } },
    ],
  });
  assert.equal(windows.last5Starts.startsIncluded, 1, "Starter appearances only.");
  assert.match(windows.warnings.join(" "), /Excluded 1 relief/);

  const opener = buildPitcherWindows({ asOf, gameLog: [start("2026-07-01", { inningsPitched: "2.0" })] });
  assert.match(opener.warnings.join(" "), /opener|short start/i);

  const quality = fixture();
  assert.equal(quality.qualityVersion, STARTING_PITCHER_QUALITY_VERSION);
  range(quality.qualityScore);
  range(quality.readinessScore);
  assert.equal(quality.seasonWindow?.inningsOuts, 218);
  assert.equal(quality.seasonWindow?.era, 3.22);
  assert.equal(quality.seasonWindow?.whip, 1.128);
  assert.equal(quality.seasonWindow?.strikeoutRate, 0.2897);
  assert.equal(quality.seasonWindow?.walkRate, 0.069);
  assert.ok((quality.seasonWindow?.kMinusBbRate ?? 0) > 0);
  assert.ok((quality.seasonWindow?.homeRunsPerBatterFaced ?? 0) > 0);

  const highK = fixture({ seasonStats: { ...quality.seasonWindow, gamesStarted: 12, inningsPitched: "72.2", battersFaced: 290, strikeOuts: 120, baseOnBalls: 20, hits: 62, earnedRuns: 26, runs: 29, homeRuns: 8 } });
  assert.ok((highK.qualityScore ?? 0) > (quality.qualityScore ?? 0), "K-BB direction must be positive.");

  const homerProne = fixture({ seasonStats: { gamesStarted: 12, inningsPitched: "72.2", battersFaced: 290, strikeOuts: 84, baseOnBalls: 20, hits: 62, earnedRuns: 35, runs: 38, homeRuns: 25 } });
  assert.ok((homerProne.qualityScore ?? 0) < (quality.qualityScore ?? 0), "HR/BF direction must be negative.");

  const noAdvanced = fixture({ advancedMetrics: {} });
  const withAdvanced = fixture({ advancedMetrics: { xEra: 2.9, xWobaAllowed: 0.27, hardHitRateAllowed: 0.31 } });
  assert.equal(noAdvanced.qualityScore, withAdvanced.qualityScore, "Advanced metrics are tracked but unavailable metrics do not become zero in Phase 9 scoring.");

  const tiny = fixture({ seasonStats: { gamesStarted: 1, inningsPitched: "3.0", battersFaced: 14, earnedRuns: 1, runs: 1, hits: 2, baseOnBalls: 1, strikeOuts: 5, homeRuns: 0 }, gameLog: [start("2026-07-06", { inningsPitched: "3.0" })] });
  assert.equal(tiny.qualityConfidence.tier, "LOW");

  const probable = fixture({ status: "PROBABLE" });
  assert.equal(probable.qualityScore, quality.qualityScore, "Confirmed status must not increase quality.");
  assert.ok((probable.readinessScore ?? 0) < (quality.readinessScore ?? 0));

  const shortRest = fixture({ commenceTime: "2026-07-08T00:00:00.000Z" });
  assert.equal(shortRest.qualityScore, quality.qualityScore);
  assert.ok((shortRest.readinessScore ?? 0) < (quality.readinessScore ?? 0), "Short rest lowers readiness only.");

  const highQualityLowReadiness = fixture({ commenceTime: "2026-07-08T00:00:00.000Z", status: "PROBABLE" });
  assert.ok((highQualityLowReadiness.qualityScore ?? 0) >= (quality.qualityScore ?? 0) - 0.1);
  assert.ok((highQualityLowReadiness.readinessScore ?? 0) < (quality.readinessScore ?? 0));

  const lowQualityHighReadiness = fixture({ seasonStats: { gamesStarted: 12, inningsPitched: "60.0", battersFaced: 280, strikeOuts: 35, baseOnBalls: 35, hits: 85, earnedRuns: 55, runs: 58, homeRuns: 20 } });
  assert.ok((lowQualityHighReadiness.qualityScore ?? 0) < (quality.qualityScore ?? 0));
  assert.ok((lowQualityHighReadiness.readinessScore ?? 0) >= 70);

  const rows = buildStartingPitcherQualityRows([quality, { ...quality, capturedAt: "2026-07-10T20:05:00.000Z" }]);
  assert.equal(rows[0].feature_hash, rows[1].feature_hash);

  const teamQuality = buildTeamQuality({
    teamId: "116",
    teamName: "Detroit Tigers",
    bullpen: {
      teamId: "116",
      teamName: "Detroit Tigers",
      relievers: [],
      totalAppearancesLast3Days: 0,
      relieversUsedLast1Day: 0,
      relieversUsedLast2Days: 0,
      relieversUsedLast3Days: 0,
      relieversOnConsecutiveDays: 0,
      relieversWithHeavyWorkload: 0,
      highLeverageRelievers: [],
      qualityScore: 60,
      qualityScoreV2: 60,
      metadata: { availability: "AVAILABLE", source: "MLB_OFFICIAL", warnings: [] },
      warnings: [],
    },
  });
  assert.equal(teamQuality.components.startingPitcherQuality, undefined, "Team Quality unchanged: pitcher quality not connected yet.");

  const projection = await fs.readFile("app/lib/mlb-engine/sports-intelligence/projection.ts", "utf8");
  assert.doesNotMatch(projection, /pitcherQuality|starting_pitcher_quality|mlb_starting_pitcher_quality/i);
  assert.match(projection, /projectionAvailability: "UNAVAILABLE"/);

  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.doesNotMatch(automationUtils, /pitcher-quality|MLB_PITCHER_QUALITY|starting_pitcher_quality/);
  for (const file of ["app/lib/mlb-engine/candidate.ts", "app/lib/mlb-engine/scoring.ts", "app/page.tsx"]) {
    try {
      const text = await fs.readFile(file, "utf8");
      assert.doesNotMatch(text, /pitcherQuality|starting_pitcher_quality|mlb_starting_pitcher_quality/i, `${file} must not use or expose Pitcher Quality.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  const envExample = await fs.readFile(".env.example", "utf8");
  assert.match(envExample, /MLB_PITCHER_QUALITY_ENABLED=false/);
  assert.match(envExample, /MLB_PITCHER_READINESS_ENABLED=false/);
  assert.match(envExample, /MLB_PITCHER_QUALITY_MODE=AUDIT_ONLY/);

  console.log("validate:mlb-pitcher-quality passed");
  console.log(JSON.stringify({
    qualityScore: quality.qualityScore,
    readinessScore: quality.readinessScore,
    confidence: quality.qualityConfidence,
    tinySampleConfidence: tiny.qualityConfidence,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
