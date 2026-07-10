import assert from "node:assert/strict";
import {
  buildMlbSportsProjection,
  getMlbOfficialPitcherProviderWhenEnabled,
  getMlbSportsIntelligenceFeatures,
  mapOddsEventToOfficialMlbGame,
  normalizePitcherSeasonStats,
  normalizeStartingPitcher,
  type MlbGameContext,
  type MlbOfficialClient,
  type MlbOfficialPerson,
  type MlbOfficialScheduleGame,
} from "../app/lib/mlb-engine/sports-intelligence";
import { MlbOfficialPitcherProvider } from "../app/lib/mlb-engine/sports-intelligence/providers/mlb-official-pitcher-provider";

function game(overrides: Partial<MlbOfficialScheduleGame> = {}): MlbOfficialScheduleGame {
  return {
    gamePk: 100,
    gameDate: "2026-07-10T23:10:00Z",
    gameNumber: 1,
    doubleHeader: "N",
    status: { detailedState: "Scheduled" },
    teams: {
      away: {
        team: { id: 144, name: "Atlanta Braves" },
        probablePitcher: { id: 1, fullName: "Away Arm" },
      },
      home: {
        team: { id: 121, name: "New York Mets" },
        probablePitcher: { id: 2, fullName: "Home Arm" },
      },
    },
    ...overrides,
  };
}

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

class FixtureClient implements MlbOfficialClient {
  requestCount = 0;

  constructor(
    private readonly games: MlbOfficialScheduleGame[],
    private readonly options: { throwSchedule?: boolean; onlyOnePitcher?: boolean } = {},
  ) {}

  async getSchedule(date: string) {
    this.requestCount += 1;
    if (this.options.throwSchedule) throw new Error("schedule failed");
    return this.games.filter((item) => item.gameDate?.slice(0, 10) === date);
  }

  async getPerson(playerId: string): Promise<MlbOfficialPerson | null> {
    this.requestCount += 1;
    if (this.options.onlyOnePitcher && playerId === "1") return null;
    return {
      id: Number(playerId),
      fullName: playerId === "1" ? "Away Arm" : "Home Arm",
      pitchHand: { code: playerId === "1" ? "L" : "R" },
    };
  }

  async getPitcherSeasonStats(_playerId: string) {
    this.requestCount += 1;
    return {
      gamesStarted: 10,
      inningsPitched: "61.2",
      era: "3.20",
      whip: "1.10",
      strikeOuts: 70,
      baseOnBalls: 20,
      battersFaced: 250,
    };
  }

  async getPitcherGameLog(_playerId: string) {
    this.requestCount += 1;
    return [
      {
        date: "2026-07-06",
        stat: {
          numberOfPitches: 91,
          gamesStarted: 1,
        },
        game: { gamePk: 90 },
      },
    ];
  }
}

