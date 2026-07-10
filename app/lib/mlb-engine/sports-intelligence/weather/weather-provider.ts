import { mapOddsEventToOfficialMlbGame, type MlbOfficialScheduleGame } from "../mlb-game-mapper";
import type { MlbGameContext, WeatherParkFeatures } from "../types";
import { cachedMlbOfficialClient, type MlbOfficialClient } from "../providers/mlb-official-client";
import { cachedNwsClient, type NwsClient } from "./nws-client";
import { getParkFactorFeatures } from "./park-factor-provider";
import { getVenueById, getVenueOrientation, venueRegistryHealth } from "./venue-registry";
import {
  delayRisk,
  forecastAgeMinutes,
  matchForecastPeriod,
  normalizeForecast,
  relativeWind,
  roofContext,
  WEATHER_DELAY_RISK_VERSION,
  WEATHER_RUN_ENVIRONMENT_VERSION,
  weatherRunEnvironment,
} from "./weather-models";
import { localIso } from "./weather-normalizer";

export type MlbWeatherProviderHealth = {
  source: "NWS_MLB_OFFICIAL";
  gamesInspected: number;
  gamesMapped: number;
  venuesResolved: number;
  forecastsAvailable: number;
  forecastsUnavailable: number;
  roofVerified: number;
  roofInferred: number;
  delayRiskScored: number;
  weatherEnvironmentScored: number;
  parkEnvironmentScored: number;
  errors: string[];
  nws: ReturnType<NwsClient["getHealth"]>;
  venueRegistry: ReturnType<typeof venueRegistryHealth>;
};

function dateKey(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function adjacentDateKeys(value: string) {
  const date = new Date(`${dateKey(value)}T12:00:00Z`);
  return [-1, 0, 1].map((offset) => {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + offset);
    return copy.toISOString().slice(0, 10);
  });
}

export class MlbWeatherParkProvider {
  name = "MlbWeatherParkProvider";
  private errors: string[] = [];
  private counters = {
    gamesInspected: 0,
    gamesMapped: 0,
    venuesResolved: 0,
    forecastsAvailable: 0,
    forecastsUnavailable: 0,
    roofVerified: 0,
    roofInferred: 0,
    delayRiskScored: 0,
    weatherEnvironmentScored: 0,
    parkEnvironmentScored: 0,
  };

  constructor(private readonly options: {
    enabled: boolean;
    nwsEnabled?: boolean;
    parkFactorEnabled?: boolean;
    delayRiskEnabled?: boolean;
    weatherRunEnvironmentEnabled?: boolean;
    parkEnvironmentEnabled?: boolean;
    officialClient?: MlbOfficialClient;
    nwsClient?: NwsClient;
  }) {}

  getHealth(): MlbWeatherProviderHealth {
    return {
      source: "NWS_MLB_OFFICIAL",
      ...this.counters,
      errors: this.errors,
      nws: (this.options.nwsClient ?? cachedNwsClient).getHealth(),
      venueRegistry: venueRegistryHealth(),
    };
  }

  private async resolveOfficialGame(context: MlbGameContext) {
    const officialClient = this.options.officialClient ?? cachedMlbOfficialClient;
    const games = (await Promise.all(adjacentDateKeys(context.commenceTime).map((date) => officialClient.getSchedule(date)))).flat();
    return mapOddsEventToOfficialMlbGame({ context, officialGames: games });
  }

