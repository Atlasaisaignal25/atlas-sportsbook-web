import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import {
  buildPitcherWindows,
  buildStartingPitcherQuality,
  STARTING_PITCHER_BASELINE_VERSION,
  type PitcherWindow,
} from "../app/lib/mlb-engine/sports-intelligence/pitcher-quality/pitcher-quality-engine";
import {
  buildPitcherQualityBaselineRows,
  buildPitcherQualityBaselines,
  buildStartingPitcherQualityRows,
  type StarterArchiveRow,
} from "../app/lib/mlb-engine/sports-intelligence/pitcher-quality/pitcher-quality-repository";
import { buildTeamQuality } from "../app/lib/mlb-engine/sports-intelligence/team-intelligence/team-intelligence-engine";

const asOf = "2026-07-11T00:00:00.000Z";
const windows: PitcherWindow[] = ["SEASON", "LAST_30_DAYS", "LAST_5_STARTS", "LAST_3_STARTS"];

function start(date: string, overrides: Record<string, unknown> = {}) {
  return {
    date,
    stat: {
      gamesStarted: 1,
      inningsPitched: "6.0",
      battersFaced: 24,
      numberOfPitches: 90,
      earnedRuns: 2,
      runs: 2,
      hits: 5,
      baseOnBalls: 2,
      strikeOuts: 6,
      homeRuns: 1,
      ...overrides,
    },
  };
}

function archiveRow(playerId: number, overrides: Record<string, unknown> = {}): StarterArchiveRow {
  const qualityShift = Number(overrides.qualityShift ?? 0);
  const walkShift = playerId % 4;
  const hrShift = playerId % 3 === 0 ? 1 : 0;
  const bfShift = playerId % 5;
  const log = [
    start("2026-07-06", { battersFaced: 24 + bfShift, earnedRuns: Math.max(0, 2 - qualityShift), runs: Math.max(0, 3 - qualityShift), hits: Math.max(1, 5 - qualityShift), baseOnBalls: Math.max(0, 1 + walkShift - qualityShift), strikeOuts: 6 + qualityShift, homeRuns: hrShift }),
    start("2026-07-01", { battersFaced: 25 + bfShift, earnedRuns: Math.max(0, 3 - qualityShift), runs: Math.max(0, 3 - qualityShift), hits: Math.max(1, 6 - qualityShift), baseOnBalls: 1 + walkShift, strikeOuts: 5 + qualityShift, homeRuns: hrShift }),
    start("2026-06-25", { battersFaced: 23 + bfShift, earnedRuns: Math.max(0, 2 - qualityShift), runs: Math.max(0, 2 - qualityShift), hits: Math.max(1, 5 - qualityShift), baseOnBalls: walkShift, strikeOuts: 6 + qualityShift, homeRuns: playerId % 2 }),
    start("2026-06-19", { battersFaced: 27 + bfShift, earnedRuns: Math.max(0, 4 - qualityShift), runs: Math.max(0, 4 - qualityShift), hits: Math.max(1, 7 - qualityShift), baseOnBalls: 2 + walkShift, strikeOuts: 4 + qualityShift, homeRuns: hrShift }),
    start("2026-06-13", { battersFaced: 26 + bfShift, earnedRuns: Math.max(0, 3 - qualityShift), runs: Math.max(0, 3 - qualityShift), hits: Math.max(1, 6 - qualityShift), baseOnBalls: 1 + walkShift, strikeOuts: 5 + qualityShift, homeRuns: playerId % 2 }),
    start("2026-05-30", { battersFaced: 24 + bfShift, earnedRuns: Math.max(0, 2 - qualityShift), runs: Math.max(0, 2 - qualityShift), hits: Math.max(1, 5 - qualityShift), baseOnBalls: walkShift, strikeOuts: 6 + qualityShift, homeRuns: hrShift }),
    { date: "2026-05-25", stat: { gamesStarted: 0, inningsPitched: "1.0", battersFaced: 4, earnedRuns: 0, runs: 0, hits: 1, baseOnBalls: 0, strikeOuts: 1, homeRuns: 0 } },
  ];
  const built = buildPitcherWindows({ gameLog: log, asOf });
  return {
    playerId: String(playerId),
    playerName: `Pitcher ${playerId}`,
    teamId: "100",
    teamName: "Fixture Team",
    seasonStarts: built.seasonWindow.startsIncluded,
    seasonInningsOuts: built.seasonWindow.inningsOuts,
    windows: {
      SEASON: built.seasonWindow,
      LAST_30_DAYS: built.last30Window,
      LAST_5_STARTS: built.last5Starts,
      LAST_3_STARTS: built.last3Starts,
    },
    warnings: built.warnings,
  };
}

