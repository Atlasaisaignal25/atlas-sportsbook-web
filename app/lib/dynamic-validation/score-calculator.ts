import type { DynamicValidationDirection, DynamicValidationResult } from "./types";

const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 100;

export function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return MIN_CONFIDENCE;
  return Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, Math.round(value * 100) / 100));
}

export function directionMultiplier(direction: DynamicValidationDirection) {
  if (direction === "POSITIVE") return 1;
  if (direction === "NEGATIVE") return -1;
  return 0;
}

export function calculateAppliedScore(direction: DynamicValidationDirection, weight: number) {
  if (!Number.isFinite(weight) || weight < 0) return 0;
  return directionMultiplier(direction) * weight;
}

export function calculateDynamicScore(validations: ReadonlyArray<DynamicValidationResult>) {
  return Math.round(validations.reduce((total, validation) => total + validation.appliedScore, 0) * 100) / 100;
}

export function calculateCurrentConfidence(baseConfidence: number, dynamicScore: number) {
  return clampConfidence(baseConfidence + dynamicScore);
}
