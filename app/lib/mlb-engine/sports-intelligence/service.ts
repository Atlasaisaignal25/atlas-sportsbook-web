import {
  unavailableMlbSportsIntelligenceProvider,
  type MlbSportsIntelligenceProvider,
} from "./provider";
import type {
  BullpenFeatures,
  DataAvailability,
  LineupStrengthFeatures,
  MlbGameContext,
  MlbPlayerAvailabilityFeatures,
  MlbSportsIntelligenceFeatures,
  OffensiveFormFeatures,
  SportsFeatureMetadata,
  StartingPitcherFeatures,
  WeatherParkFeatures,
} from "./types";

type FeatureModuleName =
  | "startingPitcher"
  | "lineup"
  | "playerAvailability"
  | "offensiveForm"
  | "bullpen"
  | "weatherPark";

type FeatureModule =
  | StartingPitcherFeatures
  | LineupStrengthFeatures
  | MlbPlayerAvailabilityFeatures
  | OffensiveFormFeatures
  | BullpenFeatures
  | WeatherParkFeatures;

const TOTAL_MODULE_COUNT = 6;

function unavailablePlayerAvailability(): MlbPlayerAvailabilityFeatures {
  const metadata: SportsFeatureMetadata = {
    availability: "UNAVAILABLE",
    source: "UNKNOWN",
    warnings: ["Structured MLB player availability is not connected in Phase 4."],
  };

  return {
    metadata,
    homePlayers: [],
    awayPlayers: [],
    warnings: metadata.warnings ?? [],
  };
}

function errorMetadata(moduleName: FeatureModuleName, error: unknown): SportsFeatureMetadata {
  const message = error instanceof Error ? error.message : "Unknown provider error";

  return {
    availability: "ERROR",
    source: "UNKNOWN",
    warnings: [`${moduleName} provider failed: ${message}`],
  };
}

function unavailableMetadata(moduleName: FeatureModuleName): SportsFeatureMetadata {
  return {
    availability: "UNAVAILABLE",
    source: "UNKNOWN",
    warnings: [`${moduleName} returned no verified data.`],
  };
}

async function safelyLoadFeature<T extends FeatureModule>(
  moduleName: FeatureModuleName,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    const feature = await loader();
    if (!feature?.metadata) {
      return { metadata: unavailableMetadata(moduleName) } as T;
    }

    return feature;
  } catch (error) {
    return { metadata: errorMetadata(moduleName, error) } as T;
  }
}

function availabilityRank(value: DataAvailability) {
  if (value === "AVAILABLE") return 4;
  if (value === "PARTIAL") return 3;
  if (value === "STALE") return 2;
  if (value === "ERROR") return 1;
  return 0;
}

function calculateOverallAvailability(modules: FeatureModule[]): DataAvailability {
  const availability = modules.map((module) => module.metadata.availability);
  const availableCount = availability.filter((value) => value === "AVAILABLE").length;
  const partialCount = availability.filter((value) => value === "PARTIAL").length;
  const staleCount = availability.filter((value) => value === "STALE").length;
  const errorCount = availability.filter((value) => value === "ERROR").length;

  if (availableCount === TOTAL_MODULE_COUNT) return "AVAILABLE";
  if (availableCount > 0 || partialCount > 0) return "PARTIAL";
  if (staleCount > 0) return "STALE";
  if (errorCount > 0) return "ERROR";
  return "UNAVAILABLE";
}

function countAvailableModules(modules: FeatureModule[]) {
  return modules.filter((module) => availabilityRank(module.metadata.availability) >= availabilityRank("PARTIAL")).length;
}

function collectWarnings(modules: FeatureModule[]) {
  return modules.flatMap((module) => module.metadata.warnings ?? []);
}

function calculateSportsDataQualityScore(modules: FeatureModule[]) {
  const scores = modules
    .map((module) => module.metadata.confidence)
    .filter((score): score is number => Number.isFinite(score));

  if (scores.length === 0) return undefined;

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export async function getMlbSportsIntelligenceFeatures(
  context: MlbGameContext,
  provider: MlbSportsIntelligenceProvider = unavailableMlbSportsIntelligenceProvider,
): Promise<MlbSportsIntelligenceFeatures> {
  const [startingPitcher, lineup, offensiveForm, bullpen, weatherPark] = await Promise.all([
    safelyLoadFeature("startingPitcher", () => provider.getStartingPitcherFeatures(context)),
    safelyLoadFeature("lineup", () => provider.getLineupStrengthFeatures(context)),
    safelyLoadFeature("offensiveForm", () => provider.getOffensiveFormFeatures(context)),
    safelyLoadFeature("bullpen", () => provider.getBullpenFeatures(context)),
    safelyLoadFeature("weatherPark", () => provider.getWeatherParkFeatures(context)),
  ]);
  const playerAvailability = unavailablePlayerAvailability();
  const modules = [startingPitcher, lineup, playerAvailability, offensiveForm, bullpen, weatherPark];

  return {
    eventId: context.eventId,
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    commenceTime: context.commenceTime,
    startingPitcher,
    lineup,
    playerAvailability,
    offensiveForm,
    bullpen,
    weatherPark,
    overallAvailability: calculateOverallAvailability(modules),
    availableModuleCount: countAvailableModules(modules),
    totalModuleCount: TOTAL_MODULE_COUNT,
    sportsDataQualityScore: calculateSportsDataQualityScore(modules),
    warnings: collectWarnings(modules),
  };
}

export function buildUnavailableMlbSportsIntelligenceFeatures(
  context: MlbGameContext,
): MlbSportsIntelligenceFeatures {
  const metadata: SportsFeatureMetadata = {
    availability: "UNAVAILABLE",
    source: "UNKNOWN",
    warnings: ["MLB Sports Intelligence is disabled or no game context was available."],
  };

  return {
    eventId: context.eventId,
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    commenceTime: context.commenceTime,
    startingPitcher: { metadata },
    lineup: { metadata },
    playerAvailability: unavailablePlayerAvailability(),
    offensiveForm: { metadata },
    bullpen: { metadata },
    weatherPark: { metadata },
    overallAvailability: "UNAVAILABLE",
    availableModuleCount: 0,
    totalModuleCount: TOTAL_MODULE_COUNT,
    warnings: metadata.warnings ?? [],
  };
}
