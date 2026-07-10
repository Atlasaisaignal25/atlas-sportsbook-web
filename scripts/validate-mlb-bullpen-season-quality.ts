import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  applyBullpenQualityV2,
  buildBullpenQualityBaselines,
  buildReliefWindows,
  outsToBaseballInnings,
  parseBaseballInningsToOuts,
} from "../app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-season-quality";
import { buildBullpenFeatureSnapshotRows } from "../app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-feature-repository";
import { applyBullpenFatigueV2 } from "../app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-calibration";
import { buildTeamBullpenFeatures } from "../app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-workload";
import { buildMlbSportsProjection, type MlbRelieverAppearance } from "../app/lib/mlb-engine/sports-intelligence";

const AS_OF = "2026-07-10T20:00:00Z";
const SEASON_START = "2026-03-01";

function app(teamId: string, playerId: string, gameDate: string, extra: Partial<MlbRelieverAppearance> = {}): MlbRelieverAppearance {
  return {
    officialGameId: extra.officialGameId ?? `${teamId}-${gameDate.slice(0, 10)}-${playerId}`,
    gameDate,
    playerId,
    playerName: extra.playerName ?? `Pitcher ${playerId}`,
    teamId,
    teamName: extra.teamName ?? `Team ${teamId}`,
    inningsPitched: extra.inningsPitched ?? 1,
    pitchesThrown: extra.pitchesThrown ?? 13,
    battersFaced: extra.battersFaced ?? 4,
    hitsAllowed: extra.hitsAllowed ?? 1,
    walksAllowed: extra.walksAllowed ?? 0,
    strikeouts: extra.strikeouts ?? 1,
    runsAllowed: extra.runsAllowed ?? extra.earnedRunsAllowed ?? 0,
    earnedRunsAllowed: extra.earnedRunsAllowed ?? 0,
    homeRunsAllowed: extra.homeRunsAllowed ?? 0,
    save: extra.save,
    hold: extra.hold,
    blownSave: extra.blownSave,
    gameFinished: extra.gameFinished,
    startedGame: Boolean(extra.startedGame),
    reliefAppearance: extra.reliefAppearance ?? !extra.startedGame,
    source: "MLB_OFFICIAL",
    warnings: extra.warnings ?? [],
  };
}

function team(teamId: string, appearances: MlbRelieverAppearance[]) {
  return buildTeamBullpenFeatures({
    teamId,
    teamName: `Team ${teamId}`,
    appearances,
    gamesRequested: 7,
    gamesIncluded: new Set(appearances.map((item) => item.officialGameId)).size,
    asOf: AS_OF,
    sourceUpdatedAt: AS_OF,
    scoreEnabled: true,
  });
}

function makeTeamAppearances(teamId: string, strength: number) {
  const rows: MlbRelieverAppearance[] = [
    app(teamId, "starter", "2026-07-09T20:00:00Z", {
      startedGame: true,
      reliefAppearance: false,
      inningsPitched: 6,
      earnedRunsAllowed: 9,
      hitsAllowed: 10,
      walksAllowed: 3,
      strikeouts: 1,
      battersFaced: 31,
    }),
  ];
  for (let i = 0; i < 420; i += 1) {
    const day = 1 + (i % 131);
    const date = new Date("2026-03-01T20:00:00Z");
    date.setUTCDate(date.getUTCDate() + day);
    rows.push(app(teamId, `r${i % 9}`, date.toISOString(), {
      officialGameId: `${teamId}-g${i}`,
      inningsPitched: i % 3 === 0 ? 0.33 : 1,
      battersFaced: strength >= 0 ? 3 + (i % 2) : 5 + (i % 3),
      earnedRunsAllowed: strength >= 0 ? (i % 13 === 0 ? 1 : 0) : (i % 2),
      runsAllowed: strength >= 0 ? (i % 13 === 0 ? 1 : 0) : (i % 2),
      hitsAllowed: strength >= 0 ? (i % 4 === 0 ? 1 : 0) : 2,
      walksAllowed: strength >= 0 ? (i % 9 === 0 ? 1 : 0) : 1,
      strikeouts: strength >= 0 ? 2 : (i % 3 === 0 ? 1 : 0),
      homeRunsAllowed: strength >= 0 ? (i % 31 === 0 ? 1 : 0) : (i % 5 === 0 ? 1 : 0),
      hold: strength >= 0 && i % 8 === 0,
      save: strength >= 0 && i % 19 === 0,
      blownSave: strength < 0 && i % 11 === 0,
    }));
  }
  rows.push(app(teamId, "pos", "2026-07-08T20:00:00Z", {
    inningsPitched: 1,
    battersFaced: 7,
    earnedRunsAllowed: 5,
    hitsAllowed: 5,
    warnings: ["Pitching appearance may be a position-player pitching event."],
  }));
  return rows;
}

