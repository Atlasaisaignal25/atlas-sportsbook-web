import type { FeatureSource } from "../types";

export type MlbVenueRecord = {
  officialVenueId: string;
  venueName: string;
  homeTeamIds: string[];
  latitude?: number;
  longitude?: number;
  timezone?: string;
  roofType: "OPEN_AIR" | "DOME" | "RETRACTABLE" | "UNKNOWN";
  surfaceType?: string;
  source: FeatureSource;
  verifiedAt?: string;
  warnings: string[];
};

export type MlbVenueOrientation = {
  officialVenueId: string;
  homePlateToCenterFieldBearingDegrees?: number;
  source?: string;
  verified: boolean;
  warnings: string[];
};

export const MLB_VENUE_REGISTRY_VERSION = "mlb_venue_registry_v1_2026_07";

export const MLB_VENUES: MlbVenueRecord[] = [
  { officialVenueId: "1", venueName: "Angel Stadium", homeTeamIds: ["108"], latitude: 33.8003, longitude: -117.8827, timezone: "America/Los_Angeles", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "15", venueName: "Chase Field", homeTeamIds: ["109"], latitude: 33.4455, longitude: -112.0667, timezone: "America/Phoenix", roofType: "RETRACTABLE", surfaceType: "synthetic", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["Retractable roof status requires game-level verification."] },
  { officialVenueId: "2", venueName: "Dodger Stadium", homeTeamIds: ["119"], latitude: 34.0739, longitude: -118.2400, timezone: "America/Los_Angeles", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "3", venueName: "Fenway Park", homeTeamIds: ["111"], latitude: 42.3467, longitude: -71.0972, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "4", venueName: "Wrigley Field", homeTeamIds: ["112"], latitude: 41.9484, longitude: -87.6553, timezone: "America/Chicago", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "5", venueName: "Rogers Centre", homeTeamIds: ["141"], latitude: 43.6414, longitude: -79.3894, timezone: "America/Toronto", roofType: "RETRACTABLE", surfaceType: "synthetic", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["NWS does not cover Toronto; weather unavailable in Phase 7."] },
  { officialVenueId: "7", venueName: "Kauffman Stadium", homeTeamIds: ["118"], latitude: 39.0517, longitude: -94.4803, timezone: "America/Chicago", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "10", venueName: "Oakland Coliseum", homeTeamIds: [], latitude: 37.7516, longitude: -122.2005, timezone: "America/Los_Angeles", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["Legacy/alternate venue retained for historical schedules."] },
  { officialVenueId: "12", venueName: "Tropicana Field", homeTeamIds: ["139"], latitude: 27.7682, longitude: -82.6534, timezone: "America/New_York", roofType: "DOME", surfaceType: "synthetic", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "14", venueName: "Progressive Field", homeTeamIds: ["114"], latitude: 41.4962, longitude: -81.6852, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "17", venueName: "Coors Field", homeTeamIds: ["115"], latitude: 39.7561, longitude: -104.9942, timezone: "America/Denver", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "19", venueName: "loanDepot park", homeTeamIds: ["146"], latitude: 25.7781, longitude: -80.2197, timezone: "America/New_York", roofType: "RETRACTABLE", surfaceType: "synthetic", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["Retractable roof status requires game-level verification."] },
  { officialVenueId: "22", venueName: "Great American Ball Park", homeTeamIds: ["113"], latitude: 39.0979, longitude: -84.5066, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "31", venueName: "PNC Park", homeTeamIds: ["134"], latitude: 40.4469, longitude: -80.0057, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "32", venueName: "American Family Field", homeTeamIds: ["158"], latitude: 43.0280, longitude: -87.9712, timezone: "America/Chicago", roofType: "RETRACTABLE", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["Retractable roof status requires game-level verification."] },
  { officialVenueId: "2392", venueName: "Minute Maid Park", homeTeamIds: ["117"], latitude: 29.7573, longitude: -95.3555, timezone: "America/Chicago", roofType: "RETRACTABLE", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["Retractable roof status requires game-level verification."] },
  { officialVenueId: "2394", venueName: "Comerica Park", homeTeamIds: ["116"], latitude: 42.3390, longitude: -83.0485, timezone: "America/Detroit", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "2395", venueName: "Oracle Park", homeTeamIds: ["137"], latitude: 37.7786, longitude: -122.3893, timezone: "America/Los_Angeles", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "2397", venueName: "Busch Stadium", homeTeamIds: ["138"], latitude: 38.6226, longitude: -90.1928, timezone: "America/Chicago", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "2398", venueName: "Citizens Bank Park", homeTeamIds: ["143"], latitude: 39.9061, longitude: -75.1665, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "2399", venueName: "Citi Field", homeTeamIds: ["121"], latitude: 40.7571, longitude: -73.8458, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "2602", venueName: "Great American Ball Park", homeTeamIds: ["113"], latitude: 39.0979, longitude: -84.5066, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "2680", venueName: "Petco Park", homeTeamIds: ["135"], latitude: 32.7073, longitude: -117.1566, timezone: "America/Los_Angeles", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "2889", venueName: "Nationals Park", homeTeamIds: ["120"], latitude: 38.8730, longitude: -77.0074, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "3289", venueName: "Yankee Stadium", homeTeamIds: ["147"], latitude: 40.8296, longitude: -73.9262, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "3309", venueName: "Target Field", homeTeamIds: ["142"], latitude: 44.9817, longitude: -93.2776, timezone: "America/Chicago", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "3312", venueName: "Globe Life Field", homeTeamIds: ["140"], latitude: 32.7473, longitude: -97.0842, timezone: "America/Chicago", roofType: "RETRACTABLE", surfaceType: "synthetic", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["Retractable roof status requires game-level verification."] },
  { officialVenueId: "3313", venueName: "Truist Park", homeTeamIds: ["144"], latitude: 33.8908, longitude: -84.4678, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "4169", venueName: "Guaranteed Rate Field", homeTeamIds: ["145"], latitude: 41.8300, longitude: -87.6339, timezone: "America/Chicago", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "5325", venueName: "Oriole Park at Camden Yards", homeTeamIds: ["110"], latitude: 39.2839, longitude: -76.6217, timezone: "America/New_York", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: [] },
  { officialVenueId: "680", venueName: "T-Mobile Park", homeTeamIds: ["136"], latitude: 47.5914, longitude: -122.3325, timezone: "America/Los_Angeles", roofType: "RETRACTABLE", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["Retractable roof status requires game-level verification."] },
  { officialVenueId: "5327", venueName: "Sutter Health Park", homeTeamIds: ["133"], latitude: 38.5804, longitude: -121.5137, timezone: "America/Los_Angeles", roofType: "OPEN_AIR", surfaceType: "grass", source: "ATLAS_DERIVED", verifiedAt: "2026-07-10", warnings: ["Temporary/alternate Athletics venue."] },
];

