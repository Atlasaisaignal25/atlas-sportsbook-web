import type { MlbSportsIntelligenceFeatures, MlbSportsProjection } from "./types";

export function buildMlbSportsProjection(
  features: MlbSportsIntelligenceFeatures,
): MlbSportsProjection {
  return {
    eventId: features.eventId,
    projectionAvailability: "UNAVAILABLE",
    warnings: [
      "MLB Sports Projection is unavailable in Phase 1 because verified sports feature modules are not connected.",
      ...features.warnings,
    ],
  };
}

