import type { WeatherParkFeatures } from "../types";
import { PARK_ENVIRONMENT_VERSION } from "./weather-models";
import { MLB_VENUES } from "./venue-registry";
import { distribution } from "../bullpen/bullpen-calibration";

export const PARK_FACTOR_SOURCE_VERSION = "atlas_internal_mlb_park_factors_2026_v1";

const FACTORS: Record<string, { overallRunFactor: number; homeRunFactor: number }> = {
  "17": { overallRunFactor: 112, homeRunFactor: 105 },
  "22": { overallRunFactor: 98, homeRunFactor: 102 },
  "2398": { overallRunFactor: 104, homeRunFactor: 112 },
  "2394": { overallRunFactor: 99, homeRunFactor: 98 },
  "3": { overallRunFactor: 103, homeRunFactor: 94 },
  "4": { overallRunFactor: 101, homeRunFactor: 108 },
  "15": { overallRunFactor: 101, homeRunFactor: 99 },
  "3313": { overallRunFactor: 100, homeRunFactor: 103 },
  "2": { overallRunFactor: 100, homeRunFactor: 104 },
  "2399": { overallRunFactor: 97, homeRunFactor: 97 },
  "2395": { overallRunFactor: 94, homeRunFactor: 86 },
  "2680": { overallRunFactor: 96, homeRunFactor: 93 },
  "2392": { overallRunFactor: 99, homeRunFactor: 100 },
  "32": { overallRunFactor: 100, homeRunFactor: 103 },
  "7": { overallRunFactor: 98, homeRunFactor: 90 },
  "14": { overallRunFactor: 99, homeRunFactor: 96 },
  "31": { overallRunFactor: 97, homeRunFactor: 92 },
  "4169": { overallRunFactor: 97, homeRunFactor: 95 },
  "3309": { overallRunFactor: 99, homeRunFactor: 101 },
  "3289": { overallRunFactor: 97, homeRunFactor: 97 },
  "5325": { overallRunFactor: 101, homeRunFactor: 102 },
  "3312": { overallRunFactor: 98, homeRunFactor: 95 },
  "2889": { overallRunFactor: 100, homeRunFactor: 101 },
  "2602": { overallRunFactor: 106, homeRunFactor: 116 },
  "680": { overallRunFactor: 96, homeRunFactor: 94 },
  "1": { overallRunFactor: 99, homeRunFactor: 101 },
  "19": { overallRunFactor: 97, homeRunFactor: 95 },
  "12": { overallRunFactor: 96, homeRunFactor: 93 },
  "5": { overallRunFactor: 100, homeRunFactor: 102 },
  "5327": { overallRunFactor: 98, homeRunFactor: 98 },
};

function round(value: number | undefined, digits = 1) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parkEnvironmentScore(overallRunFactor?: number, homeRunFactor?: number) {
  if (overallRunFactor === undefined) return undefined;
  const hr = homeRunFactor ?? overallRunFactor;
  return round(Math.max(0, Math.min(100, 50 + (overallRunFactor - 100) * 1.6 + (hr - 100) * 0.45)), 1);
}

export function getParkFactorFeatures(officialVenueId: string | undefined, venueName?: string): WeatherParkFeatures["parkFactorFeatures"] {
  if (!officialVenueId) return undefined;
  const factor = FACTORS[officialVenueId];
  if (!factor) return undefined;
  const score = parkEnvironmentScore(factor.overallRunFactor, factor.homeRunFactor);
  return {
    officialVenueId,
    venueName: venueName ?? MLB_VENUES.find((venue) => venue.officialVenueId === officialVenueId)?.venueName ?? officialVenueId,
    season: 2026,
    overallRunFactor: factor.overallRunFactor,
    homeRunFactor: factor.homeRunFactor,
    source: "ATLAS_DERIVED",
    sourceUpdatedAt: "2026-07-10",
    parkEnvironmentScore: score,
    scoreVersion: PARK_ENVIRONMENT_VERSION,
    metadata: {
      availability: "AVAILABLE",
      source: "ATLAS_DERIVED",
      observedAt: new Date().toISOString(),
      warnings: ["Versioned internal park-factor baseline preserves native 100=league-average scale."],
    },
    warnings: ["Park environment is separate from weather and does not influence picks."],
  };
}

export function parkBaselineHealth() {
  const values = Object.values(FACTORS).map((factor) => factor.overallRunFactor);
  const venues = new Set(Object.keys(FACTORS));
  return {
    sourceVersion: PARK_FACTOR_SOURCE_VERSION,
    leagueAverageScale: 100,
    venuesIncluded: venues.size,
    missingVenues: MLB_VENUES.filter((venue) => !venues.has(venue.officialVenueId)).map((venue) => venue.venueName),
    distribution: distribution(values),
  };
}