export const MLB_VENUE_ORIENTATIONS: MlbVenueOrientation[] = MLB_VENUES.map((venue) => ({
  officialVenueId: venue.officialVenueId,
  homePlateToCenterFieldBearingDegrees: undefined,
  source: "Orientation not verified in Phase 7 registry.",
  verified: false,
  warnings: ["Relative wind remains UNKNOWN until verified stadium bearing is added."],
}));

export function getVenueById(officialVenueId: string | number | undefined) {
  if (officialVenueId === undefined) return undefined;
  return MLB_VENUES.find((venue) => venue.officialVenueId === String(officialVenueId));
}

export function getVenueOrientation(officialVenueId: string | number | undefined) {
  if (officialVenueId === undefined) return undefined;
  return MLB_VENUE_ORIENTATIONS.find((venue) => venue.officialVenueId === String(officialVenueId));
}

export function venueRegistryHealth() {
  const missingCoordinates = MLB_VENUES.filter((venue) => venue.latitude === undefined || venue.longitude === undefined);
  return {
    version: MLB_VENUE_REGISTRY_VERSION,
    venuesTracked: MLB_VENUES.length,
    missingCoordinates: missingCoordinates.map((venue) => venue.venueName),
    retractableVenues: MLB_VENUES.filter((venue) => venue.roofType === "RETRACTABLE").length,
    domeVenues: MLB_VENUES.filter((venue) => venue.roofType === "DOME").length,
  };
}

