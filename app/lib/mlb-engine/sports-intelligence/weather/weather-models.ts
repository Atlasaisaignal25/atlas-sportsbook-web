import type { WeatherParkFeatures } from "../types";
import type { MlbVenueRecord, MlbVenueOrientation } from "./venue-registry";
import type { NwsHourlyPeriod } from "./nws-client";
import { absoluteMinutesBetween, minutesBetween, normalizeWindDirection, parseWindSpeed, round } from "./weather-normalizer";

export const WEATHER_DELAY_RISK_VERSION = "weather_delay_risk_v1";
export const WEATHER_RUN_ENVIRONMENT_VERSION = "weather_run_environment_v1";
export const PARK_ENVIRONMENT_VERSION = "park_environment_v1";

export function roofContext(venue?: MlbVenueRecord, verified?: WeatherParkFeatures["roof"]) {
  if (verified?.verified) return verified;
  if (!venue) {
    return { roofType: "UNKNOWN" as const, roofStatus: "UNKNOWN" as const, statusSource: "UNKNOWN" as const, verified: false, warnings: ["Venue roof type unavailable."] };
  }
  if (venue.roofType === "DOME") return { roofType: venue.roofType, roofStatus: "CLOSED" as const, statusSource: "VENUE_DEFAULT" as const, verified: true, confidence: 100, warnings: [] };
  if (venue.roofType === "OPEN_AIR") return { roofType: venue.roofType, roofStatus: "OPEN" as const, statusSource: "VENUE_DEFAULT" as const, verified: true, confidence: 100, warnings: [] };
  if (venue.roofType === "RETRACTABLE") return { roofType: venue.roofType, roofStatus: "UNKNOWN" as const, statusSource: "UNKNOWN" as const, verified: false, confidence: 35, warnings: ["Retractable roof status unavailable from structured source."] };
  return { roofType: "UNKNOWN" as const, roofStatus: "UNKNOWN" as const, statusSource: "UNKNOWN" as const, verified: false, warnings: ["Unknown roof type."] };
}

export function matchForecastPeriod(periods: NwsHourlyPeriod[] | undefined, scheduledStartTime: string, maxDiffMinutes = 90) {
  const candidates = periods?.filter((period) => period.startTime) ?? [];
  const sorted = candidates
    .map((period) => ({ period, diff: absoluteMinutesBetween(period.startTime!, scheduledStartTime) }))
    .sort((a, b) => a.diff - b.diff);
  const selected = sorted[0];
  if (!selected || selected.diff > maxDiffMinutes) {
    return { warnings: [`No NWS hourly forecast within ${maxDiffMinutes} minutes of first pitch.`] };
  }
  return { period: selected.period, diffMinutes: selected.diff, warnings: [] as string[] };
}

export function normalizeForecast(period: NwsHourlyPeriod, generatedAt?: string, scheduledStartTime?: string) {
  const wind = parseWindSpeed(period.windSpeed);
  const direction = normalizeWindDirection(period.windDirection);
  const warnings = [...wind.warnings, ...direction.warnings];
  return {
    validTime: period.startTime ?? scheduledStartTime ?? new Date().toISOString(),
    generatedAt,
    temperatureF: period.temperatureUnit === "F" ? period.temperature : undefined,
    relativeHumidityPercent: typeof period.relativeHumidity?.value === "number" ? period.relativeHumidity.value : undefined,
    windSpeedMph: wind.windSpeedMph,
    windGustMph: wind.windGustMph,
    windDirectionDegrees: direction.windDirectionDegrees,
    windDirectionCardinal: direction.windDirectionCardinal,
    precipitationProbability: typeof period.probabilityOfPrecipitation?.value === "number" ? period.probabilityOfPrecipitation.value : undefined,
    shortForecast: period.shortForecast,
    source: "NWS_FORECAST" as const,
    warnings,
  };
}

export function relativeWind(input: {
  windSpeedMph?: number;
  windDirectionDegrees?: number;
  orientation?: MlbVenueOrientation;
}) {
  if ((input.windSpeedMph ?? 0) <= 3) return { classification: "CALM" as const, rawDirectionDegrees: input.windDirectionDegrees, stadiumBearingDegrees: input.orientation?.homePlateToCenterFieldBearingDegrees, confidence: 90 };
  const bearing = input.orientation?.homePlateToCenterFieldBearingDegrees;
  if (input.windDirectionDegrees === undefined || bearing === undefined || !input.orientation?.verified) {
    return { classification: "UNKNOWN" as const, rawDirectionDegrees: input.windDirectionDegrees, stadiumBearingDegrees: bearing, confidence: 20 };
  }
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const diff = toRadians(((input.windDirectionDegrees + 180 - bearing + 540) % 360) - 180);
  const out = round(Math.cos(diff) * (input.windSpeedMph ?? 0), 1) ?? 0;
  const cross = round(Math.abs(Math.sin(diff) * (input.windSpeedMph ?? 0)), 1) ?? 0;
  return {
    rawDirectionDegrees: input.windDirectionDegrees,
    stadiumBearingDegrees: bearing,
    componentOutToCenterMph: out > 0 ? out : 0,
    componentInFromCenterMph: out < 0 ? Math.abs(out) : 0,
    crosswindComponentMph: cross,
    classification: Math.abs(out) < 4 ? "CROSSWIND" as const : out > 0 ? "BLOWING_OUT" as const : "BLOWING_IN" as const,
    confidence: 80,
  };
}

