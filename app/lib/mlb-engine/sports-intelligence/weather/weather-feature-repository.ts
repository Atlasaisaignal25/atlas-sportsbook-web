import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type { WeatherParkFeatures } from "../types";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function featureHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

export function buildWeatherParkSnapshotRows(features: WeatherParkFeatures[], oddsEventIds = new Map<string, string | undefined>()) {
  return features
    .filter((feature) => feature.officialGameId && feature.scheduledStartTime)
    .map((feature) => {
      const payload = {
        officialGameId: feature.officialGameId,
        venueId: feature.venueId,
        scheduledStartTime: feature.scheduledStartTime,
        roof: feature.roof,
        forecast: feature.forecast,
        relativeWind: feature.relativeWind,
        delayRisk: feature.delayRisk,
        delayRiskVersion: feature.delayRiskVersion,
        weatherRunEnvironmentScore: feature.runEnvironmentScore,
        weatherRunEnvironmentVersion: feature.weatherRunEnvironmentVersion,
        parkEnvironmentScore: feature.parkEnvironmentScore,
        parkEnvironmentVersion: feature.parkEnvironmentVersion,
      };
      return {
        official_game_id: feature.officialGameId!,
        odds_event_id: oddsEventIds.get(feature.officialGameId!),
        official_venue_id: feature.venueId,
        venue_name: feature.venueName,
        scheduled_start_time: feature.scheduledStartTime!,
        roof_type: feature.roof?.roofType,
        roof_status: feature.roof?.roofStatus,
        roof_verified: feature.roof?.verified,
        forecast_valid_time: feature.forecast?.validTime,
        forecast_generated_at: feature.forecast?.generatedAt,
        temperature_f: feature.temperatureF,
        humidity_percent: feature.humidityPercent,
        wind_speed_mph: feature.windSpeedMph,
        wind_gust_mph: feature.windGustMph,
        wind_direction_degrees: feature.windDirectionDegrees,
        wind_direction_cardinal: feature.windDirection,
        relative_wind: feature.relativeWind,
        precipitation_probability: feature.precipitationProbability,
        weather_alerts: [],
        delay_risk: feature.delayRisk,
        delay_risk_version: feature.delayRiskVersion,
        delay_risk_components: feature.delayRiskComponents,
        weather_run_environment_score: feature.runEnvironmentScore,
        weather_run_environment_version: feature.weatherRunEnvironmentVersion,
        weather_run_components: feature.weatherRunComponents,
        park_factor_features: feature.parkFactorFeatures,
        park_environment_score: feature.parkEnvironmentScore,
        park_environment_version: feature.parkEnvironmentVersion,
        availability: feature.metadata.availability,
        source: feature.metadata.source ?? "UNKNOWN",
        source_updated_at: feature.metadata.updatedAt,
        feature_hash: featureHash(payload),
        canonical: true,
        captured_at: new Date().toISOString(),
      };
    });
}

export async function insertWeatherParkSnapshotsDeduped(features: WeatherParkFeatures[]) {
  const rows = buildWeatherParkSnapshotRows(features);
  if (rows.length === 0) return { attempted: 0, inserted: 0, skipped: 0, errors: [] as string[] };
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_weather_park_feature_snapshots")
    .upsert(rows, { onConflict: "feature_hash", ignoreDuplicates: true })
    .select("id");
  if (error) return { attempted: rows.length, inserted: 0, skipped: 0, errors: [error.message] };
  const hashes = rows.map((row) => row.feature_hash);
  const markOld = await supabase
    .from("mlb_weather_park_feature_snapshots")
    .update({ canonical: false, superseded_at: new Date().toISOString(), invalid_reason: "SUPERSEDED_BY_WEATHER_PHASE_7_CAPTURE" })
    .not("feature_hash", "in", `(${hashes.join(",")})`)
    .eq("canonical", true);
  if (markOld.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markOld.error.message] };
  const markCurrent = await supabase
    .from("mlb_weather_park_feature_snapshots")
    .update({ canonical: true, superseded_at: null, invalid_reason: null })
    .in("feature_hash", hashes);
  if (markCurrent.error) return { attempted: rows.length, inserted: data?.length ?? 0, skipped: 0, errors: [markCurrent.error.message] };
  const inserted = data?.length ?? 0;
  return { attempted: rows.length, inserted, skipped: rows.length - inserted, errors: [] as string[] };
}

