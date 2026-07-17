import type {
  DynamicValidationResult,
  DynamicValidationTimelineEvent,
  DynamicValidatedSignal,
} from "./types";

function eventId(signalId: string, type: string, timestamp: string, moduleId = "system") {
  return `${signalId}-${type}-${moduleId}-${timestamp}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function createGeneratedTimelineEvent(params: {
  signalId: string;
  timestamp: string;
  baseConfidence: number;
}): DynamicValidationTimelineEvent {
  return Object.freeze({
    id: eventId(params.signalId, "generated", params.timestamp),
    signalId: params.signalId,
    type: "generated",
    timestamp: params.timestamp,
    label: "Generated",
    baseConfidence: params.baseConfidence,
    dynamicScore: 0,
    currentConfidence: params.baseConfidence,
  });
}

export function createValidationTimelineEvent(params: {
  signalId: string;
  validation: DynamicValidationResult;
  baseConfidence: number;
  dynamicScore: number;
  currentConfidence: number;
}): DynamicValidationTimelineEvent {
  return Object.freeze({
    id: eventId(params.signalId, "validation_applied", params.validation.timestamp, params.validation.moduleId),
    signalId: params.signalId,
    type: "validation_applied",
    timestamp: params.validation.timestamp,
    label: "Validation Applied",
    baseConfidence: params.baseConfidence,
    dynamicScore: params.dynamicScore,
    currentConfidence: params.currentConfidence,
    moduleId: params.validation.moduleId,
    direction: params.validation.direction,
    reason: params.validation.reason,
  });
}

export function createRankingTimelineEvent(signal: DynamicValidatedSignal, timestamp: string): DynamicValidationTimelineEvent {
  return Object.freeze({
    id: eventId(signal.signalId, "ranking_updated", timestamp),
    signalId: signal.signalId,
    type: "ranking_updated",
    timestamp,
    label: "Ranking Updated",
    baseConfidence: signal.baseConfidence,
    dynamicScore: signal.dynamicScore,
    currentConfidence: signal.currentConfidence,
    reason: `Dynamic rank ${signal.dynamicRank}`,
  });
}
