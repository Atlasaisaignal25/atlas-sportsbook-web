import type { AtlasProductSignal } from "../product-normalization";

export type DynamicValidationDirection = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export type DynamicValidationModuleId =
  | "line_movement"
  | "odds_movement"
  | "pitcher"
  | "bullpen"
  | "roster"
  | "weather"
  | "injury"
  | "sharp_money"
  | "closing_line";

export type DynamicValidationSupportedSport =
  | "MLB"
  | "SOCCER"
  | "NBA"
  | "NFL"
  | "NHL"
  | "NCAAB"
  | "NCAAF";

export type DynamicValidationModuleDefinition = {
  id: DynamicValidationModuleId;
  label: string;
  weight: number;
  enabled: boolean;
  supportedSports: ReadonlyArray<DynamicValidationSupportedSport>;
  execution: "market_data_available" | "pregame_only" | "manual";
  description: string;
};

export type DynamicValidationResult = {
  moduleId: DynamicValidationModuleId;
  direction: DynamicValidationDirection;
  reason: string;
  timestamp: string;
  appliedScore: number;
  weight: number;
};

export type DynamicValidationTimelineEventType =
  | "generated"
  | "validation_applied"
  | "ranking_updated";

export type DynamicValidationTimelineEvent = {
  id: string;
  signalId: string;
  type: DynamicValidationTimelineEventType;
  timestamp: string;
  label: string;
  baseConfidence: number;
  dynamicScore: number;
  currentConfidence: number;
  moduleId?: DynamicValidationModuleId;
  direction?: DynamicValidationDirection;
  reason?: string;
};

export type DynamicValidationInput = {
  signal: AtlasProductSignal;
  baseConfidence: number;
  validations?: DynamicValidationResult[];
  timeline?: DynamicValidationTimelineEvent[];
};

export type DynamicValidatedSignal = AtlasProductSignal & {
  baseConfidence: number;
  dynamicScore: number;
  currentConfidence: number;
  dynamicRank: number;
  validations: ReadonlyArray<DynamicValidationResult>;
  timeline: ReadonlyArray<DynamicValidationTimelineEvent>;
};

export type DynamicValidationRun = {
  runId: string;
  createdAt: string;
  signals: ReadonlyArray<DynamicValidatedSignal>;
  topSignal: DynamicValidatedSignal | null;
  premium: ReadonlyArray<DynamicValidatedSignal>;
  unlimited: ReadonlyArray<DynamicValidatedSignal>;
};