function baselineArchive(count: number) {
  return Array.from({ length: count }, (_, index) => archiveRow(index + 1, { qualityShift: (index % 9) - 3 }));
}

function pitcherInput(overrides: Partial<Parameters<typeof buildStartingPitcherQuality>[0]> = {}) {
  return {
    playerId: "900",
    playerName: "Audit Starter",
    teamId: "116",
    teamName: "Detroit Tigers",
    officialGameId: "game-900",
    side: "HOME" as const,
    handedness: "R" as const,
    status: "PROBABLE" as const,
    commenceTime: "2026-07-12T00:00:00.000Z",
    gameLog: [
      start("2026-07-06", { inningsPitched: "7.0", earnedRuns: 1, hits: 4, baseOnBalls: 1, strikeOuts: 9, homeRuns: 0 }),
      start("2026-07-01", { inningsPitched: "6.0", earnedRuns: 2, hits: 5, baseOnBalls: 1, strikeOuts: 8, homeRuns: 1 }),
      start("2026-06-25", { inningsPitched: "6.0", earnedRuns: 1, hits: 4, baseOnBalls: 2, strikeOuts: 7, homeRuns: 0 }),
      start("2026-06-19"),
      start("2026-06-13"),
      start("2026-05-30"),
    ],
    asOf,
    ...overrides,
  };
}

