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
  homeLineup?: NormalizedTeamLineup;
  awayLineup?: NormalizedTeamLineup;
  homeLineupStrength?: number;
  awayLineupStrength?: number;
  homeMissingImpactPlayers?: number;
  awayMissingImpactPlayers?: number;
  homePlatoonAdvantage?: number;
  awayPlatoonAdvantage?: number;
  homeLineupChangeScore?: number;
  awayLineupChangeScore?: number;
};

export type NormalizedLineupPlayer = {
  playerId: string;
  name: string;
  battingOrder?: number;
  positionCode?: string;
  positionName?: string;
  battingSide?: "L" | "R" | "S";
  status?: "ACTIVE" | "STARTING" | "BENCH" | "UNKNOWN";
};

export type NormalizedTeamLineup = {
  teamId?: string;
  teamName: string;
  confirmed: boolean;
  confirmationSource?: string;
  confirmedAt?: string;
  players: NormalizedLineupPlayer[];
  battingOrderComplete: boolean;
  expectedPlayerCount: number;
  actualPlayerCount: number;
  warnings: string[];
};

export type StarterVerificationResult = {
  team: "HOME" | "AWAY";
  probablePitcherId?: string;
  probablePitcherName?: string;
  confirmedPitcherId?: string;
  confirmedPitcherName?: string;
  status: "MATCHED" | "CHANGED" | "PROBABLE_ONLY" | "UNAVAILABLE" | "AMBIGUOUS";
  verifiedAt?: string;
  warnings: string[];
};

export type LineupComparisonResult = {
  addedPlayerIds: string[];
  removedPlayerIds: string[];
  battingOrderChanges: Array<{
    playerId: string;
    previousOrder?: number;
    currentOrder?: number;
  }>;
  positionChanges: Array<{
    playerId: string;
    previousPosition?: string;
    currentPosition?: string;
  }>;
  changed: boolean;
  detectedAt: string;
};

export type MlbLineupSnapshot = {
  id?: string;
  officialGameId: string;
  oddsEventId?: string;
  sport: "MLB";
  teamId?: string;
  teamName: string;
  side: "HOME" | "AWAY";
  gameDate?: string;
  gameStatus?: string;
  confirmed: boolean;
  battingOrderComplete: boolean;
  playerCount: number;
  battingOrder: NormalizedLineupPlayer[];
  lineupHash: string;
  source: "MLB_OFFICIAL";
  sourceUpdatedAt?: string;
  capturedAt: string;
  createdAt?: string;
};

export type MlbLineupChangeType =
  | "FIRST_CONFIRMED_LINEUP"
  | "PLAYER_ADDED"
  | "PLAYER_REMOVED"
  | "LATE_SCRATCH"
  | "BATTING_ORDER_CHANGE"
  | "POSITION_CHANGE"
  | "MULTIPLE_CHANGES"
  | "NO_MEANINGFUL_CHANGE";

export type MlbLineupChangePlayer = {
  playerId: string;
  name: string;
  battingOrder?: number;
  positionCode?: string;
};

export type MlbLineupChange = {
  id: string;
  officialGameId: string;
  oddsEventId?: string;
  teamId?: string;
  teamName: string;
  side: "HOME" | "AWAY";
  previousSnapshotId?: string;
  currentSnapshotId?: string;
  detectedAt: string;
  gameStartTime?: string;
  minutesBeforeStart?: number;
  changeType: MlbLineupChangeType;
  addedPlayers: MlbLineupChangePlayer[];
  removedPlayers: Array<{
    playerId: string;
    name: string;
    previousBattingOrder?: number;
    previousPositionCode?: string;
  }>;
  battingOrderChanges: Array<{
    playerId: string;
    name: string;
    previousOrder?: number;
    currentOrder?: number;
  }>;
  positionChanges: Array<{
    playerId: string;
    name: string;
    previousPosition?: string;
    currentPosition?: string;
  }>;
  verified: boolean;
  source: "MLB_OFFICIAL";
  warnings: string[];
};

export type MlbStarterVerificationSnapshot = {
  id?: string;
  officialGameId: string;
  oddsEventId?: string;
  teamId?: string;
  teamName: string;
  side: "HOME" | "AWAY";
  probablePitcherId?: string;
  probablePitcherName?: string;
  confirmedPitcherId?: string;
  confirmedPitcherName?: string;
  verificationStatus: StarterVerificationResult["status"];
  capturedAt: string;
  createdAt?: string;
  verificationHash: string;
};

