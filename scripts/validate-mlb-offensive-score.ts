import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  applyAuditOnlyOffensiveScores,
  buildOffensiveFormSnapshotRows,
  buildStatcastLeagueBaseline,
  scoreDistribution,
  type OffensiveTeamForm,
} from "../app/lib/mlb-engine/sports-intelligence";

function team(index: number, hardHitRate: number, strikeoutRate: number): OffensiveTeamForm {
  const base = {
    games: 7,
    gamesRequested: 7 as const,
    gamesIncluded: 7,
    plateAppearances: 250 + index,
    battedBallEvents: 170 + index,
    hardHitRate,
    barrelRate: 0.05 + index / 1000,
    averageExitVelocity: 86 + index / 10,
    walkRate: 0.07 + index / 1000,
    strikeoutRate,
    expectedBAOnContact: 0.29 + index / 1000,
    expectedSLGOnContact: 0.45 + index / 1000,
    expectedWOBAOnContact: 0.33 + index / 1000,
    atlasExpectedOffenseRate: 0.32 + index / 1000,
    sampleQuality: "SUFFICIENT" as const,
    selectedGamePks: [`game-${index}`],
    componentBreakdown: [],
  };
  return {
    teamId: String(100 + index),
    teamName: `Team ${index}`,
    source: "BASEBALL_SAVANT",
    availability: "AVAILABLE",
    rollingWindows: {
      last7: { ...base, window: "last7" },
      last14: { ...base, games: 14, gamesRequested: 14, gamesIncluded: 14, window: "last14" },
      last30: { ...base, games: 30, gamesRequested: 30, gamesIncluded: 30, window: "last30" },
    },
    componentBreakdown: [],
  };
}

async function main() {
const forms = Array.from({ length: 30 }, (_, index) => team(index, 0.3 + index / 100, 0.32 - index / 200));
const teamWindows = forms.map((form) => ({
  teamId: form.teamId,
  teamName: form.teamName ?? "",
  asOf: "2026-07-10T20:00:00Z",
  source: "BASEBALL_SAVANT" as const,
  windows: form.rollingWindows,
}));
const baseline = buildStatcastLeagueBaseline({ teamWindows, asOf: "2026-07-10T20:00:00Z" });
assert.ok(baseline.metrics.hardHitRate);

const baselineSet: any = {
  asOf: "2026-07-10T20:00:00Z",
  season: 2026,
  inserted: 27,
  skipped: 0,
  errors: [],
  metrics: {},
};
([7, 14, 30] as const).forEach((windowGames) => {
  Object.entries(baseline.metrics).forEach(([metric, value]) => {
    const dbMetric = metric === "exitVelocity" ? "average_exit_velocity"
      : metric.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`) === "hard_hit_rate" ? "hard_hit_rate"
      : metric.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
    const normalized = dbMetric
      .replace("expected_b_a_on_contact", "expected_ba_on_contact")
      .replace("expected_s_l_g_on_contact", "expected_slg_on_contact")
      .replace("expected_w_o_b_a_on_contact", "expected_woba_on_contact");
    baselineSet.metrics[`${windowGames}:${normalized}`] = {
      windowGames,
      metric: normalized,
      mean: value.mean,
      standardDeviation: value.standardDeviation,
      ready: true,
    };
  });
  baselineSet.metrics[`${windowGames}:atlas_expected_offense_rate`] = {
    windowGames,
    metric: "atlas_expected_offense_rate",
    mean: 0.335,
    standardDeviation: 0.01,
    ready: true,
  };
});

const scored = applyAuditOnlyOffensiveScores(forms, baselineSet);
assert.equal(scored.length, 30);
assert.ok(scored.every((form) => (form.atlasOffensiveScore ?? -1) >= 0 && (form.atlasOffensiveScore ?? 101) <= 100));
assert.ok((scored[29].atlasOffensiveScore ?? 0) > (scored[0].atlasOffensiveScore ?? 100), "Lower K% and stronger contact should score higher.");
assert.equal(scored[0].rollingWindows.last7?.componentBreakdown.some((item) => item.metric === "strikeoutRate" && item.higherIsBetter === false), true);

const missingMetric = structuredClone(scored[0]);
delete missingMetric.rollingWindows.last7!.hardHitRate;
const missingScored = applyAuditOnlyOffensiveScores([missingMetric], baselineSet)[0];
assert.notEqual(missingScored.rollingWindows.last7?.score, 0);

const distribution = scoreDistribution(scored);
assert.equal(distribution.teamCount, 30);
assert.ok((distribution.maximum ?? 0) <= 100);
assert.ok((distribution.minimum ?? 100) >= 0);
assert.ok((distribution.standardDeviation ?? 0) > 1);

const rowsA = buildOffensiveFormSnapshotRows(scored[0], "2026-07-10T20:00:00Z");
const rowsB = buildOffensiveFormSnapshotRows(scored[0], "2026-07-10T21:00:00Z");
assert.equal(rowsA[0]?.feature_hash, rowsB[0]?.feature_hash);
const baselineTimestampChanged = structuredClone(scored[0]);
baselineTimestampChanged.rollingWindows.last7!.baselineAsOf = "2026-07-10T22:00:00Z";
const rowsC = buildOffensiveFormSnapshotRows(baselineTimestampChanged, "2026-07-10T22:00:00Z");
assert.equal(rowsA[0]?.feature_hash, rowsC[0]?.feature_hash);
assert.equal(rowsA[0]?.score_version, "offensive_score_v1");
assert.equal(rowsA[0]?.baseline_version, "offensive_baseline_v1");

const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
assert.equal(automationUtils.includes("offensive-baseline-repository"), false);
assert.equal(automationUtils.includes("atlas_offensive_score"), false);

console.log("MLB offensive score validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
