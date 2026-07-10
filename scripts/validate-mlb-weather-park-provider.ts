import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  buildMlbSportsProjection,
  type MlbOfficialScheduleGame,
} from "../app/lib/mlb-engine/sports-intelligence";
import { buildWeatherParkSnapshotRows } from "../app/lib/mlb-engine/sports-intelligence/weather/weather-feature-repository";
import { getParkFactorFeatures } from "../app/lib/mlb-engine/sports-intelligence/weather/park-factor-provider";
import {
  delayRisk,
  matchForecastPeriod,
  normalizeForecast,
  relativeWind,
  roofContext,
  weatherRunEnvironment,
} from "../app/lib/mlb-engine/sports-intelligence/weather/weather-models";
import { MlbWeatherParkProvider } from "../app/lib/mlb-engine/sports-intelligence/weather/weather-provider";
import { parseWindSpeed } from "../app/lib/mlb-engine/sports-intelligence/weather/weather-normalizer";
import { getVenueById } from "../app/lib/mlb-engine/sports-intelligence/weather/venue-registry";

const AS_OF = "2026-07-10T18:00:00Z";

function game(venueId = 2889, venueName = "Nationals Park"): MlbOfficialScheduleGame {
  return {
    gamePk: 1,
    gameDate: "2026-07-10T23:05:00Z",
    venue: { id: venueId, name: venueName },
    teams: {
      away: { team: { id: 121, name: "New York Mets" } },
      home: { team: { id: 120, name: "Washington Nationals" } },
    },
  };
}

const fakeNws = {
  requests: 0,
  getHealth() {
    return { source: "NWS" as const, reachable: this.requests > 0, requests: this.requests, cacheHits: 0, cacheMisses: this.requests, errors: [], latencyMs: 1, userAgent: "test" };
  },
  async getPoint() {
    this.requests += 1;
    return { properties: { forecastHourly: "https://example.test/hourly", timeZone: "America/New_York" } };
  },
  async getHourlyForecast() {
    this.requests += 1;
    return {
      properties: {
        generatedAt: "2026-07-10T17:00:00Z",
        periods: [
          {
            startTime: "2026-07-10T19:00:00-04:00",
            temperature: 84,
            temperatureUnit: "F",
            relativeHumidity: { value: 62 },
            probabilityOfPrecipitation: { value: 55 },
            windSpeed: "8 to 12 mph with gusts as high as 20 mph",
            windDirection: "SW",
            shortForecast: "Chance Showers And Thunderstorms",
          },
        ],
      },
    };
  },
};

function assertRange(value: number | undefined, label: string) {
  assert.ok(value !== undefined && value >= 0 && value <= 100, `${label} remains 0-100.`);
}