export type MlbPlayerAvailabilityStatus =
  | "ACTIVE"
  | "AVAILABLE"
  | "PROBABLE"
  | "QUESTIONABLE"
  | "DAY_TO_DAY"
  | "OUT"
  | "INJURED_LIST"
  | "SUSPENDED"
  | "RESTRICTED"
  | "UNKNOWN";

export type MlbPlayerAvailabilityRecord = {
  playerId: string;
  playerName: string;
  teamId?: string;
  teamName?: string;
  status: MlbPlayerAvailabilityStatus;
  effectiveAt?: string;
  expectedReturn?: string;
  reason?: string;
  source?: FeatureSource;
  verified: boolean;
  metadata: SportsFeatureMetadata;
};

export type MlbPlayerAvailabilityFeatures = {
  metadata: SportsFeatureMetadata;
  homePlayers: MlbPlayerAvailabilityRecord[];
  awayPlayers: MlbPlayerAvailabilityRecord[];
  warnings: string[];
};

export type OffensiveRollingWindow = "last7" | "last14" | "last30";

export type OffensiveSampleQuality =
  | "SUFFICIENT"
  | "LIMITED"
  | "INSUFFICIENT"
  | "UNAVAILABLE";

export type OffensiveMetricBreakdown = {
  metric:
    | "hardHitRate"
    | "barrelRate"
    | "exitVelocity"
    | "walkRate"
    | "strikeoutRate"
    | "expectedBAOnContact"
    | "expectedSLGOnContact"
    | "expectedWOBAOnContact"
    | "expectedBattingAverage"
    | "expectedSlugging"
    | "expectedWeightedOnBaseAverage";
  rawValue: number;
  normalizedScore: number;
  weight: number;
  higherIsBetter: boolean;
};

export type OffensiveRollingFormWindow = {
  window: OffensiveRollingWindow;
  games: number;
  gamesRequested?: 7 | 14 | 30;
  gamesIncluded?: number;
  startDate?: string;
  endDate?: string;
  selectedGamePks?: string[];
  plateAppearances?: number;
  battedBallEvents?: number;
  rawRows?: number;
  uniquePlateAppearances?: number;
  terminalPlateAppearances?: number;
  wobaEligiblePlateAppearances?: number;
  untrackedBattedBallEvents?: number;
  statcastCoverage?: number;
  missingStatcastGames?: string[];
  hits?: number;
  walks?: number;
  intentionalWalks?: number;
  hitByPitches?: number;
  sacrifices?: number;
  strikeouts?: number;
  hardHitBalls?: number;
  barrels?: number;
  score?: number;
  hardHitRate?: number;
  barrelRate?: number;
  exitVelocity?: number;
  averageExitVelocity?: number;
  walkRate?: number;
  strikeoutRate?: number;
  expectedBattingAverage?: number;
  expectedSlugging?: number;
  expectedWeightedOnBaseAverage?: number;
  expectedBAOnContact?: number;
  expectedSLGOnContact?: number;
  expectedWOBAOnContact?: number;
  atlasExpectedOffenseRate?: number;
  xBA?: number;
  xSLG?: number;
  xwOBA?: number;
  sampleQuality?: OffensiveSampleQuality;
  scoreVersion?: string;
  baselineAsOf?: string;
  baselineVersion?: string;
  warnings?: string[];
  componentBreakdown: OffensiveMetricBreakdown[];
};

export type OffensiveTeamForm = {
  teamId?: string;
  teamName?: string;
  atlasOffensiveScore?: number;
  currentScore?: number;
  scoreTimestamp?: string;
  source?: FeatureSource;
  availability?: DataAvailability;
  scoreVersion?: string;
  baselineAsOf?: string;
  baselineVersion?: string;
  rollingWindows: Partial<Record<OffensiveRollingWindow, OffensiveRollingFormWindow>>;
  componentBreakdown: OffensiveMetricBreakdown[];
  last7Score?: number;
  last14Score?: number;
  last30Score?: number;
  hardHitRate?: number;
  barrelRate?: number;
  exitVelocity?: number;
  strikeoutRate?: number;
  walkRate?: number;
  xBA?: number;
  xSLG?: number;
  xWoba?: number;
};

