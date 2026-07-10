import { NextResponse } from "next/server";
import {
  cachedMlbOfficialClient,
  getMlbSportsIntelligenceFlags,
} from "@/app/lib/mlb-engine/sports-intelligence";
import { MlbWeatherParkProvider } from "@/app/lib/mlb-engine/sports-intelligence/weather/weather-provider";
import {
  getWeatherParkSnapshotStatus,
  insertWeatherParkSnapshotsDeduped,
} from "@/app/lib/mlb-engine/sports-intelligence/weather/weather-feature-repository";
import { distribution } from "@/app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-calibration";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function gameInWindow(gameDate: string | undefined, now: Date, futureHours = 36) {
  if (!gameDate) return false;
  const time = new Date(gameDate).getTime();
  return Number.isFinite(time) && time >= now.getTime() - 2 * 60 * 60 * 1000 && time <= now.getTime() + futureHours * 60 * 60 * 1000;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const flags = getMlbSportsIntelligenceFlags();
  const provider = new MlbWeatherParkProvider({
    enabled: flags.sportsIntelligenceEnabled && flags.weatherModelEnabled,
    nwsEnabled: flags.nwsProviderEnabled,
    parkFactorEnabled: flags.parkFactorModelEnabled,
    delayRiskEnabled: flags.weatherDelayRiskEnabled && flags.weatherScoreMode === "AUDIT_ONLY",
    weatherRunEnvironmentEnabled: flags.weatherRunEnvironmentEnabled && flags.weatherScoreMode === "AUDIT_ONLY",
    parkEnvironmentEnabled: flags.parkEnvironmentScoreEnabled && flags.weatherScoreMode === "AUDIT_ONLY",
  });

  try {
    const now = new Date();
    const dates = [dateKey(now), dateKey(addDays(now, 1))];
    const games = (await Promise.all(dates.map((date) => cachedMlbOfficialClient.getSchedule(date)))).flat();
    const uniqueGames = Array.from(new Map(games.filter((game) => gameInWindow(game.gameDate, now)).map((game) => [String(game.gamePk), game])).values());
    const features = await mapWithConcurrency(uniqueGames, 5, (game) => provider.buildGameWeatherFeatures({ game, asOf: now.toISOString() }));
    const storage = await insertWeatherParkSnapshotsDeduped(features);
    const snapshotStatus = await getWeatherParkSnapshotStatus();
    const health = provider.getHealth();
    const available = features.filter((feature) => feature.metadata.availability === "AVAILABLE").length;
    const partial = features.filter((feature) => feature.metadata.availability === "PARTIAL").length;
    const unavailable = features.filter((feature) => feature.metadata.availability === "UNAVAILABLE").length;

    return NextResponse.json({
      ok: true,
      asOf: now.toISOString(),
      gamesInspected: uniqueGames.length,
      gamesMapped: health.gamesMapped,
      venuesResolved: health.venuesResolved,
      forecastsAvailable: health.forecastsAvailable,
      observationsAvailable: 0,
      roofVerified: health.roofVerified,
      roofInferred: health.roofInferred,
      delayRiskScored: health.delayRiskScored,
      weatherEnvironmentScored: health.weatherEnvironmentScored,
      parkEnvironmentScored: health.parkEnvironmentScored,
      gamesAvailable: available,
      gamesPartial: partial,
      gamesUnavailable: unavailable,
      snapshotsInserted: storage.inserted,
      duplicateSnapshotsSkipped: storage.skipped,
      delayRiskDistribution: distribution(features.map((feature) => feature.delayRisk)),
      weatherEnvironmentDistribution: distribution(features.map((feature) => feature.runEnvironmentScore)),
      parkEnvironmentDistribution: distribution(features.map((feature) => feature.parkEnvironmentScore)),
      providerErrors: [...health.errors, ...storage.errors],
      providerHealth: health,
      storageHealth: {
        healthy: storage.errors.length === 0,
        ...storage,
        snapshotStatus,
      },
      examples: {
        openAir: features.find((feature) => feature.roof?.roofType === "OPEN_AIR"),
        domeOrRetractable: features.find((feature) => feature.roof?.roofType === "DOME" || feature.roof?.roofType === "RETRACTABLE"),
        precipitationRisk: features
          .filter((feature) => feature.precipitationProbability !== undefined)
          .sort((a, b) => (b.precipitationProbability ?? 0) - (a.precipitationProbability ?? 0))[0],
        unavailable: features.find((feature) => feature.metadata.availability === "UNAVAILABLE"),
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown MLB weather capture error",
      providerHealth: provider.getHealth(),
    }, { status: 500 });
  }
}