export function delayRisk(input: {
  forecast?: WeatherParkFeatures["forecast"];
  roof: NonNullable<WeatherParkFeatures["roof"]>;
}) {
  if (!input.forecast) return { score: undefined, components: [], warnings: ["Delay risk unavailable without forecast."] };
  if (input.roof.roofStatus === "CLOSED") {
    return { score: 0, components: [{ component: "closedRoof", score: 0, weight: 1 }], warnings: [] as string[] };
  }
  const precip = input.forecast.precipitationProbability;
  const thunder = /thunder|t-?storm/i.test(input.forecast.shortForecast ?? "");
  const rain = /rain|showers|drizzle/i.test(input.forecast.shortForecast ?? "");
  const components = [
    { component: "precipitationProbability", value: precip, score: precip ?? 0, weight: 0.55 },
    { component: "thunderstormWording", score: thunder ? 90 : 0, weight: 0.3 },
    { component: "rainWording", score: rain ? 45 : 0, weight: 0.15 },
  ];
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  return {
    score: round(components.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight, 1),
    components,
    warnings: [] as string[],
  };
}

export function weatherRunEnvironment(input: {
  forecast?: WeatherParkFeatures["forecast"];
  roof: NonNullable<WeatherParkFeatures["roof"]>;
  relativeWind?: WeatherParkFeatures["relativeWind"];
}) {
  if (!input.forecast) return { score: undefined, direction: "UNKNOWN" as const, components: [], warnings: ["Weather run environment unavailable without forecast."] };
  if (input.roof.roofStatus === "CLOSED") {
    return { score: 50, direction: "NEUTRAL" as const, components: [{ component: "closedRoofNeutral", score: 50, weight: 1 }], warnings: [] as string[] };
  }
  const tempScore = input.forecast.temperatureF === undefined ? undefined : Math.max(0, Math.min(100, 50 + (input.forecast.temperatureF - 72) * 1.2));
  const humidityScore = input.forecast.relativeHumidityPercent === undefined ? undefined : Math.max(0, Math.min(100, 50 + (input.forecast.relativeHumidityPercent - 50) * 0.25));
  const windClass = input.relativeWind?.classification;
  const windScore = windClass === "BLOWING_OUT" ? 65 + (input.relativeWind?.componentOutToCenterMph ?? 0) : windClass === "BLOWING_IN" ? 35 - (input.relativeWind?.componentInFromCenterMph ?? 0) : windClass === "CROSSWIND" || windClass === "CALM" ? 50 : undefined;
  const precipScore = input.forecast.precipitationProbability === undefined ? undefined : Math.max(25, 50 - input.forecast.precipitationProbability * 0.2);
  const rawComponents: Array<{ component: string; value?: number; score?: number; weight: number }> = [
    { component: "temperature", value: input.forecast.temperatureF, score: tempScore, weight: 0.38 },
    { component: "humidity", value: input.forecast.relativeHumidityPercent, score: humidityScore, weight: 0.17 },
    { component: "relativeWind", value: input.forecast.windSpeedMph, score: windScore, weight: 0.3 },
    { component: "precipitationDrag", value: input.forecast.precipitationProbability, score: precipScore, weight: 0.15 },
  ];
  const components: Array<{ component: string; value?: number; score: number; weight: number }> = rawComponents
    .filter((item) => item.score !== undefined)
    .map((item) => ({ component: item.component, value: item.value, score: item.score ?? 0, weight: item.weight }));
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight < 0.45) return { score: undefined, direction: "UNKNOWN" as const, components, warnings: ["Insufficient weather context for run environment score."] };
  const score = round(components.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight, 1);
  return {
    score,
    direction: score === undefined ? "UNKNOWN" as const : score >= 57 ? "MORE_RUN_FRIENDLY" as const : score <= 43 ? "LESS_RUN_FRIENDLY" as const : "NEUTRAL" as const,
    components,
    warnings: [] as string[],
  };
}

export function forecastAgeMinutes(generatedAt?: string) {
  if (!generatedAt) return undefined;
  return Math.max(0, -minutesBetween(generatedAt, new Date().toISOString()));
}