function assertRange(value: number | undefined, label: string) {
  assert.ok(value !== undefined && value >= 0 && value <= 100, `${label} stays 0-100.`);
}

async function main() {
  assert.equal(parseBaseballInningsToOuts("0.1"), 1);
  assert.equal(parseBaseballInningsToOuts("0.2"), 2);
  assert.equal(parseBaseballInningsToOuts("1.0"), 3);
  assert.equal(parseBaseballInningsToOuts("1.1"), 4);
  assert.equal(parseBaseballInningsToOuts("1.2"), 5);
  assert.equal(outsToBaseballInnings((parseBaseballInningsToOuts("0.1") ?? 0) + (parseBaseballInningsToOuts("0.2") ?? 0)), 1);

  const reliefRows = [
    app("101", "starter", "2026-07-09T20:00:00Z", { startedGame: true, reliefAppearance: false, inningsPitched: 5, earnedRunsAllowed: 9, battersFaced: 28 }),
    app("101", "bulk", "2026-07-09T20:00:00Z", { inningsPitched: 3, battersFaced: 10, strikeouts: 5, warnings: ["Possible opener or bulk-reliever game; relief classification remains evidence-based by official order."] }),
    app("101", "starter-relief", "2026-07-08T20:00:00Z", { inningsPitched: 1, reliefAppearance: true, startedGame: false }),
    app("101", "position", "2026-07-08T20:00:00Z", { warnings: ["Pitching appearance may be a position-player pitching event."], inningsPitched: 1, earnedRunsAllowed: 7 }),
  ];
  const windows = buildReliefWindows({ teamId: "101", teamName: "Team 101", appearances: reliefRows, seasonStart: SEASON_START, asOf: AS_OF });
  assert.equal(windows.SEASON?.reliefAppearances, 2, "Starter and position-player pitching excluded; bulk reliever included.");
  assert.ok(windows.SEASON?.warnings.some((warning) => warning.includes("bulk-reliever")), "Opener/bulk warning preserved.");
  assert.equal(windows.SEASON?.gamesIncluded, 2, "Doubleheader and separate officialGameId evidence stay game-isolated.");
  assert.ok((windows.SEASON?.era ?? 0) < 1, "ERA excludes starter damage.");
  assert.ok((windows.SEASON?.whip ?? 0) > 0, "WHIP calculation has valid denominator.");
  assert.ok((windows.SEASON?.strikeoutRate ?? 0) > (windows.SEASON?.walkRate ?? 1), "K rate and BB rate directions are valid.");
  assert.ok((windows.SEASON?.kMinusBbRate ?? 0) > 0, "K-BB direction is higher-is-better.");
  assert.equal(windows.LAST_30_DAYS?.window, "LAST_30_DAYS");
  assert.equal(windows.LAST_14_DAYS?.window, "LAST_14_DAYS");
  assert.equal(windows.LAST_7_DAYS?.window, "LAST_7_DAYS");

  const appearancesByTeam = new Map<string, MlbRelieverAppearance[]>();
  const teams = Array.from({ length: 30 }, (_, i) => {
    const id = String(200 + i);
    const appearances = makeTeamAppearances(id, i < 15 ? 1 : -1);
    appearancesByTeam.set(id, appearances);
    return applyBullpenFatigueV2(team(id, appearances));
  });
  const windowsByTeam = new Map(Array.from(appearancesByTeam.entries()).map(([teamId, appearances]) => [
    teamId,
    buildReliefWindows({ teamId, teamName: `Team ${teamId}`, appearances, seasonStart: SEASON_START, asOf: AS_OF }),
  ]));
  const baselines = buildBullpenQualityBaselines({ season: 2026, asOf: AS_OF, windowsByTeam });
  assert.ok(baselines.length >= 20, "Baselines created from one row per team across windows.");
  assert.ok(baselines.every((baseline) => baseline.teamCount >= 26), "Fewer than 26 teams rejects baseline readiness.");

  const tooFewTeams = new Map(Array.from(windowsByTeam.entries()).slice(0, 25));
  assert.equal(buildBullpenQualityBaselines({ season: 2026, asOf: AS_OF, windowsByTeam: tooFewTeams }).length, 0);

  const result = applyBullpenQualityV2({ teams, appearancesByTeam, asOf: AS_OF, seasonStart: SEASON_START, season: 2026 });
  const high = result.teams.find((item) => item.teamId === "200");
  const low = result.teams.find((item) => item.teamId === "229");
  assertRange(high?.qualityScoreV2, "Quality v2");
  assert.ok((high?.qualityScoreV2 ?? 0) > (low?.qualityScoreV2 ?? 100), "Good relief metrics score above poor relief metrics.");
  assert.notEqual(high?.qualityScoreV2, high?.fatigueScoreV2, "Quality excludes fatigue.");
  assert.equal(high?.qualityScoreVersion, "bullpen_quality_v2");
  assert.equal(high?.qualityConfidence?.tier, "HIGH");
  assert.ok(high?.seasonQualityComponent !== high?.last7QualityComponent || high?.qualityConfidence?.windowCoverage === 1, "Windows remain separate.");

  const tinyRows = new Map([["999", [app("999", "a", "2026-07-09T20:00:00Z", { inningsPitched: 0.33 })]]]);
  const tiny = applyBullpenQualityV2({ teams: [team("999", tinyRows.get("999") ?? [])], appearancesByTeam: tinyRows, asOf: AS_OF, seasonStart: SEASON_START, season: 2026 }).teams[0];
  assert.equal(tiny.qualityConfidence?.tier, "LOW", "Small sample lowers confidence.");
  assert.equal(tiny.qualityScoreV2, undefined, "Missing baselines/metrics reweight safely without inventing score.");

  const stableRowsA = buildBullpenFeatureSnapshotRows([result.teams[0]], AS_OF)[0];
  const stableRowsB = buildBullpenFeatureSnapshotRows([result.teams[0]], "2026-07-10T21:00:00Z")[0];
  assert.equal(stableRowsA.feature_hash, stableRowsB.feature_hash, "Identical captures dedupe by stable hash.");

  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(automationUtils.includes("bullpen_quality_v2"), false, "Picks unchanged: automation does not import quality v2.");
  assert.equal(automationUtils.includes("quality_score"), false, "Public signals unchanged by quality persistence.");
  const projection = buildMlbSportsProjection({
    eventId: "x",
    homeTeam: "A",
    awayTeam: "B",
    commenceTime: AS_OF,
    startingPitcher: { metadata: { availability: "UNAVAILABLE" } },
    lineup: { metadata: { availability: "UNAVAILABLE" } },
    playerAvailability: { metadata: { availability: "UNAVAILABLE" }, homePlayers: [], awayPlayers: [], warnings: [] },
    offensiveForm: { metadata: { availability: "UNAVAILABLE" } },
    bullpen: { metadata: { availability: "AVAILABLE" }, home: high as any, away: low as any },
    weatherPark: { metadata: { availability: "UNAVAILABLE" } },
    overallAvailability: "PARTIAL",
    availableModuleCount: 1,
    totalModuleCount: 6,
    warnings: [],
  });
  assert.equal(projection.projectionAvailability, "UNAVAILABLE", "Sports Projection remains UNAVAILABLE.");

  const sourceText = await fs.readFile("app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-season-quality.ts", "utf8");
  assert.equal(sourceText.includes("SUPABASE_SERVICE_ROLE_KEY"), false, "No secrets exposed.");
  assert.ok(result.sampleDistributions.SEASON.sufficient >= 26, "Season sample distribution reports sufficient teams.");

  console.log("MLB bullpen season quality validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
