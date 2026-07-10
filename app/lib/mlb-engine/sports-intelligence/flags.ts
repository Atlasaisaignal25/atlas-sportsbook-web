export type MlbSportsIntelligenceFlags = {
  sportsIntelligenceEnabled: boolean;
  pitcherModelEnabled: boolean;
  lineupModelEnabled: boolean;
  offensiveFormModelEnabled: boolean;
  bullpenModelEnabled: boolean;
  weatherModelEnabled: boolean;
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
    bullpenModelEnabled: envFlag("MLB_BULLPEN_MODEL_ENABLED"),
    weatherModelEnabled: envFlag("MLB_WEATHER_MODEL_ENABLED"),
  };
}