  async buildGameWeatherFeatures(input: {
    context?: MlbGameContext;
    game?: MlbOfficialScheduleGame;
    asOf?: string;
  }): Promise<WeatherParkFeatures> {
    if (!this.options.enabled) {
      return { metadata: { availability: "UNAVAILABLE", source: "UNKNOWN", warnings: ["Weather model disabled."] } };
    }
    const now = input.asOf ?? new Date().toISOString();
    let game = input.game;
    let mappingWarnings: string[] = [];
    let oddsEventId = input.context?.eventId;
    if (!game && input.context) {
      const resolved = await this.resolveOfficialGame(input.context);
      game = resolved.game;
      mappingWarnings = resolved.mapping.warnings;
      oddsEventId = resolved.mapping.oddsEventId;
      if (resolved.mapping.matched) this.counters.gamesMapped += 1;
    }
    this.counters.gamesInspected += 1;
    if (!game?.gamePk || !game.gameDate) {
      return { metadata: { availability: "UNAVAILABLE", source: "MLB_OFFICIAL", observedAt: now, warnings: ["Official MLB game not resolved.", ...mappingWarnings] } };
    }
    const officialVenueId = game.venue?.id ? String(game.venue.id) : undefined;
    const venue = getVenueById(officialVenueId);
    const venueName = game.venue?.name ?? venue?.venueName;
    const roof = roofContext(venue);
    if (roof.verified) this.counters.roofVerified += 1;
    else this.counters.roofInferred += 1;
    const warnings = [...mappingWarnings, ...(venue?.warnings ?? []), ...roof.warnings];
    if (venue) this.counters.venuesResolved += 1;

    let forecast: WeatherParkFeatures["forecast"];
    let forecastLeadMinutes: number | undefined;
    if (this.options.nwsEnabled && venue?.latitude !== undefined && venue.longitude !== undefined && !venue.warnings.some((warning) => warning.includes("NWS does not cover"))) {
      try {
        const nws = this.options.nwsClient ?? cachedNwsClient;
        const point = await nws.getPoint(venue.latitude, venue.longitude);
        const hourlyUrl = point.properties?.forecastHourly;
        if (!hourlyUrl) throw new Error("NWS point response did not include forecastHourly.");
        const hourly = await nws.getHourlyForecast(hourlyUrl);
        const matched = matchForecastPeriod(hourly.properties?.periods, game.gameDate);
        warnings.push(...matched.warnings);
        if (matched.period) {
          forecast = normalizeForecast(matched.period, hourly.properties?.generatedAt ?? hourly.properties?.updated, game.gameDate);
          forecastLeadMinutes = matched.diffMinutes;
          this.counters.forecastsAvailable += 1;
        } else {
          this.counters.forecastsUnavailable += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown NWS provider error";
        this.errors.push(message);
        warnings.push(message);
        this.counters.forecastsUnavailable += 1;
      }
    } else {
      this.counters.forecastsUnavailable += 1;
      warnings.push(!this.options.nwsEnabled ? "NWS provider disabled." : "Venue coordinates unavailable or outside NWS coverage.");
    }

    const relWind = relativeWind({
      windSpeedMph: forecast?.windSpeedMph,
      windDirectionDegrees: forecast?.windDirectionDegrees,
      orientation: getVenueOrientation(officialVenueId),
    });
    const delay = this.options.delayRiskEnabled ? delayRisk({ forecast, roof }) : { score: undefined, components: [], warnings: ["Delay risk disabled."] };
    const runEnvironment = this.options.weatherRunEnvironmentEnabled ? weatherRunEnvironment({ forecast, roof, relativeWind: relWind }) : { score: undefined, direction: "UNKNOWN" as const, components: [], warnings: ["Weather environment disabled."] };
    const parkFactor = this.options.parkFactorEnabled ? getParkFactorFeatures(officialVenueId, venueName) : undefined;
    if (delay.score !== undefined) this.counters.delayRiskScored += 1;
    if (runEnvironment.score !== undefined) this.counters.weatherEnvironmentScored += 1;
    if (parkFactor?.parkEnvironmentScore !== undefined) this.counters.parkEnvironmentScored += 1;
    warnings.push(...delay.warnings, ...runEnvironment.warnings, ...(parkFactor?.warnings ?? []));
    const availability = forecast || parkFactor ? "AVAILABLE" : venue ? "PARTIAL" : "UNAVAILABLE";

    return {
      officialGameId: String(game.gamePk),
      venueId: officialVenueId,
      venueName,
      scheduledStartTime: game.gameDate,
      localStartTime: localIso(game.gameDate, venue?.timezone),
      roofType: roof.roofType,
      roofStatus: roof.roofStatus,
      roof,
      forecast,
      relativeWind: relWind,
      forecastLeadMinutes,
      forecastAgeMinutes: forecastAgeMinutes(forecast?.generatedAt),
      temperatureF: forecast?.temperatureF,
      humidityPercent: forecast?.relativeHumidityPercent,
      windSpeedMph: forecast?.windSpeedMph,
      windGustMph: forecast?.windGustMph,
      windDirectionDegrees: forecast?.windDirectionDegrees,
      windDirection: forecast?.windDirectionCardinal,
      precipitationProbability: forecast?.precipitationProbability,
      delayRisk: delay.score,
      delayRiskVersion: delay.score !== undefined ? WEATHER_DELAY_RISK_VERSION : undefined,
      delayRiskComponents: delay.components,
      runEnvironmentScore: runEnvironment.score,
      weatherRunEnvironmentVersion: runEnvironment.score !== undefined ? WEATHER_RUN_ENVIRONMENT_VERSION : undefined,
      weatherRunComponents: runEnvironment.components,
      weatherDirection: runEnvironment.direction,
      parkFactor: parkFactor?.overallRunFactor,
      parkFactorFeatures: parkFactor,
      parkEnvironmentScore: parkFactor?.parkEnvironmentScore,
      parkEnvironmentVersion: parkFactor?.scoreVersion,
      metadata: {
        availability,
        source: forecast ? "NWS" : parkFactor ? "ATLAS_DERIVED" : "MLB_OFFICIAL",
        observedAt: now,
        updatedAt: forecast?.generatedAt ?? parkFactor?.sourceUpdatedAt,
        confidence: availability === "AVAILABLE" ? 80 : availability === "PARTIAL" ? 55 : undefined,
        warnings,
      },
      warnings,
    };
  }

  async getWeatherParkFeatures(context: MlbGameContext) {
    return this.buildGameWeatherFeatures({ context });
  }
}

