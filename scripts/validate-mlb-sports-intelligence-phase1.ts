import assert from "node:assert/strict";
import {
  buildMlbSportsProjection,
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

  process.env.MLB_SPORTS_INTELLIGENCE_ENABLED = "false";
  process.env.MLB_PITCHER_MODEL_ENABLED = "false";
  process.env.MLB_LINEUP_MODEL_ENABLED = "false";
  process.env.MLB_OFFENSIVE_FORM_MODEL_ENABLED = "false";
  process.env.MLB_BULLPEN_MODEL_ENABLED = "false";
  process.env.MLB_WEATHER_MODEL_ENABLED = "false";
  const flags = getMlbSportsIntelligenceFlags();
  assert.deepEqual(flags, {
    sportsIntelligenceEnabled: false,
    pitcherModelEnabled: false,
    lineupModelEnabled: false,
    offensiveFormModelEnabled: false,
    bullpenModelEnabled: false,
    weatherModelEnabled: false,
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
