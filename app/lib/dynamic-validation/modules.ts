import { calculateAppliedScore } from "./score-calculator";
import type {
  DynamicValidationDirection,
  DynamicValidationModuleDefinition,
  DynamicValidationModuleId,
  DynamicValidationResult,
} from "./types";

/**
 * DVE module registry.
 *
 * These definitions reserve the module slots that future sports logic will
 * implement. Modules can evaluate different sport data internally, but every
 * module must output only POSITIVE, NEGATIVE, or NEUTRAL plus an applied score.
 */
export const DYNAMIC_VALIDATION_MODULES: ReadonlyArray<DynamicValidationModuleDefinition> = Object.freeze([
  Object.freeze({ id: "line_movement", label: "Line Movement", weight: 2, enabled: false }),
  Object.freeze({ id: "odds_movement", label: "Odds Movement", weight: 2, enabled: false }),
  Object.freeze({ id: "pitcher", label: "Pitcher", weight: 3, enabled: false }),
  Object.freeze({ id: "bullpen", label: "Bullpen", weight: 2, enabled: false }),
  Object.freeze({ id: "roster", label: "Roster", weight: 2, enabled: false }),
  Object.freeze({ id: "weather", label: "Weather", weight: 1.5, enabled: false }),
  Object.freeze({ id: "injury", label: "Injury", weight: 2.5, enabled: false }),
  Object.freeze({ id: "sharp_money", label: "Sharp Money", weight: 3, enabled: false }),
  Object.freeze({ id: "closing_line", label: "Closing Line", weight: 2, enabled: false }),
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
