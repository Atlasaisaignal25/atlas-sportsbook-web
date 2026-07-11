import assert from "node:assert/strict";
import {
  buildMlbSportsProjection,
  buildOffensiveFormFeatures,
  buildStatcastLeagueBaseline,
  getMlbSportsIntelligenceFeatures,
  getMlbSportsIntelligenceFlags,
  unavailableMlbSportsIntelligenceProvider,
  type BullpenFeatures,
  type DataAvailability,
  type FeatureSource,
  type LineupStrengthFeatures,
  type MlbGameContext,
  type MlbSportsIntelligenceProvider,
  type OffensiveFormFeatures,
  type StartingPitcherFeatures,
  type WeatherParkFeatures,
} from "../app/lib/mlb-engine/sports-intelligence";

const context: MlbGameContext = {
  eventId: "odds-api-game-1",
  homeTeam: "New York Mets",
  awayTeam: "Atlanta Braves",
  commenceTime: "2026-07-10T23:10:00Z",
  currentTime: "2026-07-10T12:00:00Z",
  marketKeys: ["h2h", "spreads", "totals"],
};

class OneAvailableProvider implements MlbSportsIntelligenceProvider {
  name = "OneAvailableProvider";

  async getStartingPitcherFeatures(): Promise<StartingPitcherFeatures> {
    return {
      metadata: {
        availability: "AVAILABLE",
        source: "ATLAS_DERIVED",
        confidence: 80,
      },
      homeStarter: {
        name: "Verified Starter",
        confirmed: true,
      },
      matchupAdvantage: "HOME",
    };
  }

  async getLineupStrengthFeatures(): Promise<LineupStrengthFeatures> {
    return { metadata: { availability: "UNAVAILABLE", source: "UNKNOWN" } };
  }

  async getOffensiveFormFeatures(): Promise<OffensiveFormFeatures> {
    return { metadata: { availability: "UNAVAILABLE", source: "UNKNOWN" } };
  }

  async getBullpenFeatures(): Promise<BullpenFeatures> {
    return { metadata: { availability: "UNAVAILABLE", source: "UNKNOWN" } };
  }

  async getWeatherParkFeatures(): Promise<WeatherParkFeatures> {
    return { metadata: { availability: "UNAVAILABLE", source: "UNKNOWN" } };
  }
}

class ThrowingProvider extends OneAvailableProvider {
  name = "ThrowingProvider";

  async getLineupStrengthFeatures(): Promise<LineupStrengthFeatures> {
    throw new Error("lineup source unavailable");
  }
}

