import assert from "node:assert/strict";
import {
  buildMlbSportsProjection,
  compareMlbLineups,
  getMlbOfficialSportsIntelligenceProviderWhenEnabled,
  getMlbSportsIntelligenceFeatures,
  mapOddsEventToOfficialMlbGame,
  normalizeTeamLineup,
  verifyOfficialStarter,
  type MlbGameContext,
  type MlbOfficialClient,
  type MlbOfficialBoxscore,
  type MlbOfficialGameClient,
  type MlbOfficialPerson,
  type MlbOfficialScheduleGame,
} from "../app/lib/mlb-engine/sports-intelligence";
import { MlbOfficialSportsIntelligenceProvider } from "../app/lib/mlb-engine/sports-intelligence/providers/mlb-official-lineup-provider";

function context(overrides: Partial<MlbGameContext> = {}): MlbGameContext {
  return {
    eventId: "odds-1",
    homeTeam: "New York Mets",
    awayTeam: "Atlanta Braves",
    commenceTime: "2026-07-10T23:10:00Z",
    currentTime: "2026-07-10T12:00:00Z",
    marketKeys: ["h2h", "spreads", "totals"],
    ...overrides,
  };
}

function scheduleGame(overrides: Partial<MlbOfficialScheduleGame> = {}): MlbOfficialScheduleGame {
  return {
    gamePk: 100,
    gameDate: "2026-07-10T23:10:00Z",
    gameNumber: 1,
    doubleHeader: "N",
    teams: {
      away: { team: { id: 144, name: "Atlanta Braves" }, probablePitcher: { id: 1, fullName: "Away Arm" } },
      home: { team: { id: 121, name: "New York Mets" }, probablePitcher: { id: 2, fullName: "Home Arm" } },
    },
    ...overrides,
  };
}

function player(id: number, order: number, name = `Player ${id}`) {
  return {
    person: { id, fullName: name },
    battingOrder: `${order}00`,
    position: { code: "7", name: "Outfielder" },
    status: { code: "A", description: "Active" },
  };
}

function teamLineup(teamId: number, teamName: string, ids: number[], duplicateOrder = false) {
  const players: Record<string, ReturnType<typeof player>> = {};
  ids.forEach((id, index) => {
    players[`ID${id}`] = player(id, duplicateOrder && index === 1 ? 1 : index + 1);
  });
  return {
    team: { id: teamId, name: teamName },
    battingOrder: ids.map(String),
    pitchers: [ids[0]],
    players,
  };
}

function boxscore(input: {
  homeIds?: number[];
  awayIds?: number[];
  duplicateHomeOrder?: boolean;
  duplicatePlayer?: boolean;
  homePitcher?: number;
  awayPitcher?: number;
} = {}): MlbOfficialBoxscore {
  const homeIds = input.homeIds ?? [201, 202, 203, 204, 205, 206, 207, 208, 209];
  const awayIds = input.awayIds ?? [101, 102, 103, 104, 105, 106, 107, 108, 109];
  const home = teamLineup(121, "New York Mets", input.duplicatePlayer ? [201, 201, 203, 204, 205, 206, 207, 208, 209] : homeIds, input.duplicateHomeOrder);
  const away = teamLineup(144, "Atlanta Braves", awayIds);
  home.pitchers = [input.homePitcher ?? 2];
  away.pitchers = [input.awayPitcher ?? 1];
  home.players.ID2 = { ...player(2, 0, "Home Arm"), position: { code: "1", name: "Pitcher" } };
  away.players.ID1 = { ...player(1, 0, "Away Arm"), position: { code: "1", name: "Pitcher" } };
  return { teams: { home, away } };
}

class FixtureGameClient implements MlbOfficialGameClient {
  requestCount = 0;
  constructor(
    private readonly fixture: MlbOfficialBoxscore,
    private readonly status = "Scheduled",
  ) {}
  async getLiveFeed(_gamePk: string) {
    this.requestCount += 1;
    return {
      gameData: {
        datetime: { dateTime: "2026-07-10T23:10:00Z" },
        status: { detailedState: this.status },
        probablePitchers: {
          home: { id: 2, fullName: "Home Arm" },
          away: { id: 1, fullName: "Away Arm" },
        },
      },
    };
  }
  async getBoxscore(_gamePk: string) {
    this.requestCount += 1;
    return this.fixture;
  }
}

class FixturePitchClient implements MlbOfficialClient {
  requestCount = 0;
  constructor(private readonly games: MlbOfficialScheduleGame[]) {}
  async getSchedule(date: string) {
    this.requestCount += 1;
    return this.games.filter((game) => game.gameDate?.slice(0, 10) === date);
  }
  async getPerson(playerId: string): Promise<MlbOfficialPerson | null> {
    this.requestCount += 1;
    return { id: Number(playerId), fullName: playerId === "1" ? "Away Arm" : "Home Arm", pitchHand: { code: "R" } };
  }
  async getPitcherSeasonStats(_playerId: string) {
    this.requestCount += 1;
    return { strikeOuts: 1, baseOnBalls: 0, battersFaced: 4 };
  }
  async getPitcherGameLog(_playerId: string) {
    this.requestCount += 1;
    return [];
  }
}

