import type {
  BullpenFeatures,
  LineupStrengthFeatures,
  MlbGameContext,
  OffensiveFormFeatures,
  StartingPitcherFeatures,
  WeatherParkFeatures,
} from "./types";

export interface MlbSportsIntelligenceProvider {
  name: string;

  getStartingPitcherFeatures(context: MlbGameContext): Promise<StartingPitcherFeatures>;

  getLineupStrengthFeatures(context: MlbGameContext): Promise<LineupStrengthFeatures>;

  getOffensiveFormFeatures(context: MlbGameContext): Promise<OffensiveFormFeatures>;

  getBullpenFeatures(context: MlbGameContext): Promise<BullpenFeatures>;

  getWeatherParkFeatures(context: MlbGameContext): Promise<WeatherParkFeatures>;
}

function unavailableMetadata(moduleName: string) {
  return {
    availability: "UNAVAILABLE" as const,
    source: "UNKNOWN" as const,
    warnings: [`${moduleName} is not connected in MLB Sports Intelligence Phase 1.`],
  };
}

export class UnavailableMlbSportsIntelligenceProvider implements MlbSportsIntelligenceProvider {
  name = "UnavailableMlbSportsIntelligenceProvider";

  async getStartingPitcherFeatures(_context: MlbGameContext): Promise<StartingPitcherFeatures> {
    return { metadata: unavailableMetadata("Starting pitcher data") };
  }

  async getLineupStrengthFeatures(_context: MlbGameContext): Promise<LineupStrengthFeatures> {
    return { metadata: unavailableMetadata("Lineup data") };
  }

  async getOffensiveFormFeatures(_context: MlbGameContext): Promise<OffensiveFormFeatures> {
    return { metadata: unavailableMetadata("Offensive rolling-form data") };
  }

  async getBullpenFeatures(_context: MlbGameContext): Promise<BullpenFeatures> {
    return { metadata: unavailableMetadata("Bullpen data") };
  }

  async getWeatherParkFeatures(_context: MlbGameContext): Promise<WeatherParkFeatures> {
    return { metadata: unavailableMetadata("Weather and park data") };
  }
}

export const unavailableMlbSportsIntelligenceProvider =
  new UnavailableMlbSportsIntelligenceProvider();

