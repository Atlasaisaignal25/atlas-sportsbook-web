export const ATLAS_CORE_MLB_VERSION = "atlas_core_mlb_v1_1_probability_first";
export const ATLAS_CORE_MLB_ROLLBACK_ENGINE = "legacy_top5_engine";

function envFlag(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function getAtlasCoreMlbConfig() {
  return {
    enabled: envFlag("ATLAS_CORE_MLB_ENABLED"),
    legacyRollbackEnabled: envFlag("ATLAS_CORE_MLB_ROLLBACK_TO_LEGACY"),
    morningScanHourEt: envNumber("ATLAS_CORE_MLB_MORNING_SCAN_HOUR_ET", 7),
    minFinalPickEdge: envNumber("ATLAS_CORE_MLB_MIN_FINAL_PICK_EDGE", 0.025),
    minFinalPickConvictionScore: envNumber("ATLAS_CORE_MLB_MIN_FINAL_PICK_CONVICTION", 50),
    minFinalPickConsensusScore: envNumber("ATLAS_CORE_MLB_MIN_FINAL_PICK_CONSENSUS", 25),
    minTopSignalSeparation: envNumber("ATLAS_CORE_MLB_MIN_TOP_SIGNAL_SEPARATION", 8),
  };
}

export function todayET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export function currentHourET() {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    hour12: false,
  }).format(new Date()));
}
