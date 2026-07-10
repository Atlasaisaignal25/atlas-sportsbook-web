import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  applyBullpenFatigueV2,
  applyBullpenQualityScores,
  estimateRelieverFatigue,
} from "../app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-calibration";
import { buildBullpenFeatureSnapshotRows } from "../app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-feature-repository";
import { buildTeamBullpenFeatures } from "../app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-workload";
import { buildMlbSportsProjection, type MlbRelieverAppearance } from "../app/lib/mlb-engine/sports-intelligence";

function app(teamId: string, playerId: string, gameDate: string, pitches: number | undefined, extra: Partial<MlbRelieverAppearance> = {}): MlbRelieverAppearance {
  return {
    officialGameId: extra.officialGameId ?? `${teamId}-${gameDate}-${playerId}`,
    gameDate,
    playerId,
    playerName: extra.playerName ?? `Pitcher ${playerId}`,
    teamId,
    teamName: extra.teamName ?? `Team ${teamId}`,
    inningsPitched: extra.inningsPitched ?? 1,
    pitchesThrown: pitches,
    battersFaced: extra.battersFaced ?? 4,
    hitsAllowed: extra.hitsAllowed ?? 1,
    walksAllowed: extra.walksAllowed ?? 0,
    strikeouts: extra.strikeouts ?? 1,
    runsAllowed: extra.runsAllowed ?? 0,
    earnedRunsAllowed: extra.earnedRunsAllowed ?? 0,
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

function team(teamId: string, appearances: MlbRelieverAppearance[], score = true) {
  return buildTeamBullpenFeatures({
    teamId,
    teamName: `Team ${teamId}`,
    appearances,
    gamesRequested: 7,
    gamesIncluded: new Set(appearances.map((item) => item.officialGameId)).size,
    asOf: "2026-07-10T20:00:00Z",
    sourceUpdatedAt: "2026-07-10T20:00:00Z",
    scoreEnabled: score,
  });
}

async function main() {
  const rested = applyBullpenFatigueV2(team("101", []));
  assert.ok((rested.fatigueScoreV2 ?? 0) <= 20, "Zero recent use produces low fatigue.");

  const ordinary = applyBullpenFatigueV2(team("102", [
    app("102", "a", "2026-07-09T20:00:00Z", 12),
    app("102", "b", "2026-07-08T20:00:00Z", 14),
  ]));
  assert.ok((ordinary.fatigueScoreV2 ?? 100) < 60, "Ordinary workload does not force high fatigue.");

  const heavyWorkload = {
    playerId: "h",
    playerName: "Heavy",
    appearancesLast1Day: 1,
    appearancesLast2Days: 1,
    appearancesLast3Days: 1,
    appearancesLast7Days: 1,
    pitchesLast1Day: 38,
    pitchesLast2Days: 38,
    pitchesLast3Days: 38,
    pitchesLast7Days: 38,
    inningsLast3Days: 2,
    inningsLast7Days: 2,
    consecutiveDaysUsed: 1,
    workloadAvailability: "HEAVY" as const,
    warnings: [],
  };
  const heavyPrev = estimateRelieverFatigue(heavyWorkload);
  assert.ok((heavyPrev.fatigueScore ?? 0) > 45, "Heavy previous-day load increases fatigue.");

  const consecutive = estimateRelieverFatigue({
    ...heavyWorkload,
    pitchesLast1Day: 16,
    pitchesLast3Days: 48,
    consecutiveDaysUsed: 3,
  });
  assert.equal(consecutive.fatigueTier, "HIGH", "Three consecutive days create strong risk.");

  const offDayRecovery = estimateRelieverFatigue({ ...heavyWorkload, appearancesLast1Day: 0, appearancesLast2Days: 0, pitchesLast1Day: 0, pitchesLast3Days: 10, consecutiveDaysUsed: 1 });
  assert.ok((offDayRecovery.fatigueScore ?? 100) < (heavyPrev.fatigueScore ?? 0), "Off day provides recovery.");

  const doubleheader = applyBullpenFatigueV2(team("103", [
    app("103", "a", "2026-07-09T17:00:00Z", 16, { officialGameId: "dh1" }),
    app("103", "a", "2026-07-09T23:00:00Z", 18, { officialGameId: "dh2" }),
  ]));
  assert.equal(doubleheader.doubleheadersLast7Days, 1);

  const missing = applyBullpenFatigueV2(team("104", [app("104", "a", "2026-07-09T20:00:00Z", undefined)]));
  assert.ok((missing.relieverFatigue?.[0]?.confidence ?? 100) < 90, "Missing pitches lower confidence.");
  assert.ok((missing.fatigueScoreV2 ?? -1) >= 0 && (missing.fatigueScoreV2 ?? 101) <= 100, "Fatigue remains 0-100.");

  const qualityTeams = [
    team("201", [
      app("201", "s", "2026-07-01T20:00:00Z", 90, { startedGame: true, reliefAppearance: false, earnedRunsAllowed: 8, inningsPitched: 5, battersFaced: 25 }),
      ...Array.from({ length: 18 }, (_, i) => app("201", `r${i}`, `2026-07-${String(2 + (i % 7)).padStart(2, "0")}T20:00:00Z`, 12, { strikeouts: 3, walksAllowed: 0, hitsAllowed: 0, earnedRunsAllowed: 0, battersFaced: 4, hold: i % 4 === 0 })),
    ]),
    team("202", Array.from({ length: 18 }, (_, i) => app("202", `r${i}`, `2026-07-${String(2 + (i % 7)).padStart(2, "0")}T20:00:00Z`, 12, { strikeouts: 0, walksAllowed: 2, hitsAllowed: 3, earnedRunsAllowed: 2, battersFaced: 6, blownSave: i % 5 === 0 }))),
  ];
  const map = new Map(qualityTeams.map((item) => [item.teamId, item.relievers.flatMap((reliever) =>
    Array.from({ length: reliever.appearancesLast7Days }, (_, index) => app(item.teamId, reliever.playerId, `2026-07-0${Math.min(9, index + 1)}T20:00:00Z`, 12, {
      strikeouts: item.teamId === "201" ? 3 : 0,
      walksAllowed: item.teamId === "201" ? 0 : 2,
      hitsAllowed: item.teamId === "201" ? 0 : 3,
      earnedRunsAllowed: item.teamId === "201" ? 0 : 2,
      battersFaced: item.teamId === "201" ? 4 : 6,
    })),
  )]));
  const quality = applyBullpenQualityScores(qualityTeams.map(applyBullpenFatigueV2), map);
  assert.ok((quality[0].qualityScore ?? 0) > (quality[1].qualityScore ?? 100), "K-BB and WHIP directions correct; ERA alone does not determine quality.");

  const tiny = applyBullpenQualityScores([team("203", [app("203", "a", "2026-07-09T20:00:00Z", 9)])], new Map([["203", [app("203", "a", "2026-07-09T20:00:00Z", 9)]]]))[0];
  assert.equal(tiny.qualityScore, undefined, "Tiny sample prevents quality score.");

  const highQualityHighFatigue = { ...quality[0], fatigueScoreV2: 88, fatigueScore: 88 };
  const lowQualityLowFatigue = { ...quality[1], fatigueScoreV2: 12, fatigueScore: 12 };
  assert.ok((highQualityHighFatigue.qualityScore ?? 0) > (lowQualityLowFatigue.qualityScore ?? 100));
  assert.ok((highQualityHighFatigue.fatigueScore ?? 0) > (lowQualityLowFatigue.fatigueScore ?? 100), "Fatigue and quality remain independent.");

  const rowA = buildBullpenFeatureSnapshotRows([highQualityHighFatigue], "2026-07-10T20:00:00Z")[0];
  const rowB = buildBullpenFeatureSnapshotRows([highQualityHighFatigue], "2026-07-10T21:00:00Z")[0];
  assert.equal(rowA.feature_hash, rowB.feature_hash, "Identical capture dedupes without timestamp-only rows.");
  assert.equal(rowA.canonical, true, "Canonical rows only enter current baseline.");

  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(automationUtils.includes("bullpen"), false, "Picks remain unchanged.");
  assert.equal(automationUtils.includes("quality_score"), false, "Quality modules are not imported by pick generation.");
  const projection = buildMlbSportsProjection({
    eventId: "x",
    homeTeam: "A",
    awayTeam: "B",
    commenceTime: "2026-07-10T20:00:00Z",
    startingPitcher: { metadata: { availability: "UNAVAILABLE" } },
    lineup: { metadata: { availability: "UNAVAILABLE" } },
    playerAvailability: { metadata: { availability: "UNAVAILABLE" }, homePlayers: [], awayPlayers: [], warnings: [] },
    offensiveForm: { metadata: { availability: "UNAVAILABLE" } },
    bullpen: { metadata: { availability: "AVAILABLE" }, home: highQualityHighFatigue as any, away: lowQualityLowFatigue as any },
    weatherPark: { metadata: { availability: "UNAVAILABLE" } },
    overallAvailability: "PARTIAL",
    availableModuleCount: 1,
    totalModuleCount: 6,
    warnings: [],
  });
  assert.equal(projection.projectionAvailability, "UNAVAILABLE", "Sports Projection remains UNAVAILABLE.");
  assert.equal(JSON.stringify(process.env).includes("SUPABASE_SERVICE_ROLE_KEY="), false, "No secrets exposed.");

  console.log("MLB bullpen calibration validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
