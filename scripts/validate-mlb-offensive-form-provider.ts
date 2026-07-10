import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  aggregateStatcastRowsForTeam,
  buildMlbSportsProjection,
  buildOffensiveFormFeatures,
  buildStatcastLeagueBaseline,
  classifyOffensiveSampleQuality,
  getMlbTeamIdentityByName,
  normalizeMlbTeamName,
  normalizeStatcastCsv,
  selectCompletedGamesForTeam,
  StatcastOffenseProvider,
  type MlbGameContext,
  type MlbOfficialScheduleGame,
  type StatcastSearchRow,
  type VerifiedOffensiveRollingStats,
} from "../app/lib/mlb-engine/sports-intelligence";

const asOf = "2026-07-10T18:00:00Z";

function game(index: number, overrides: Partial<MlbOfficialScheduleGame> = {}): MlbOfficialScheduleGame {
  const day = String(index + 1).padStart(2, "0");
  return {
    gamePk: 700000 + index,
    gameDate: `2026-06-${day}T23:10:00Z`,
    status: { abstractGameState: "Final", detailedState: "Final" },
    teams: {
      home: { team: { id: 121, name: "New York Mets" } },
      away: { team: { id: 144, name: "Atlanta Braves" } },
    },
    ...overrides,
  };
}

function rowsForGame(gamePk: string, teamId = "121"): StatcastSearchRow[] {
  const rows: StatcastSearchRow[] = [];
  for (let index = 0; index < 10; index += 1) {
    rows.push({
      gamePk,
      gameDate: "2026-06-20",
      battingTeamId: teamId,
      events: index < 4 ? "single" : "field_out",
      launchSpeed: index < 5 ? 98 : 87,
      launchSpeedAngle: index === 0 ? 6 : 4,
      estimatedBaUsingSpeedangle: 0.265,
      estimatedSlgUsingSpeedangle: 0.455,
      estimatedWobaUsingSpeedangle: 0.345,
      wobaDenom: 1,
    });
  }
  for (let index = 0; index < 5; index += 1) rows.push({ gamePk, battingTeamId: teamId, events: "walk", wobaDenom: 1 });
  for (let index = 0; index < 5; index += 1) rows.push({ gamePk, battingTeamId: teamId, events: "strikeout", wobaDenom: 1 });
  return rows;
}