async function main() {
  const completeHome = normalizeTeamLineup({
    side: "HOME",
    team: boxscore().teams?.home,
    confirmedAt: "2026-07-10T23:10:00Z",
  });
  assert.equal(completeHome.confirmed, true);
  assert.equal(completeHome.actualPlayerCount, 9);

  const incompleteHome = normalizeTeamLineup({
    side: "HOME",
    team: boxscore({ homeIds: [201, 202, 203, 204, 205, 206, 207, 208] }).teams?.home,
  });
  assert.equal(incompleteHome.confirmed, false);
  assert.match(incompleteHome.warnings.join(" "), /only 8 players/);

  const duplicateOrder = normalizeTeamLineup({
    side: "HOME",
    team: boxscore({ duplicateHomeOrder: true }).teams?.home,
  });
  assert.equal(duplicateOrder.confirmed, false);
  assert.match(duplicateOrder.warnings.join(" "), /duplicate/);

  const duplicatePlayer = normalizeTeamLineup({
    side: "HOME",
    team: boxscore({ duplicatePlayer: true }).teams?.home,
  });
  assert.equal(duplicatePlayer.confirmed, false);
  assert.match(duplicatePlayer.warnings.join(" "), /appears more than once/);

  const noLineup = normalizeTeamLineup({ side: "HOME", team: { team: { id: 1, name: "Mets" }, battingOrder: [], players: {} } });
  assert.equal(noLineup.confirmed, false);
  assert.equal(noLineup.players.length, 0);

  const game1 = mapOddsEventToOfficialMlbGame({
    context: context({ commenceTime: "2026-07-10T17:10:00Z" }),
    officialGames: [
      scheduleGame({ gamePk: 1001, gameDate: "2026-07-10T17:10:00Z", doubleHeader: "Y", gameNumber: 1 }),
      scheduleGame({ gamePk: 1002, gameDate: "2026-07-10T23:10:00Z", doubleHeader: "Y", gameNumber: 2 }),
    ],
  });
  assert.equal(game1.mapping.officialGameId, "1001");

  const game2 = mapOddsEventToOfficialMlbGame({
    context: context({ commenceTime: "2026-07-10T23:10:00Z" }),
    officialGames: [
      scheduleGame({ gamePk: 1001, gameDate: "2026-07-10T17:10:00Z", doubleHeader: "Y", gameNumber: 1 }),
      scheduleGame({ gamePk: 1002, gameDate: "2026-07-10T23:10:00Z", doubleHeader: "Y", gameNumber: 2 }),
    ],
  });
  assert.equal(game2.mapping.officialGameId, "1002");

  const ambiguous = mapOddsEventToOfficialMlbGame({
    context: context(),
    officialGames: [scheduleGame({ gamePk: 1 }), scheduleGame({ gamePk: 2 })],
  });
  assert.equal(ambiguous.mapping.matched, false);

  const postponed = await new MlbOfficialSportsIntelligenceProvider({
    enablePitcher: false,
    enableLineup: true,
    pitcherClient: new FixturePitchClient([scheduleGame()]),
    gameClient: new FixtureGameClient(
      { teams: { home: { team: { id: 121, name: "New York Mets" }, battingOrder: [], players: {} }, away: { team: { id: 144, name: "Atlanta Braves" }, battingOrder: [], players: {} } } },
      "Postponed",
    ),
  }).getLineupStrengthFeatures(context());
  assert.equal(postponed.metadata.availability, "UNAVAILABLE");
  assert.match(postponed.metadata.warnings?.join(" ") ?? "", /postponed/i);

  const matchedStarter = verifyOfficialStarter({
    team: "HOME",
    sideBoxscore: boxscore().teams?.home,
    liveFeed: { gameData: { probablePitchers: { home: { id: 2, fullName: "Home Arm" } }, datetime: { dateTime: "2026-07-10T23:10:00Z" } } },
  });
  assert.equal(matchedStarter.status, "MATCHED");

  const changedStarter = verifyOfficialStarter({
    team: "HOME",
    sideBoxscore: boxscore({ homePitcher: 3 }).teams?.home,
    liveFeed: { gameData: { probablePitchers: { home: { id: 2, fullName: "Home Arm" } } } },
  });
  assert.equal(changedStarter.status, "CHANGED");

  const probableOnly = verifyOfficialStarter({
    team: "HOME",
    sideBoxscore: { team: { id: 1, name: "Mets" }, pitchers: [], players: {} },
    liveFeed: { gameData: { probablePitchers: { home: { id: 2, fullName: "Home Arm" } } } },
  });
  assert.equal(probableOnly.status, "PROBABLE_ONLY");

  const comparison = compareMlbLineups(
    completeHome,
    normalizeTeamLineup({
      side: "HOME",
      team: teamLineup(121, "New York Mets", [202, 201, 203, 204, 205, 206, 207, 208, 210]),
    }),
  );
  assert.equal(comparison.changed, true);
  assert.deepEqual(comparison.addedPlayerIds, ["210"]);
  assert.deepEqual(comparison.removedPlayerIds, ["209"]);
  assert.ok(comparison.battingOrderChanges.some((change) => change.playerId === "201"));

  const disabled = getMlbOfficialSportsIntelligenceProviderWhenEnabled({
    sportsIntelligenceEnabled: false,
    pitcherModelEnabled: false,
    lineupModelEnabled: false,
  });
  const disabledFeatures = await getMlbSportsIntelligenceFeatures(context(), disabled);
  assert.equal(disabledFeatures.lineup.homeLineup, undefined);
  assert.equal(disabledFeatures.lineup.metadata.availability, "UNAVAILABLE");

  const projection = buildMlbSportsProjection(disabledFeatures);
  assert.equal(projection.projectionAvailability, "UNAVAILABLE");
  assert.equal(projection.homeWinProbability, undefined);

  const fs = await import("node:fs/promises");
  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(automationUtils.includes("mlb-official-lineup-provider"), false);
  assert.equal(automationUtils.includes("LineupStrengthFeatures"), false);

  const auditRoute = await fs.readFile("app/api/internal/mlb-engine-audit/route.ts", "utf8");
  assert.equal(auditRoute.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(auditRoute.includes("SPORTSDATAIO_API_KEY"), false);

  console.log("MLB lineup provider validation passed");
}

main();