async function main() {
  const unavailable = await getMlbSportsIntelligenceFeatures(
    context,
    unavailableMlbSportsIntelligenceProvider,
  );
  assert.equal(unavailable.overallAvailability, "UNAVAILABLE");
  assert.equal(unavailable.availableModuleCount, 0);
  assert.equal(unavailable.totalModuleCount, 6);
  assert.equal(unavailable.playerAvailability.metadata.availability, "UNAVAILABLE");
  assert.equal(unavailable.startingPitcher.homeStarter, undefined);
  assert.equal(unavailable.weatherPark.temperatureF, undefined);

  const oneAvailable = await getMlbSportsIntelligenceFeatures(context, new OneAvailableProvider());
  assert.equal(oneAvailable.overallAvailability, "PARTIAL");
  assert.equal(oneAvailable.availableModuleCount, 1);
  assert.equal(oneAvailable.startingPitcher.homeStarter?.name, "Verified Starter");
  assert.equal(oneAvailable.lineup.homeLineupStrength, undefined);
  assert.notEqual(oneAvailable.lineup.homeLineupStrength, 0);

  const throwing = await getMlbSportsIntelligenceFeatures(context, new ThrowingProvider());
  assert.equal(throwing.overallAvailability, "PARTIAL");
  assert.equal(throwing.lineup.metadata.availability, "ERROR");
  assert.match(throwing.lineup.metadata.warnings?.[0] ?? "", /lineup source unavailable/);

  const projection = buildMlbSportsProjection(oneAvailable);
  assert.equal(projection.projectionAvailability, "UNAVAILABLE");
  assert.equal(projection.homeWinProbability, undefined);
  assert.equal(projection.awayWinProbability, undefined);
  assert.equal(projection.projectedTotalRuns, undefined);

  const homeOffense = {
      teamId: "116",
      teamName: "Detroit Tigers",
      asOf: "2026-07-10T18:00:00Z",
      source: "MLB_OFFICIAL",
      windows: {
        last7: {
          games: 7,
          hardHitRate: 44,
          barrelRate: 9,
          exitVelocity: 89.5,
          walkRate: 9.5,
          strikeoutRate: 20,
          expectedBAOnContact: 0.265,
          expectedSLGOnContact: 0.455,
          expectedWOBAOnContact: 0.345,
        },
        last14: {
          games: 14,
          hardHitRate: 41,
          barrelRate: 8,
          exitVelocity: 88.7,
          walkRate: 8.2,
          strikeoutRate: 22,
          expectedBAOnContact: 0.252,
          expectedSLGOnContact: 0.425,
          expectedWOBAOnContact: 0.328,
        },
        last30: {
          games: 30,
          hardHitRate: 39,
          barrelRate: 7,
          exitVelocity: 88.1,
          walkRate: 7.6,
          strikeoutRate: 23.5,
          expectedBAOnContact: 0.244,
          expectedSLGOnContact: 0.405,
          expectedWOBAOnContact: 0.318,
        },
      },
    } as const;
  const awayOffense = {
      teamId: "143",
      teamName: "Philadelphia Phillies",
      asOf: "2026-07-10T18:00:00Z",
      source: "MLB_OFFICIAL",
      windows: {
        last7: {
          games: 7,
          hardHitRate: 36,
          barrelRate: 5.5,
          exitVelocity: 87.2,
          walkRate: 6,
          strikeoutRate: 26,
          expectedBAOnContact: 0.229,
          expectedSLGOnContact: 0.37,
          expectedWOBAOnContact: 0.295,
        },
      },
    } as const;
  const offensive = buildOffensiveFormFeatures({
    observedAt: "2026-07-10T18:00:00Z",
    home: homeOffense,
    away: awayOffense,
    baseline: buildStatcastLeagueBaseline({
      teamWindows: [homeOffense, awayOffense],
      asOf: "2026-07-10T18:00:00Z",
    }),
    scoringEnabled: true,
  });
  assert.equal(offensive.metadata.availability, "AVAILABLE");
  assert.equal(typeof offensive.home?.atlasOffensiveScore, "number");
  assert.equal(typeof offensive.home?.rollingWindows.last7?.score, "number");
  assert.equal(offensive.home?.componentBreakdown.length, 8);
  assert.equal(offensive.formAdvantage, "HOME");

  process.env.MLB_SPORTS_INTELLIGENCE_ENABLED = "false";
  process.env.MLB_PITCHER_MODEL_ENABLED = "false";
  process.env.MLB_LINEUP_MODEL_ENABLED = "false";
  process.env.MLB_OFFENSIVE_FORM_MODEL_ENABLED = "false";
  process.env.MLB_STATCAST_PROVIDER_ENABLED = "false";
  process.env.MLB_OFFENSIVE_SCORE_ENABLED = "false";
  process.env.MLB_OFFENSIVE_SCORE_MODE = "DISABLED";
  process.env.MLB_BULLPEN_MODEL_ENABLED = "false";
  process.env.MLB_BULLPEN_PROVIDER_ENABLED = "false";
  process.env.MLB_BULLPEN_FATIGUE_SCORE_ENABLED = "false";
  process.env.MLB_BULLPEN_SCORE_MODE = "DISABLED";
  process.env.MLB_BULLPEN_FATIGUE_VERSION = "v1";
  process.env.MLB_BULLPEN_QUALITY_SCORE_ENABLED = "false";
  process.env.MLB_BULLPEN_QUALITY_SCORE_MODE = "DISABLED";
  process.env.MLB_BULLPEN_QUALITY_VERSION = "v1";
  process.env.MLB_BULLPEN_SEASON_ARCHIVE_ENABLED = "false";
  process.env.MLB_BULLPEN_QUALITY_BASELINE_ENABLED = "false";
  process.env.MLB_WEATHER_MODEL_ENABLED = "false";
  process.env.MLB_NWS_PROVIDER_ENABLED = "false";
  process.env.MLB_PARK_FACTOR_MODEL_ENABLED = "false";
  process.env.MLB_WEATHER_DELAY_RISK_ENABLED = "false";
  process.env.MLB_WEATHER_RUN_ENVIRONMENT_ENABLED = "false";
  process.env.MLB_PARK_ENVIRONMENT_SCORE_ENABLED = "false";
  process.env.MLB_WEATHER_SCORE_MODE = "DISABLED";
  process.env.MLB_TEAM_STRENGTH_ENABLED = "false";
  process.env.MLB_TEAM_STRENGTH_SCORE_MODE = "DISABLED";
  process.env.MLB_TEAM_QUALITY_ENABLED = "false";
  process.env.MLB_GAME_READINESS_ENABLED = "false";
  process.env.MLB_CONTEXT_CERTAINTY_ENABLED = "false";
  process.env.MLB_TEAM_INTELLIGENCE_MODE = "DISABLED";
  process.env.MLB_PITCHER_QUALITY_ENABLED = "false";
  process.env.MLB_PITCHER_READINESS_ENABLED = "false";
  process.env.MLB_PITCHER_QUALITY_MODE = "DISABLED";
  const flags = getMlbSportsIntelligenceFlags();
  assert.deepEqual(flags, {
    sportsIntelligenceEnabled: false,
    pitcherModelEnabled: false,
    lineupModelEnabled: false,
    offensiveFormModelEnabled: false,
    statcastProviderEnabled: false,
    offensiveScoreEnabled: false,
    offensiveScoreMode: "DISABLED",
    bullpenModelEnabled: false,
    bullpenProviderEnabled: false,
    bullpenFatigueScoreEnabled: false,
    bullpenScoreMode: "DISABLED",
    bullpenFatigueVersion: "v1",
    bullpenQualityScoreEnabled: false,
    bullpenQualityScoreMode: "DISABLED",
    bullpenQualityVersion: "v1",
    bullpenSeasonArchiveEnabled: false,
    bullpenQualityBaselineEnabled: false,
    weatherModelEnabled: false,
    nwsProviderEnabled: false,
    parkFactorModelEnabled: false,
    weatherDelayRiskEnabled: false,
    weatherRunEnvironmentEnabled: false,
    parkEnvironmentScoreEnabled: false,
    weatherScoreMode: "DISABLED",
    teamStrengthEnabled: false,
    teamStrengthScoreMode: "DISABLED",
    teamQualityEnabled: false,
    gameReadinessEnabled: false,
    contextCertaintyEnabled: false,
    teamIntelligenceMode: "DISABLED",
    pitcherQualityEnabled: false,
    pitcherReadinessEnabled: false,
    pitcherQualityMode: "DISABLED",
    lineupSnapshotsEnabled: false,
    lineupChangeDetectionEnabled: false,
    starterVerificationSnapshotsEnabled: false,
  });

  const fs = await import("node:fs/promises");
  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(
    automationUtils.includes("sports-intelligence"),
    false,
    "Phase 1 must not connect Sports Intelligence to scoring or ranking.",
  );
  assert.equal(
    automationUtils.includes("offensive-form-engine"),
    false,
    "Offensive Form Engine must not connect to scoring or ranking in Phase 5.",
  );
  assert.equal(
    automationUtils.includes("MLB_SPORTS_INTELLIGENCE_ENABLED"),
    false,
    "Feature flags must not alter public signal generation in Phase 1.",
  );

  const auditRoute = await fs.readFile("app/api/internal/mlb-engine-audit/route.ts", "utf8");
  assert.equal(auditRoute.includes("process.env.CRON_SECRET"), true);
  assert.equal(auditRoute.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(auditRoute.includes("ODDS_API_KEY"), false);

  const envExample = await fs.readFile(".env.example", "utf8");
  assert.equal(envExample.includes("MLB_SPORTS_INTELLIGENCE_ENABLED=false"), true);
  assert.equal(envExample.includes("MLB_PITCHER_MODEL_ENABLED=false"), true);
}

// @ts-expect-error Invalid availability values must fail static TypeScript checks.
const invalidAvailability: DataAvailability = "MISSING";
// @ts-expect-error Invalid provider names must fail static TypeScript checks.
const invalidSource: FeatureSource = "SCRAPED_WEB";
void invalidAvailability;
void invalidSource;

main().then(() => {
  console.log("MLB Sports Intelligence Phase 1 validation passed");
});