async function main() {
const mets = getMlbTeamIdentityByName("NY Mets");
const yankees = getMlbTeamIdentityByName("New York Yankees");
const cubs = getMlbTeamIdentityByName("Chicago Cubs");
const whiteSox = getMlbTeamIdentityByName("Chicago White Sox");
const angels = getMlbTeamIdentityByName("LA Angels");
const dodgers = getMlbTeamIdentityByName("LA Dodgers");
const athletics = getMlbTeamIdentityByName("Oakland Athletics");
const diamondbacks = getMlbTeamIdentityByName("Arizona Diamondbacks");
const nationals = getMlbTeamIdentityByName("Washington Nationals");

assert.ok(mets);
assert.ok(yankees);
assert.ok(cubs);
assert.ok(whiteSox);
assert.ok(angels);
assert.ok(dodgers);
assert.ok(athletics);
assert.ok(diamondbacks);
assert.ok(nationals);
assert.equal(normalizeMlbTeamName("Sacramento Athletics"), "athletics");
assert.equal(mets.officialTeamId, "121");
assert.equal(yankees.savantCode, "NYY");
assert.notEqual(cubs.officialTeamId, whiteSox.officialTeamId);
assert.notEqual(angels.officialTeamId, dodgers.officialTeamId);

const completedGames = Array.from({ length: 32 }, (_, index) => game(index));
const officialGames = [
  ...completedGames,
  game(40, { gamePk: 800001, gameDate: "2026-07-11T23:10:00Z" }),
  game(41, { gamePk: 800002, status: { abstractGameState: "Preview", detailedState: "Postponed" } }),
  game(42, { gamePk: 800003, status: { abstractGameState: "Live", detailedState: "Suspended" } }),
  game(43, { gamePk: 800004, gameDate: "2026-07-09T17:10:00Z", gameNumber: 1, doubleHeader: "Y" }),
  game(44, { gamePk: 800005, gameDate: "2026-07-09T23:10:00Z", gameNumber: 2, doubleHeader: "Y" }),
];

const last7 = selectCompletedGamesForTeam({
  officialGames,
  teamId: "121",
  asOf,
  requestedGames: 7,
});
assert.equal(last7.length, 7);
assert.equal(new Set(last7.map((item) => item.gamePk)).size, 7);
assert.ok(last7.some((item) => item.gamePk === "800004"));
assert.ok(last7.some((item) => item.gamePk === "800005"));
assert.equal(last7.some((item) => item.gamePk === "800001"), false);
assert.equal(last7.some((item) => item.gamePk === "800002"), false);
assert.equal(last7.some((item) => item.gamePk === "800003"), false);

const rows = last7.flatMap((item) => rowsForGame(item.gamePk));
const aggregate = aggregateStatcastRowsForTeam({
  team: mets,
  rows,
  games: last7,
  window: "last7",
});
assert.equal(aggregate.gamesRequested, 7);
assert.equal(aggregate.gamesIncluded, 7);
assert.equal(aggregate.plateAppearances, 140);
assert.equal(aggregate.battedBallEvents, 70);
assert.equal(aggregate.hits, 28);
assert.equal(aggregate.walks, 35);
assert.equal(aggregate.strikeouts, 35);
assert.equal(aggregate.hardHitBalls, 35);
assert.equal(aggregate.barrels, 7);
assert.equal(aggregate.hardHitRate, 0.5);
assert.equal(aggregate.barrelRate, 0.1);
assert.equal(aggregate.walkRate, 0.25);
assert.equal(aggregate.strikeoutRate, 0.25);
assert.equal(aggregate.averageExitVelocity, 92.5);
assert.equal(aggregate.xBA, 0.265);
assert.equal(aggregate.xSLG, 0.455);
assert.equal(aggregate.xwOBA, 0.345);
assert.equal(aggregate.sampleQuality, "LIMITED");

const emptyAggregate = aggregateStatcastRowsForTeam({ team: mets, rows: [], games: [], window: "last7" });
assert.equal(emptyAggregate.hardHitRate, undefined);
assert.equal(emptyAggregate.sampleQuality, "UNAVAILABLE");
assert.equal(classifyOffensiveSampleQuality({
  gamesRequested: 7,
  gamesIncluded: 3,
  plateAppearances: 90,
  battedBallEvents: 40,
  sourceAvailable: true,
}), "INSUFFICIENT");

const csv = [
  "game_date,game_pk,home_team,away_team,inning_topbot,events,launch_speed,launch_speed_angle,estimated_ba_using_speedangle,estimated_woba_using_speedangle,woba_denom",
  "2026-06-20,1,NYM,ATL,Bot,single,99.1,6,0.777,0.888,1",
].join("\n");
const parsedCsv = normalizeStatcastCsv(csv);
assert.equal(parsedCsv[0]?.battingTeamId, "121");
assert.equal(parsedCsv[0]?.launchSpeed, 99.1);

const strongWindow: VerifiedOffensiveRollingStats = {
  teamId: "121",
  teamName: "New York Mets",
  asOf,
  source: "BASEBALL_SAVANT",
  windows: { last30: aggregate },
};
const weakWindow: VerifiedOffensiveRollingStats = {
  teamId: "120",
  teamName: "Washington Nationals",
  asOf,
  source: "BASEBALL_SAVANT",
  windows: {
    last30: {
      ...aggregate,
      hardHitRate: 0.31,
      barrelRate: 0.04,
      exitVelocity: 86.1,
      walkRate: 0.06,
      strikeoutRate: 0.29,
      expectedBattingAverage: 0.21,
      expectedSlugging: 0.33,
      expectedWeightedOnBaseAverage: 0.27,
    },
  },
};
const baseline = buildStatcastLeagueBaseline({ teamWindows: [strongWindow, weakWindow], asOf });
assert.ok(baseline.metrics.hardHitRate);
const scored = buildOffensiveFormFeatures({
  home: strongWindow,
  away: weakWindow,
  baseline,
  scoringEnabled: true,
  observedAt: asOf,
});
assert.equal(scored.metadata.availability, "AVAILABLE");
assert.ok((scored.home?.atlasOffensiveScore ?? -1) >= 0);
assert.ok((scored.home?.atlasOffensiveScore ?? 101) <= 100);
assert.equal(scored.formAdvantage, "HOME");

const unscored = buildOffensiveFormFeatures({ home: strongWindow, away: weakWindow, observedAt: asOf });
assert.equal(unscored.home?.atlasOffensiveScore, undefined);
assert.equal(unscored.home?.rollingWindows.last30?.componentBreakdown.length, 0);
assert.equal(unscored.home?.availability, "AVAILABLE");

let scheduleRequests = 0;
let statcastRequests = 0;
const disabledProvider = new StatcastOffenseProvider({
  enabled: false,
  scoreEnabled: false,
  officialClient: {
    async getSchedule() {
      scheduleRequests += 1;
      return [];
    },
  },
  statcastClient: {
    async getRows() {
      statcastRequests += 1;
      return { rows: [], sourceUrl: "", fetchedAt: asOf, cacheHit: false, latencyMs: 0 };
    },
  } as any,
});
const context: MlbGameContext = {
  eventId: "fixture",
  homeTeam: "New York Mets",
  awayTeam: "Washington Nationals",
  commenceTime: asOf,
  currentTime: asOf,
  marketKeys: ["h2h"],
};
const disabledFeatures = await disabledProvider.getOffensiveFormFeatures(context);
assert.equal(disabledFeatures.metadata.availability, "UNAVAILABLE");
assert.equal(scheduleRequests, 0);
assert.equal(statcastRequests, 0);

const projection = buildMlbSportsProjection({
  eventId: "fixture",
  homeTeam: "New York Mets",
  awayTeam: "Washington Nationals",
  commenceTime: asOf,
  startingPitcher: { metadata: { availability: "UNAVAILABLE" } },
  lineup: { metadata: { availability: "UNAVAILABLE" } },
  offensiveForm: scored,
  playerAvailability: { metadata: { availability: "UNAVAILABLE" }, homePlayers: [], awayPlayers: [], warnings: [] },
  bullpen: { metadata: { availability: "UNAVAILABLE" } },
  weatherPark: { metadata: { availability: "UNAVAILABLE" } },
  overallAvailability: "PARTIAL",
  availableModuleCount: 1,
  totalModuleCount: 6,
  warnings: [],
});
assert.equal(projection.projectionAvailability, "UNAVAILABLE");
assert.equal(projection.projectedTotalRuns, undefined);

const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
assert.equal(automationUtils.includes("offensive-form-engine"), false);
assert.equal(automationUtils.includes("statcast-offense-provider"), false);
assert.equal(automationUtils.includes("MLB_STATCAST_PROVIDER_ENABLED"), false);

const providerSource = await fs.readFile("app/lib/mlb-engine/sports-intelligence/offense/statcast-offense-provider.ts", "utf8");
assert.equal(providerSource.includes("ODDS_API"), false);
assert.equal(providerSource.includes("market"), false);
assert.equal(providerSource.includes("process.env"), false);

const envExample = await fs.readFile(".env.example", "utf8");
assert.equal(envExample.includes("MLB_STATCAST_PROVIDER_ENABLED=false"), true);
assert.equal(envExample.includes("MLB_OFFENSIVE_SCORE_ENABLED=false"), true);

console.log("MLB offensive Statcast provider validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