export async function getWeatherParkSnapshotStatus() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from("mlb_weather_park_feature_snapshots").select("id", { count: "exact", head: true });
  if (error) return { healthy: false, totalSnapshots: 0, canonicalSnapshots: 0, errors: [error.message] };
  const { count: canonicalSnapshots } = await supabase.from("mlb_weather_park_feature_snapshots").select("id", { count: "exact", head: true }).eq("canonical", true);
  const { data, error: latestError } = await supabase
    .from("mlb_weather_park_feature_snapshots")
    .select("official_game_id,venue_name,availability,captured_at,delay_risk,weather_run_environment_score,park_environment_score")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  return {
    healthy: !latestError,
    totalSnapshots: count ?? 0,
    canonicalSnapshots: canonicalSnapshots ?? 0,
    gamesTracked: new Set((data ?? []).map((row: any) => row.official_game_id)).size,
    latestRefresh: data?.[0]?.captured_at as string | undefined,
    availabilityCounts: (data ?? []).reduce((acc: Record<string, number>, row: any) => {
      acc[row.availability] = (acc[row.availability] ?? 0) + 1;
      return acc;
    }, {}),
    errors: latestError ? [latestError.message] : [] as string[],
  };
}

export async function loadLatestCanonicalWeatherParkFeatures(): Promise<WeatherParkFeatures[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_weather_park_feature_snapshots")
    .select("*")
    .eq("canonical", true)
    .order("captured_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []).map((row: any): WeatherParkFeatures => ({
    officialGameId: row.official_game_id,
    venueId: row.official_venue_id,
    venueName: row.venue_name,
    scheduledStartTime: row.scheduled_start_time,
    roofType: row.roof_type,
    roofStatus: row.roof_status,
    roof: row.roof_type ? { roofType: row.roof_type, roofStatus: row.roof_status, verified: Boolean(row.roof_verified), warnings: [] } : undefined,
    forecast: row.forecast_valid_time ? {
      validTime: row.forecast_valid_time,
      generatedAt: row.forecast_generated_at,
      temperatureF: row.temperature_f ?? undefined,
      relativeHumidityPercent: row.humidity_percent ?? undefined,
      windSpeedMph: row.wind_speed_mph ?? undefined,
      windGustMph: row.wind_gust_mph ?? undefined,
      windDirectionDegrees: row.wind_direction_degrees ?? undefined,
      windDirectionCardinal: row.wind_direction_cardinal ?? undefined,
      precipitationProbability: row.precipitation_probability ?? undefined,
      source: "NWS_FORECAST",
      warnings: [],
    } : undefined,
    relativeWind: row.relative_wind ?? undefined,
    temperatureF: row.temperature_f ?? undefined,
    humidityPercent: row.humidity_percent ?? undefined,
    windSpeedMph: row.wind_speed_mph ?? undefined,
    windGustMph: row.wind_gust_mph ?? undefined,
    windDirectionDegrees: row.wind_direction_degrees ?? undefined,
    windDirection: row.wind_direction_cardinal ?? undefined,
    precipitationProbability: row.precipitation_probability ?? undefined,
    delayRisk: row.delay_risk ?? undefined,
    delayRiskVersion: row.delay_risk_version ?? undefined,
    delayRiskComponents: row.delay_risk_components ?? undefined,
    runEnvironmentScore: row.weather_run_environment_score ?? undefined,
    weatherRunEnvironmentVersion: row.weather_run_environment_version ?? undefined,
    weatherRunComponents: row.weather_run_components ?? undefined,
    parkFactorFeatures: row.park_factor_features ?? undefined,
    parkEnvironmentScore: row.park_environment_score ?? undefined,
    parkEnvironmentVersion: row.park_environment_version ?? undefined,
    metadata: {
      availability: row.availability,
      source: row.source,
      updatedAt: row.source_updated_at,
      observedAt: row.captured_at,
      warnings: [],
    },
    warnings: [],
  }));
}