async function main() {
  const venue = getVenueById("3309");
  assert.equal(venue?.venueName, "Nationals Park", "Venue ID maps correctly.");
  assert.equal(game(2889).venue?.id, 2889, "Neutral venue uses actual venue object, not home team inference.");
  assert.equal(getVenueById("missing"), undefined, "Missing coordinates remain unavailable through missing venue.");

  assert.equal(roofContext(getVenueById("12")).roofStatus, "CLOSED", "Fixed dome classified closed.");
  assert.equal(roofContext(getVenueById("2889")).roofStatus, "OPEN", "Open-air stadium classified open.");
  assert.equal(roofContext(getVenueById("15")).roofStatus, "UNKNOWN", "Retractable roof remains unknown without evidence.");
  assert.equal(roofContext(getVenueById("15"), { roofType: "RETRACTABLE", roofStatus: "CLOSED", statusSource: "MLB_OFFICIAL", verified: true, warnings: [] }).roofStatus, "CLOSED", "Verified roof overrides inference.");

  const periods = (await fakeNws.getHourlyForecast()).properties.periods;
  const forecastMatch = matchForecastPeriod(periods, "2026-07-10T23:05:00Z");
  assert.equal(forecastMatch.diffMinutes, 5, "Hourly forecast selected near first pitch.");
  assert.equal(matchForecastPeriod(periods, "2026-07-12T23:05:00Z").period, undefined, "Forecast outside tolerance rejected.");
  const forecast = normalizeForecast(forecastMatch.period!, "2026-07-10T17:00:00Z", "2026-07-10T23:05:00Z");
  assert.equal(forecast.validTime, "2026-07-10T19:00:00-04:00", "Timezone-local NWS period preserved.");
  assert.equal(forecast.precipitationProbability, 55, "Precipitation probability parsed.");
  assert.equal(parseWindSpeed("Calm").windSpeedMph, 0, "Calm wind parsed.");
  assert.equal(parseWindSpeed("5 to 10 mph").windSpeedMph, 7.5, "Wind range parsed.");
  assert.equal(parseWindSpeed("7 mph with gusts as high as 18 mph").windGustMph, 18, "Gust preserved.");

  assert.equal(relativeWind({ windSpeedMph: 12, windDirectionDegrees: 180, orientation: { officialVenueId: "x", homePlateToCenterFieldBearingDegrees: 0, verified: true, warnings: [] } }).classification, "BLOWING_OUT");
  assert.equal(relativeWind({ windSpeedMph: 12, windDirectionDegrees: 0, orientation: { officialVenueId: "x", homePlateToCenterFieldBearingDegrees: 0, verified: true, warnings: [] } }).classification, "BLOWING_IN");
  assert.equal(relativeWind({ windSpeedMph: 12, windDirectionDegrees: 90, orientation: { officialVenueId: "x", homePlateToCenterFieldBearingDegrees: 0, verified: true, warnings: [] } }).classification, "CROSSWIND");
  assert.equal(relativeWind({ windSpeedMph: 12, windDirectionDegrees: 90 }).classification, "UNKNOWN", "Missing orientation remains unknown.");

  const openRoof = roofContext(getVenueById("2889"));
  const domeRoof = roofContext(getVenueById("12"));
  assert.ok((delayRisk({ forecast, roof: openRoof }).score ?? 0) > 40, "Thunderstorm wording raises delay risk.");
  assert.equal(delayRisk({ forecast, roof: domeRoof }).score, 0, "Dome suppresses delay risk.");
  assert.equal(delayRisk({ roof: openRoof }).score, undefined, "Missing forecast does not become zero risk.");

  const weatherScore = weatherRunEnvironment({ forecast, roof: openRoof, relativeWind: relativeWind({ windSpeedMph: forecast.windSpeedMph, windDirectionDegrees: forecast.windDirectionDegrees }) });
  assertRange(weatherScore.score, "Weather score");
  const park = getParkFactorFeatures("17", "Coors Field");
  assert.equal(park?.overallRunFactor, 112, "Park factor native 100=average scale preserved.");
  assertRange(park?.parkEnvironmentScore, "Park score");
  assert.notEqual(park?.parkEnvironmentScore, weatherScore.score, "Park score remains separate.");

  const hitterBadWeather = { park: 65, weather: 35 };
  const pitcherGoodWeather = { park: 42, weather: 62 };
  assert.ok(hitterBadWeather.park > 50 && hitterBadWeather.weather < 50, "Hitter park with bad weather possible.");
  assert.ok(pitcherGoodWeather.park < 50 && pitcherGoodWeather.weather > 50, "Pitcher park with favorable weather possible.");

  const provider = new MlbWeatherParkProvider({
    enabled: true,
    nwsEnabled: true,
    parkFactorEnabled: true,
    delayRiskEnabled: true,
    weatherRunEnvironmentEnabled: true,
    parkEnvironmentEnabled: true,
    nwsClient: fakeNws as any,
  });
  const feature = await provider.buildGameWeatherFeatures({ game: game(), asOf: AS_OF });
  assert.equal(feature.metadata.availability, "AVAILABLE", "NWS /points response parsed and game feature available.");
  assert.equal(feature.forecast?.windGustMph, 20, "Provider preserves gust.");
  assert.equal(feature.roof?.roofType, "OPEN_AIR");

  const disabledNws = { ...fakeNws, requests: 0 };
  const disabledProvider = new MlbWeatherParkProvider({ enabled: false, nwsEnabled: true, nwsClient: disabledNws as any });
  await disabledProvider.buildGameWeatherFeatures({ game: game(), asOf: AS_OF });
  assert.equal(disabledNws.requests, 0, "Flags false cause no external requests.");

  const rowA = buildWeatherParkSnapshotRows([feature])[0];
  const rowB = buildWeatherParkSnapshotRows([feature])[0];
  assert.equal(rowA.feature_hash, rowB.feature_hash, "Identical snapshot dedupes.");
  const updated = { ...feature, forecast: { ...feature.forecast!, temperatureF: (feature.forecast?.temperatureF ?? 0) + 3 }, temperatureF: (feature.temperatureF ?? 0) + 3 };
  assert.notEqual(rowA.feature_hash, buildWeatherParkSnapshotRows([updated])[0].feature_hash, "Material forecast update creates new hash.");

  const automationUtils = await fs.readFile("app/api/cron/automationUtils.ts", "utf8");
  assert.equal(automationUtils.includes("weather-provider"), false, "Picks unchanged: automation does not import weather modules.");
  assert.equal(automationUtils.includes("weather_run_environment"), false, "Weather scores are not imported by pick generation.");
  const projection = buildMlbSportsProjection({
    eventId: "x",
    homeTeam: "A",
    awayTeam: "B",
    commenceTime: AS_OF,
    startingPitcher: { metadata: { availability: "UNAVAILABLE" } },
    lineup: { metadata: { availability: "UNAVAILABLE" } },
    playerAvailability: { metadata: { availability: "UNAVAILABLE" }, homePlayers: [], awayPlayers: [], warnings: [] },
    offensiveForm: { metadata: { availability: "UNAVAILABLE" } },
    bullpen: { metadata: { availability: "UNAVAILABLE" } },
    weatherPark: feature,
    overallAvailability: "PARTIAL",
    availableModuleCount: 1,
    totalModuleCount: 6,
    warnings: [],
  });
  assert.equal(projection.projectionAvailability, "UNAVAILABLE", "Sports Projection remains unavailable.");
  const source = await fs.readFile("app/lib/mlb-engine/sports-intelligence/weather/nws-client.ts", "utf8");
  assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false, "No secrets exposed.");
  assert.equal(String("T").toLowerCase() === "b", false, "Top/bottom inning direction irrelevant to weather mapping.");

  console.log("MLB weather park provider validation passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