export type OffensiveFormFeatures = {
  metadata: SportsFeatureMetadata;
  home?: OffensiveTeamForm;
  away?: OffensiveTeamForm;
  formAdvantage?: MlbTeamSide;
};

export type MlbBullpenWorkloadAvailability =
  | "FRESH"
  | "AVAILABLE"
  | "LIMITED"
  | "HEAVY"
  | "UNKNOWN";

export type MlbRelieverAppearance = {
  officialGameId: string;
  gameDate: string;
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string;
  inningsPitched?: number;
  pitchesThrown?: number;
  battersFaced?: number;
  hitsAllowed?: number;
  walksAllowed?: number;
  strikeouts?: number;
  runsAllowed?: number;
  earnedRunsAllowed?: number;
  save?: boolean;
  hold?: boolean;
  blownSave?: boolean;
  gameFinished?: boolean;
  startedGame: boolean;
  reliefAppearance: boolean;
  source: "MLB_OFFICIAL";
  warnings: string[];
};

export type MlbRelieverWorkload = {
  playerId: string;
  playerName: string;
  appearancesLast1Day: number;
  appearancesLast2Days: number;
  appearancesLast3Days: number;
  appearancesLast7Days: number;
  pitchesLast1Day?: number;
  pitchesLast2Days?: number;
  pitchesLast3Days?: number;
  pitchesLast7Days?: number;
  inningsLast3Days?: number;
  inningsLast7Days?: number;
  consecutiveDaysUsed: number;
  lastAppearanceAt?: string;
  workloadAvailability: MlbBullpenWorkloadAvailability;
  workloadScore?: number;
  warnings: string[];
};

export type MlbBullpenRoleEvidence =
  | "SAVES"
  | "HOLDS"
  | "GAME_FINISHES"
  | "LATE_INNING_USAGE";

export type BullpenFatigueComponent = {
  component: string;
  rawValue?: number;
  normalizedScore: number;
  weight: number;
  warnings?: string[];
};

export type MlbTeamBullpenFeatures = {
  teamId: string;
  teamName: string;
  relievers: MlbRelieverWorkload[];
  totalAppearancesLast3Days: number;
  totalPitchesLast3Days?: number;
  totalInningsLast3Days?: number;
  relieversUsedLast1Day: number;
  relieversUsedLast2Days: number;
  relieversUsedLast3Days: number;
  relieversOnConsecutiveDays: number;
  relieversWithHeavyWorkload: number;
  closerCandidate?: {
    playerId: string;
    playerName: string;
    identificationMethod: "RECENT_SAVES" | "RECENT_GAME_FINISHES" | "ROLE_FEED" | "UNKNOWN";
    workloadAvailability: MlbBullpenWorkloadAvailability;
  };
  highLeverageRelievers: Array<{
    playerId: string;
    playerName: string;
    roleEvidence: MlbBullpenRoleEvidence;
    workloadAvailability: MlbBullpenWorkloadAvailability;
  }>;
  fatigueScore?: number;
  fatigueScoreVersion?: string;
  fatigueComponents?: BullpenFatigueComponent[];
  qualityScore?: number;
  inningsLast3Days?: number;
  pitchesLast3Days?: number;
  closerAvailable?: boolean;
  highLeverageArmsAvailable?: number;
  metadata: SportsFeatureMetadata & {
    gamesRequested?: number;
    gamesIncluded?: number;
    missingGames?: number;
    appearancesIncluded?: number;
    appearancesMissingPitchCounts?: number;
    completenessPercentage?: number;
  };
  warnings: string[];
};

export type BullpenSideFeatures = MlbTeamBullpenFeatures & {
  inningsLast3Days?: number;
  pitchesLast3Days?: number;
  closerAvailable?: boolean;
  highLeverageArmsAvailable?: number;
};

export type BullpenFeatures = {
  metadata: SportsFeatureMetadata;
  home?: BullpenSideFeatures;
  away?: BullpenSideFeatures;
  fatigueAdvantage?: MlbTeamSide;
  qualityAdvantage?: MlbTeamSide;
  bullpenAdvantage?: MlbTeamSide;
  overallAvailability?: DataAvailability;
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
  playerAvailability: MlbPlayerAvailabilityFeatures;
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
