export type MlbSportsIntelligenceFlags = {
  sportsIntelligenceEnabled: boolean;
  pitcherModelEnabled: boolean;
  lineupModelEnabled: boolean;
  offensiveFormModelEnabled: boolean;
  statcastProviderEnabled: boolean;
  offensiveScoreEnabled: boolean;
  offensiveScoreMode: "AUDIT_ONLY" | "DISABLED";
  bullpenModelEnabled: boolean;
  bullpenProviderEnabled: boolean;
  bullpenFatigueScoreEnabled: boolean;
  bullpenScoreMode: "AUDIT_ONLY" | "DISABLED";
  bullpenFatigueVersion: "v1" | "v2";
  bullpenQualityScoreEnabled: boolean;
  bullpenQualityScoreMode: "AUDIT_ONLY" | "DISABLED";
  bullpenQualityVersion: "v1" | "v2";
  bullpenSeasonArchiveEnabled: boolean;
  bullpenQualityBaselineEnabled: boolean;
  weatherModelEnabled: boolean;
  nwsProviderEnabled: boolean;
  parkFactorModelEnabled: boolean;
  weatherDelayRiskEnabled: boolean;
  weatherRunEnvironmentEnabled: boolean;
  parkEnvironmentScoreEnabled: boolean;
  weatherScoreMode: "AUDIT_ONLY" | "DISABLED";
  teamStrengthEnabled: boolean;
  teamStrengthScoreMode: "AUDIT_ONLY" | "DISABLED";
  lineupSnapshotsEnabled: boolean;
  lineupChangeDetectionEnabled: boolean;
  starterVerificationSnapshotsEnabled: boolean;
};

function envFlag(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

export function getMlbSportsIntelligenceFlags(): MlbSportsIntelligenceFlags {
  return {
    sportsIntelligenceEnabled: envFlag("MLB_SPORTS_INTELLIGENCE_ENABLED"),
    pitcherModelEnabled: envFlag("MLB_PITCHER_MODEL_ENABLED"),
    lineupModelEnabled: envFlag("MLB_LINEUP_MODEL_ENABLED"),
    offensiveFormModelEnabled: envFlag("MLB_OFFENSIVE_FORM_MODEL_ENABLED"),
    statcastProviderEnabled: envFlag("MLB_STATCAST_PROVIDER_ENABLED"),
    offensiveScoreEnabled: envFlag("MLB_OFFENSIVE_SCORE_ENABLED"),
    offensiveScoreMode: process.env.MLB_OFFENSIVE_SCORE_MODE === "AUDIT_ONLY" ? "AUDIT_ONLY" : "DISABLED",
    bullpenModelEnabled: envFlag("MLB_BULLPEN_MODEL_ENABLED"),
    bullpenProviderEnabled: envFlag("MLB_BULLPEN_PROVIDER_ENABLED"),
    bullpenFatigueScoreEnabled: envFlag("MLB_BULLPEN_FATIGUE_SCORE_ENABLED"),
    bullpenScoreMode: process.env.MLB_BULLPEN_SCORE_MODE === "AUDIT_ONLY" ? "AUDIT_ONLY" : "DISABLED",
    bullpenFatigueVersion: process.env.MLB_BULLPEN_FATIGUE_VERSION === "v2" ? "v2" : "v1",
    bullpenQualityScoreEnabled: envFlag("MLB_BULLPEN_QUALITY_SCORE_ENABLED"),
    bullpenQualityScoreMode: process.env.MLB_BULLPEN_QUALITY_SCORE_MODE === "AUDIT_ONLY" ? "AUDIT_ONLY" : "DISABLED",
    bullpenQualityVersion: process.env.MLB_BULLPEN_QUALITY_VERSION === "v2" ? "v2" : "v1",
    bullpenSeasonArchiveEnabled: envFlag("MLB_BULLPEN_SEASON_ARCHIVE_ENABLED"),
    bullpenQualityBaselineEnabled: envFlag("MLB_BULLPEN_QUALITY_BASELINE_ENABLED"),
    weatherModelEnabled: envFlag("MLB_WEATHER_MODEL_ENABLED"),
    nwsProviderEnabled: envFlag("MLB_NWS_PROVIDER_ENABLED"),
    parkFactorModelEnabled: envFlag("MLB_PARK_FACTOR_MODEL_ENABLED"),
    weatherDelayRiskEnabled: envFlag("MLB_WEATHER_DELAY_RISK_ENABLED"),
    weatherRunEnvironmentEnabled: envFlag("MLB_WEATHER_RUN_ENVIRONMENT_ENABLED"),
    parkEnvironmentScoreEnabled: envFlag("MLB_PARK_ENVIRONMENT_SCORE_ENABLED"),
    weatherScoreMode: process.env.MLB_WEATHER_SCORE_MODE === "AUDIT_ONLY" ? "AUDIT_ONLY" : "DISABLED",
    teamStrengthEnabled: envFlag("MLB_TEAM_STRENGTH_ENABLED"),
    teamStrengthScoreMode: process.env.MLB_TEAM_STRENGTH_SCORE_MODE === "AUDIT_ONLY" ? "AUDIT_ONLY" : "DISABLED",
    lineupSnapshotsEnabled: envFlag("MLB_LINEUP_SNAPSHOTS_ENABLED"),
    lineupChangeDetectionEnabled: envFlag("MLB_LINEUP_CHANGE_DETECTION_ENABLED"),
    starterVerificationSnapshotsEnabled: envFlag("MLB_STARTER_VERIFICATION_SNAPSHOTS_ENABLED"),
  };
}