async function main() {
  const starterOnly = buildPitcherWindows({
    asOf,
    gameLog: [
      start("2026-07-01"),
      { date: "2026-06-30", stat: { gamesStarted: 0, inningsPitched: "2.0", battersFaced: 8, earnedRuns: 0 } },
    ],
  });
  assert.equal(starterOnly.seasonWindow.startsIncluded, 1, "Relief rows are excluded.");
  assert.equal(starterOnly.seasonWindow.inningsOuts, 18, "Baseball innings use outs.");
  assert.equal(starterOnly.seasonWindow.era, 3);
  assert.equal(starterOnly.seasonWindow.whip, 1.167);
  assert.equal(starterOnly.seasonWindow.strikeoutRate, 0.25);
  assert.equal(starterOnly.seasonWindow.walkRate, 0.0833);
  assert.equal(starterOnly.seasonWindow.kMinusBbRate, 0.1667);
  assert.equal(starterOnly.seasonWindow.homeRunsPerBatterFaced, 0.0417);

  const smallBaseline = buildPitcherQualityBaselines({ season: 2026, asOf, archiveRows: baselineArchive(20) });
  assert.equal(smallBaseline.ready, false, "Fewer than minimum pitchers rejects production baseline.");

  const flatRows = Array.from({ length: 65 }, (_, index) => archiveRow(index + 1, { qualityShift: 0 }));
  const flatBaseline = buildPitcherQualityBaselines({ season: 2026, asOf, archiveRows: flatRows });
  assert.equal(flatBaseline.ready, false, "Near-zero SD rejects production baseline.");

  const productionBaseline = buildPitcherQualityBaselines({ season: 2026, asOf, archiveRows: baselineArchive(75) });
  assert.equal(productionBaseline.ready, true, "Production baseline is ready when population and SD are valid.");
  assert.equal(productionBaseline.baselineVersion, STARTING_PITCHER_BASELINE_VERSION);
  assert.equal(Object.values(productionBaseline.metrics).length, 32);

  const prior = buildStartingPitcherQuality(pitcherInput());
  const production = buildStartingPitcherQuality(pitcherInput({ baselineSet: productionBaseline }));
  assert.equal(prior.baselineSource, "INITIAL_PRIOR_FALLBACK");
  assert.equal(production.baselineSource, "PRODUCTION_BASELINE");
  assert.equal(production.baselineVersion, STARTING_PITCHER_BASELINE_VERSION);
  assert.ok(production.baselineAsOf);
  assert.notEqual(prior.qualityScore, undefined);
  assert.notEqual(production.qualityScore, undefined);

  const strongK = buildStartingPitcherQuality(pitcherInput({ gameLog: pitcherInput().gameLog?.map((entry) => start(entry.date ?? "2026-07-01", { ...entry.stat, strikeOuts: 12, baseOnBalls: 1 })) as any, baselineSet: productionBaseline }));
  assert.ok((strongK.qualityScore ?? 0) > (production.qualityScore ?? 0), "K and K-BB direction are positive.");

  const homerProne = buildStartingPitcherQuality(pitcherInput({ gameLog: pitcherInput().gameLog?.map((entry) => start(entry.date ?? "2026-07-01", { ...entry.stat, homeRuns: 3, earnedRuns: 5, runs: 5 })) as any, baselineSet: productionBaseline }));
  assert.ok((homerProne.qualityScore ?? 0) < (production.qualityScore ?? 0), "ERA/WHIP/HR/BF directions are inverse.");

  const missingAdvanced = buildStartingPitcherQuality(pitcherInput({ baselineSet: productionBaseline, advancedMetrics: {} }));
  assert.equal(missingAdvanced.advancedMetrics.xEra, undefined, "Missing advanced metrics remain undefined.");

  const tiny = buildStartingPitcherQuality(pitcherInput({ gameLog: [start("2026-07-06", { inningsPitched: "2.0", battersFaced: 10 })], baselineSet: productionBaseline }));
  assert.ok((tiny.qualityConfidence.score ?? 0) < (production.qualityConfidence.score ?? 0), "Tiny samples reduce confidence.");

  const shortRest = buildStartingPitcherQuality(pitcherInput({ commenceTime: "2026-07-08T00:00:00.000Z", baselineSet: productionBaseline }));
  assert.equal(shortRest.qualityScore, production.qualityScore, "Readiness is independent from quality.");
  assert.ok((shortRest.readinessScore ?? 0) < (production.readinessScore ?? 0));

  const rowsA = buildStartingPitcherQualityRows([production, { ...production, capturedAt: "2026-07-11T00:05:00.000Z" }]);
  assert.equal(rowsA[0].feature_hash, rowsA[1].feature_hash, "Timestamp-only changes dedupe.");
  const nextVersion = buildStartingPitcherQualityRows([{ ...production, baselineVersion: "starting_pitcher_baseline_v2" } as any]);
  assert.notEqual(rowsA[0].feature_hash, nextVersion[0].feature_hash, "Baseline version change creates valid new state.");

  const baselineRows = buildPitcherQualityBaselineRows(Object.values(productionBaseline.metrics));
  assert.equal(new Set(baselineRows.map((row) => `${row.baseline_window}:${row.metric}`)).size, baselineRows.length, "One pitcher baseline row per metric/window.");
  assert.ok(baselineRows.every((row) => row.baseline_version === STARTING_PITCHER_BASELINE_VERSION));

  const teamQuality = buildTeamQuality({ teamId: "116", teamName: "Detroit Tigers" });
  assert.equal(teamQuality.components.startingPitcherQuality, undefined, "Team Quality remains unchanged.");

  for (const file of [
    "app/lib/mlb-engine/candidate.ts",
    "app/lib/mlb-engine/scoring.ts",
    "app/api/cron/automationUtils.ts",
    "app/page.tsx",
  ]) {
    try {
      const text = await fs.readFile(file, "utf8");
      assert.doesNotMatch(text, /pitcher-quality|pitcherQuality|mlb_starting_pitcher_quality|MLB_PITCHER_QUALITY/i, `${file} must not consume or expose Pitcher Quality.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const projection = await fs.readFile("app/lib/mlb-engine/sports-intelligence/projection.ts", "utf8");
  assert.match(projection, /projectionAvailability: "UNAVAILABLE"/);
  assert.doesNotMatch(projection, /starting_pitcher_quality|pitcherQuality/i);

  const envExample = await fs.readFile(".env.example", "utf8");
  assert.match(envExample, /MLB_PITCHER_PRODUCTION_BASELINES_ENABLED=false/);
  assert.match(envExample, /MLB_PITCHER_BASELINE_VERSION=starting_pitcher_baseline_v1/);
  assert.doesNotMatch(envExample, /sbp_|sk_live_|GNEWS_API_KEY=.+[a-f0-9]{20}/i, "No secrets exposed.");

  console.log("validate:mlb-pitcher-baselines passed");
  console.log(JSON.stringify({
    baselines: baselineRows.length,
    priorScore: prior.qualityScore,
    productionScore: production.qualityScore,
    confidence: production.qualityConfidence,
    sampleWindows: windows.map((window) => [window, productionBaseline.metrics[`${window}:era`]?.pitcherCount]),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