async function main() {
  const exact = mapOddsEventToOfficialMlbGame({
    context: context(),
    officialGames: [game()],
  });
  assert.equal(exact.mapping.matched, true);
  assert.equal(exact.mapping.matchMethod, "TEAM_AND_TIME_EXACT");
  assert.equal(exact.mapping.officialGameId, "100");

  const alias = mapOddsEventToOfficialMlbGame({
    context: context({ homeTeam: "NY Mets" }),
    officialGames: [game()],
  });
  assert.equal(alias.mapping.matched, true);

  const tolerance = mapOddsEventToOfficialMlbGame({
    context: context({ commenceTime: "2026-07-11T00:00:00Z" }),
    officialGames: [game()],
  });
  assert.equal(tolerance.mapping.matchMethod, "TEAM_AND_TIME_TOLERANCE");

  const doubleHeaderGame1 = mapOddsEventToOfficialMlbGame({
    context: context({ commenceTime: "2026-07-10T17:10:00Z" }),
    officialGames: [
      game({ gamePk: 101, gameDate: "2026-07-10T17:10:00Z", doubleHeader: "Y", gameNumber: 1 }),
      game({ gamePk: 102, gameDate: "2026-07-10T23:10:00Z", doubleHeader: "Y", gameNumber: 2 }),
    ],
  });
  assert.equal(doubleHeaderGame1.mapping.officialGameId, "101");

  const doubleHeaderGame2 = mapOddsEventToOfficialMlbGame({
    context: context({ commenceTime: "2026-07-10T23:10:00Z" }),
    officialGames: [
      game({ gamePk: 101, gameDate: "2026-07-10T17:10:00Z", doubleHeader: "Y", gameNumber: 1 }),
      game({ gamePk: 102, gameDate: "2026-07-10T23:10:00Z", doubleHeader: "Y", gameNumber: 2 }),
    ],
  });
  assert.equal(doubleHeaderGame2.mapping.officialGameId, "102");

  const ambiguous = mapOddsEventToOfficialMlbGame({
    context: context(),
    officialGames: [
      game({ gamePk: 201 }),
      game({ gamePk: 202 }),
    ],
  });
  assert.equal(ambiguous.mapping.matched, false);

  const missing = mapOddsEventToOfficialMlbGame({
    context: context({ homeTeam: "Boston Red Sox" }),
    officialGames: [game()],
  });
  assert.equal(missing.mapping.matched, false);

  const adjacentDate = mapOddsEventToOfficialMlbGame({
    context: context({ commenceTime: "2026-07-11T23:10:00Z" }),
    officialGames: [
      game({ gamePk: 301, gameDate: "2026-07-10T23:10:00Z" }),
      game({ gamePk: 302, gameDate: "2026-07-11T23:10:00Z" }),
    ],
  });
  assert.equal(adjacentDate.mapping.officialGameId, "302");

  const stats = normalizePitcherSeasonStats({
    strikeOuts: 50,
    baseOnBalls: 10,
    battersFaced: 200,
    era: "3.50",
    whip: "1.20",
  });
  assert.equal(stats?.strikeoutRate, 0.25);
  assert.equal(stats?.walkRate, 0.05);

  const missingDenominator = normalizePitcherSeasonStats({
    strikeOuts: 50,
    baseOnBalls: 10,
  });
  assert.equal(missingDenominator?.strikeoutRate, undefined);
  assert.equal(missingDenominator?.walkRate, undefined);

  const reliefAppearance = normalizeStartingPitcher({
    probablePitcher: { id: 9, fullName: "Relief Recent" },
    person: { id: 9, fullName: "Relief Recent", pitchHand: { code: "R" } },
    status: "PROBABLE",
    sourceGameId: "100",
    sourceUpdatedAt: "2026-07-10T23:10:00Z",
    seasonStats: { strikeOuts: 10, baseOnBalls: 2, battersFaced: 50 },
    gameLog: [{ date: "2026-07-08", stat: { numberOfPitches: 22, gamesStarted: 0 } }],
    commenceTime: "2026-07-10T23:10:00Z",
  });
  assert.equal(reliefAppearance?.restDays, 2);
  assert.equal(reliefAppearance?.recentPitchCount, 22);
  assert.equal(reliefAppearance?.recentAppearanceWasStart, false);
  assert.match(reliefAppearance?.warnings.join(" ") ?? "", /relief/);

  const provider = new MlbOfficialPitcherProvider(new FixtureClient([game()]));
  const features = await provider.getStartingPitcherFeatures(context());
  assert.ok(
    features.metadata.availability === "PARTIAL" || features.metadata.availability === "STALE",
    `Expected PARTIAL or STALE pitcher availability, received ${features.metadata.availability}`,
  );
  assert.equal(features.homeStarter?.name, "Home Arm");
  assert.equal(features.homeStarter?.status, "PROBABLE");
  assert.equal(features.homeStarter?.confirmed, false);
  assert.equal(features.homeStarter?.throwingHand, "R");
  assert.equal(features.awayStarter?.throwingHand, "L");
  assert.equal(features.homeStarter?.restDays, 4);
  assert.equal(features.homeStarter?.recentPitchCount, 91);

  const onePitcherProvider = new MlbOfficialPitcherProvider(
    new FixtureClient([
      game({
        teams: {
          away: { team: { id: 144, name: "Atlanta Braves" } },
          home: {
            team: { id: 121, name: "New York Mets" },
            probablePitcher: { id: 2, fullName: "Home Arm" },
          },
        },
      }),
    ]),
  );
  const onePitcher = await onePitcherProvider.getStartingPitcherFeatures(context());
  assert.ok(
    onePitcher.metadata.availability === "PARTIAL" || onePitcher.metadata.availability === "STALE",
    `Expected PARTIAL or STALE one-pitcher availability, received ${onePitcher.metadata.availability}`,
  );
  assert.equal(onePitcher.awayStarter, undefined);

  const missingPitcherProvider = new MlbOfficialPitcherProvider(
    new FixtureClient([game({ teams: { home: { team: { id: 1, name: "New York Mets" } }, away: { team: { id: 2, name: "Atlanta Braves" } } } })]),
  );
  const missingPitcher = await missingPitcherProvider.getStartingPitcherFeatures(context());
  assert.ok(
    missingPitcher.metadata.availability === "UNAVAILABLE" || missingPitcher.metadata.availability === "STALE",
    `Expected UNAVAILABLE or STALE missing-pitcher availability, received ${missingPitcher.metadata.availability}`,
  );
  assert.equal(missingPitcher.homeStarter, undefined);

  const errorProvider = new MlbOfficialPitcherProvider(
    new FixtureClient([], { throwSchedule: true }),
  );
  const errorFeatures = await errorProvider.getStartingPitcherFeatures(context());
  assert.equal(errorFeatures.metadata.availability, "ERROR");

  const disabledClient = new FixtureClient([game()]);
  const disabledProvider = getMlbOfficialPitcherProviderWhenEnabled({
    sportsIntelligenceEnabled: false,
    pitcherModelEnabled: false,
  });
  await getMlbSportsIntelligenceFeatures(context(), disabledProvider);
  assert.equal(disabledClient.requestCount, 0);

  const projection = buildMlbSportsProjection(await getMlbSportsIntelligenceFeatures(context(), provider));
  assert.equal(projection.projectionAvailability, "UNAVAILABLE");
  assert.equal(projection.homeWinProbability, undefined);
  assert.equal(projection.projectedTotalRuns, undefined);

  const fs = await import("node:fs/promises");
  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(automationUtils.includes("mlb-official-pitcher-provider"), false);
  assert.equal(automationUtils.includes("getMlbOfficialPitcherProviderWhenEnabled"), false);

  const auditRoute = await fs.readFile("app/api/internal/mlb-engine-audit/route.ts", "utf8");
  assert.equal(auditRoute.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(auditRoute.includes("SPORTSDATAIO_API_KEY"), false);

  console.log("MLB pitcher provider validation passed");
}

main();
