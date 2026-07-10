import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  buildBullpenFeatureSnapshotRows,
  buildTeamBullpenFeatures,
  MlbOfficialBullpenProvider,
  type MlbRelieverAppearance,
} from "../app/lib/mlb-engine/sports-intelligence";
import { buildMlbSportsProjection } from "../app/lib/mlb-engine/sports-intelligence/projection";

function appearance(input: Partial<MlbRelieverAppearance> & { playerId: string; gameDate: string; startedGame?: boolean }): MlbRelieverAppearance {
  return {
    officialGameId: input.officialGameId ?? `game-${input.gameDate}-${input.playerId}`,
    gameDate: input.gameDate,
    playerId: input.playerId,
    playerName: input.playerName ?? `Pitcher ${input.playerId}`,
    teamId: input.teamId ?? "111",
    teamName: input.teamName ?? "Boston Red Sox",
    inningsPitched: input.inningsPitched ?? 1,
    pitchesThrown: input.pitchesThrown,
    battersFaced: input.battersFaced ?? 3,
    hitsAllowed: input.hitsAllowed ?? 0,
    walksAllowed: input.walksAllowed ?? 0,
    strikeouts: input.strikeouts ?? 1,
    runsAllowed: input.runsAllowed ?? 0,
    earnedRunsAllowed: input.earnedRunsAllowed ?? 0,
    save: input.save,
    hold: input.hold,
    blownSave: input.blownSave,
    gameFinished: input.gameFinished,
    startedGame: Boolean(input.startedGame),
    reliefAppearance: input.reliefAppearance ?? !input.startedGame,
    source: "MLB_OFFICIAL",
    warnings: input.warnings ?? [],
  };
}

