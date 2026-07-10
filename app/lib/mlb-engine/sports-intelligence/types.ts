export type DataAvailability =
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE"
  | "STALE"
  | "ERROR";

export type FeatureSource =
  | "MLB_OFFICIAL"
  | "BASEBALL_SAVANT"
  | "WEATHER"
  | "ATLAS_DERIVED"
  | "SPORTSDATAIO"
  | "UNKNOWN";

export type SportsFeatureMetadata = {
  availability: DataAvailability;
  source?: FeatureSource;
  observedAt?: string;
  updatedAt?: string;
  freshnessMinutes?: number;
  confidence?: number;
  warnings?: string[];
};

export type MlbTeamSide = "HOME" | "AWAY" | "NEUTRAL";

export type MlbStartingPitcher = {
  playerId?: string;
  name?: string;
  throwingHand?: "L" | "R";
  status?: "CONFIRMED" | "PROBABLE" | "EXPECTED" | "UNKNOWN";
  confirmed?: boolean;
  restDays?: number;
  recentPitchCount?: number;
  era?: number;
  whip?: number;
  strikeoutRate?: number;
  walkRate?: number;
  xEra?: number;
  xWobaAllowed?: number;
  velocityTrend?: number;
};

export type StartingPitcherFeatures = {
  metadata: SportsFeatureMetadata;
  homeStarter?: MlbStartingPitcher;
  awayStarter?: MlbStartingPitcher;
  matchupAdvantage?: MlbTeamSide;
  qualityScore?: number;
};

export type LineupStrengthFeatures = {
  metadata: SportsFeatureMetadata;
  homeConfirmed?: boolean;
  awayConfirmed?: boolean;
  homeLineupStrength?: number;
  awayLineupStrength?: number;
  homeMissingImpactPlayers?: number;
  awayMissingImpactPlayers?: number;
  homePlatoonAdvantage?: number;
  awayPlatoonAdvantage?: number;
  homeLineupChangeScore?: number;
  awayLineupChangeScore?: number;
};

export type OffensiveTeamForm = {
  last7Score?: number;
  last14Score?: number;
  last30Score?: number;
  hardHitRate?: number;
  barrelRate?: number;
  strikeoutRate?: number;
  walkRate?: number;
  xWoba?: number;
};

export type OffensiveFormFeatures = {
  metadata: SportsFeatureMetadata;
  home?: OffensiveTeamForm;
  away?: OffensiveTeamForm;
  formAdvantage?: MlbTeamSide;
};

export type BullpenSideFeatures = {
  fatigueScore?: number;
  inningsLast3Days?: number;
  pitchesLast3Days?: number;
  closerAvailable?: boolean;
  highLeverageArmsAvailable?: number;
  qualityScore?: number;
};

export type BullpenFeatures = {
  metadata: SportsFeatureMetadata;
  home?: BullpenSideFeatures;
  away?: BullpenSideFeatures;
  bullpenAdvantage?: MlbTeamSide;
};

export type WeatherParkFeatures = {
  metadata: SportsFeatureMetadata;
  venueId?: string;
  venueName?: string;
  roofType?: "OPEN" | "CLOSED" | "RETRACTABLE" | "DOME";
  roofStatus?: "OPEN" | "CLOSED" | "UNKNOWN";
  temperatureF?: number;
  humidityPercent?: number;
  windSpeedMph?: number;
  windDirection?: string;
  precipitationProbability?: number;
  delayRisk?: number;
  parkFactor?: number;
  runEnvironmentScore?: number;
  totalDirection?: "OVER" | "UNDER" | "NEUTRAL";
};

export type MlbGameContext = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  currentTime: string;
  marketKeys: string[];
};

export type MlbSportsIntelligenceFeatures = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  startingPitcher: StartingPitcherFeatures;
  lineup: LineupStrengthFeatures;
  offensiveForm: OffensiveFormFeatures;
  bullpen: BullpenFeatures;
  weatherPark: WeatherParkFeatures;
  overallAvailability: DataAvailability;
  availableModuleCount: number;
  totalModuleCount: number;
  sportsDataQualityScore?: number;
  warnings: string[];
};

export type MlbSportsProjection = {
  eventId: string;
  homeWinProbability?: number;
  awayWinProbability?: number;
  projectedTotalRuns?: number;
  projectedHomeRuns?: number;
  projectedAwayRuns?: number;
  modelConfidence?: number;
  projectionAvailability: DataAvailability;
  componentScores?: {
    startingPitcher?: number;
    lineup?: number;
    offense?: number;
    bullpen?: number;
    weatherPark?: number;
  };
  warnings: string[];
};

export type MlbCandidateEvaluationContext<MarketFeatures = unknown> = {
  marketFeatures: MarketFeatures;
  sportsFeatures: MlbSportsIntelligenceFeatures;
  sportsProjection: MlbSportsProjection;
};
