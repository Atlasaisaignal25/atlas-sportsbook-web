import { calculateAppliedScore } from "./score-calculator";
import type {
  DynamicValidationDirection,
  DynamicValidationModuleDefinition,
  DynamicValidationModuleId,
  DynamicValidationResult,
  DynamicValidationSupportedSport,
} from "./types";

/**
 * DVE module registry.
 *
 * These definitions reserve the module slots that future sports logic will
 * implement. Modules can evaluate different sport data internally, but every
 * module must output only POSITIVE, NEGATIVE, or NEUTRAL plus an applied score.
 */
export const UNIVERSAL_LINE_MOVEMENT_SPORTS: ReadonlyArray<DynamicValidationSupportedSport> = Object.freeze([
  "MLB",
  "SOCCER",
  "NBA",
  "NFL",
  "NHL",
  "NCAAB",
  "NCAAF",
]);

const FUTURE_MODULE_SPORTS = UNIVERSAL_LINE_MOVEMENT_SPORTS;

export const DYNAMIC_VALIDATION_MODULES: ReadonlyArray<DynamicValidationModuleDefinition> = Object.freeze([
  Object.freeze({
    id: "line_movement",
    label: "Line Movement",
    weight: 2,
    enabled: true,
    supportedSports: UNIVERSAL_LINE_MOVEMENT_SPORTS,
    execution: "market_data_available",
    description: "Universal module. Evaluates market line movement for every supported Atlas sport and returns NEUTRAL when line data is unavailable.",
  }),
  Object.freeze({ id: "odds_movement", label: "Odds Movement", weight: 2, enabled: false, supportedSports: FUTURE_MODULE_SPORTS, execution: "manual", description: "Reserved for a future universal odds movement module." }),
  Object.freeze({ id: "pitcher", label: "Pitcher", weight: 3, enabled: false, supportedSports: FUTURE_MODULE_SPORTS, execution: "manual", description: "Reserved for future sport-aware starter validation." }),
  Object.freeze({ id: "bullpen", label: "Bullpen", weight: 2, enabled: false, supportedSports: FUTURE_MODULE_SPORTS, execution: "manual", description: "Reserved for future bullpen validation." }),
  Object.freeze({ id: "roster", label: "Roster", weight: 2, enabled: false, supportedSports: FUTURE_MODULE_SPORTS, execution: "manual", description: "Reserved for future roster validation." }),
  Object.freeze({ id: "weather", label: "Weather", weight: 1.5, enabled: false, supportedSports: FUTURE_MODULE_SPORTS, execution: "manual", description: "Reserved for future weather validation." }),
  Object.freeze({ id: "injury", label: "Injury", weight: 2.5, enabled: false, supportedSports: FUTURE_MODULE_SPORTS, execution: "manual", description: "Reserved for future injury validation." }),
  Object.freeze({ id: "sharp_money", label: "Sharp Money", weight: 3, enabled: false, supportedSports: FUTURE_MODULE_SPORTS, execution: "manual", description: "Reserved for future sharp money validation." }),
  Object.freeze({ id: "closing_line", label: "Closing Line", weight: 2, enabled: false, supportedSports: FUTURE_MODULE_SPORTS, execution: "manual", description: "Reserved for future closing line validation." }),
]);

export function getDynamicValidationModule(moduleId: DynamicValidationModuleId) {
  return DYNAMIC_VALIDATION_MODULES.find((module) => module.id === moduleId) ?? null;
}

export function createValidationResult(params: {
  moduleId: DynamicValidationModuleId;
  direction: DynamicValidationDirection;
  reason: string;
  timestamp: string;
  weight?: number;
}): DynamicValidationResult {
  const definition = getDynamicValidationModule(params.moduleId);
  const weight = params.weight ?? definition?.weight ?? 0;

  return Object.freeze({
    moduleId: params.moduleId,
    direction: params.direction,
    reason: params.reason,
    timestamp: params.timestamp,
    appliedScore: calculateAppliedScore(params.direction, weight),
    weight,
  });
}

export function createNeutralValidationResult(moduleId: DynamicValidationModuleId, timestamp: string, reason = "Module prepared. No dynamic adjustment applied."): DynamicValidationResult {
  return createValidationResult({
    moduleId,
    direction: "NEUTRAL",
    reason,
    timestamp,
  });
}