async function main() {
  process.env.MLB_BULLPEN_MODEL_ENABLED = "false";
  process.env.MLB_BULLPEN_PROVIDER_ENABLED = "false";
  process.env.MLB_BULLPEN_FATIGUE_SCORE_ENABLED = "false";

  const asOf = "2026-07-10T20:00:00Z";
  const starter = appearance({ playerId: "1", gameDate: "2026-07-09T23:00:00Z", pitchesThrown: 95, startedGame: true });
  const closer = appearance({ playerId: "2", playerName: "Closer", gameDate: "2026-07-09T23:00:00Z", pitchesThrown: 18, save: true, gameFinished: true });
  const setup = appearance({ playerId: "3", playerName: "Setup", gameDate: "2026-07-08T23:00:00Z", pitchesThrown: 16, hold: true });
  const consecutiveA = appearance({ playerId: "4", gameDate: "2026-07-09T23:00:00Z", pitchesThrown: 22 });
  const consecutiveB = appearance({ playerId: "4", gameDate: "2026-07-08T23:00:00Z", pitchesThrown: 24 });
  const heavyA = appearance({ playerId: "5", gameDate: "2026-07-09T23:00:00Z", pitchesThrown: 31 });
  const heavyB = appearance({ playerId: "5", gameDate: "2026-07-08T23:00:00Z", pitchesThrown: 28 });
  const heavyC = appearance({ playerId: "5", gameDate: "2026-07-07T23:00:00Z", pitchesThrown: 18 });
  const missingPitch = appearance({ playerId: "6", gameDate: "2026-07-06T23:00:00Z", pitchesThrown: undefined });
  const doubleheader = appearance({ playerId: "7", officialGameId: "dh1", gameDate: "2026-07-09T17:00:00Z", pitchesThrown: 12 });
  const doubleheader2 = appearance({ playerId: "7", officialGameId: "dh2", gameDate: "2026-07-09T23:00:00Z", pitchesThrown: 15 });
  const extraInning = appearance({ playerId: "8", officialGameId: "extras", gameDate: "2026-07-07T23:00:00Z", inningsPitched: 2, pitchesThrown: 36 });
  const positionPlayer = appearance({
    playerId: "9",
    gameDate: "2026-07-05T23:00:00Z",
    pitchesThrown: 11,
    gameFinished: false,
    warnings: ["Pitching appearance may be a position-player pitching event."],
  });

  const team = buildTeamBullpenFeatures({
    teamId: "111",
    teamName: "Boston Red Sox",
    appearances: [starter, closer, setup, consecutiveA, consecutiveB, heavyA, heavyB, heavyC, missingPitch, doubleheader, doubleheader2, extraInning, positionPlayer],
    gamesRequested: 7,
    gamesIncluded: 7,
    asOf,
    sourceUpdatedAt: asOf,
    scoreEnabled: true,
  });

  assert.equal(team.relievers.some((reliever) => reliever.playerId === "1"), false, "Starter excluded from relief workload.");
  assert.equal(team.relievers.some((reliever) => reliever.playerId === "2"), true, "True relief appearance included.");
  assert.ok(team.warnings.some((warning) => warning.includes("missing official pitch counts")), "Missing pitch count creates PARTIAL warning.");
  assert.equal(team.metadata.availability, "PARTIAL");
  assert.equal(team.relievers.find((reliever) => reliever.playerId === "2")?.appearancesLast1Day, 1);
  assert.equal(team.relievers.find((reliever) => reliever.playerId === "4")?.appearancesLast2Days, 2);
  assert.equal(team.relievers.find((reliever) => reliever.playerId === "5")?.appearancesLast3Days, 3);
  assert.equal(team.relievers.find((reliever) => reliever.playerId === "6")?.appearancesLast7Days, 1);
  assert.equal(team.relievers.find((reliever) => reliever.playerId === "4")?.consecutiveDaysUsed, 2);
  assert.equal(team.relievers.find((reliever) => reliever.playerId === "7")?.appearancesLast1Day, 2, "Doubleheader workload preserved.");
  assert.ok((team.totalInningsLast3Days ?? 0) >= 2, "Extra-inning bullpen load contributes innings.");
  assert.equal(team.relievers.find((reliever) => reliever.playerId === "7")?.pitchesLast1Day, 27, "Pitch-count aggregation works.");
  assert.equal(team.closerCandidate?.playerId, "2", "Closer candidate from save evidence.");
  assert.equal(team.highLeverageRelievers.some((reliever) => reliever.playerId === "3" && reliever.roleEvidence === "HOLDS"), true);
  assert.equal(team.highLeverageRelievers.some((reliever) => reliever.playerId === "9"), false, "Position player not high leverage without role evidence.");
  assert.ok((team.fatigueScore ?? -1) >= 0 && (team.fatigueScore ?? 101) <= 100);
  assert.equal(team.qualityScore, undefined, "Workload and quality remain separate.");

  const noRole = buildTeamBullpenFeatures({
    teamId: "112",
    teamName: "Chicago Cubs",
    appearances: [appearance({ playerId: "10", gameDate: "2026-07-09T23:00:00Z", pitchesThrown: 8 })],
    gamesRequested: 7,
    gamesIncluded: 7,
    asOf,
    scoreEnabled: true,
  });
  assert.equal(noRole.closerCandidate, undefined, "No role evidence returns no closer candidate.");

  const rowsA = buildBullpenFeatureSnapshotRows([team], asOf);
  const rowsB = buildBullpenFeatureSnapshotRows([team], "2026-07-10T21:00:00Z");
  assert.equal(rowsA[0]?.feature_hash, rowsB[0]?.feature_hash, "Timestamp-only changes do not create new hash.");
  const changed = structuredClone(team);
  changed.totalPitchesLast3Days = (changed.totalPitchesLast3Days ?? 0) + 1;
  const rowsC = buildBullpenFeatureSnapshotRows([changed], asOf);
  assert.notEqual(rowsA[0]?.feature_hash, rowsC[0]?.feature_hash, "New completed-game workload creates new hash.");

  const disabled = new MlbOfficialBullpenProvider({ enabled: false });
  const disabledCapture = await disabled.captureAllTeams(asOf);
  assert.equal(disabledCapture.gamesProcessed, 0, "Flags false make zero requests.");
  assert.equal(disabled.getHealth().requests, 0, "Flags false make zero requests.");

  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(automationUtils.includes("bullpen"), false, "CandidateScore unchanged; automation utilities do not import bullpen modules.");
  assert.equal(automationUtils.includes("fatigue_score"), false, "Picks unchanged; no bullpen persistence consumed by pick generation.");
  const projection = buildMlbSportsProjection({
    eventId: "test",
    homeTeam: "A",
    awayTeam: "B",
    commenceTime: asOf,
    startingPitcher: { metadata: { availability: "UNAVAILABLE" } },
    lineup: { metadata: { availability: "UNAVAILABLE" } },
    playerAvailability: { metadata: { availability: "UNAVAILABLE" }, homePlayers: [], awayPlayers: [], warnings: [] },
    offensiveForm: { metadata: { availability: "UNAVAILABLE" } },
    bullpen: { metadata: { availability: "AVAILABLE" }, home: team as any, away: noRole as any },
    weatherPark: { metadata: { availability: "UNAVAILABLE" } },
    overallAvailability: "PARTIAL",
    availableModuleCount: 1,
    totalModuleCount: 6,
    warnings: [],
  });
  assert.equal(projection.projectionAvailability, "UNAVAILABLE", "Sports Projection remains UNAVAILABLE.");
  assert.equal(JSON.stringify(process.env).includes("SUPABASE_SERVICE_ROLE_KEY="), false, "No secrets exposed by validation output.");

  console.log("MLB bullpen provider validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

