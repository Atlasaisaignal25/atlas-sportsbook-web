import {
  calculateCurrentConfidence,
  calculateDynamicScore,
  clampConfidence,
} from "./score-calculator";
import {
  createGeneratedTimelineEvent,
  createRankingTimelineEvent,
  createValidationTimelineEvent,
} from "./timeline";
import {
  rankByCurrentConfidence,
  selectDynamicPremium,
  selectDynamicTopSignal,
  selectDynamicUnlimited,
} from "./ranking";
import type {
  DynamicValidatedSignal,
  DynamicValidationInput,
  DynamicValidationRun,
} from "./types";

function confidenceNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildDynamicValidatedSignal(input: DynamicValidationInput, now = new Date().toISOString()): DynamicValidatedSignal {
  const baseConfidence = clampConfidence(input.baseConfidence);
  const validations = Object.freeze((input.validations ?? []).map((validation) => Object.freeze({ ...validation })));
  const dynamicScore = calculateDynamicScore(validations);
  const currentConfidence = calculateCurrentConfidence(baseConfidence, dynamicScore);
  const baseTimeline = input.timeline?.length
    ? input.timeline
    : [createGeneratedTimelineEvent({ signalId: input.signal.signalId, timestamp: input.signal.timestamp ?? now, baseConfidence })];

  const validationTimeline = validations.map((validation) =>
    createValidationTimelineEvent({
      signalId: input.signal.signalId,
      validation,
      baseConfidence,
      dynamicScore,
      currentConfidence,
    }),
  );

  return Object.freeze({
    ...input.signal,
    baseConfidence,
    dynamicScore,
    currentConfidence,
    dynamicRank: input.signal.rank ?? Number.MAX_SAFE_INTEGER,
    validations,
    timeline: Object.freeze([...baseTimeline, ...validationTimeline]),
  });
}

export function createDynamicValidationInput(signal: DynamicValidationInput["signal"], validations: DynamicValidationInput["validations"] = []): DynamicValidationInput {
  return {
    signal,
    baseConfidence: confidenceNumber(signal.confidence ?? signal.internalScore),
    validations,
  };
}

export function runDynamicValidation(inputs: ReadonlyArray<DynamicValidationInput>, now = new Date().toISOString()): DynamicValidationRun {
  const validated = inputs.map((input) => buildDynamicValidatedSignal(input, now));
  const ranked = rankByCurrentConfidence(validated).map((signal) => Object.freeze({
    ...signal,
    timeline: Object.freeze([...signal.timeline, createRankingTimelineEvent(signal, now)]),
  }));

  return Object.freeze({
    runId: `dve-${now.replace(/\D/g, "")}`,
    createdAt: now,
    signals: Object.freeze(ranked),
    topSignal: selectDynamicTopSignal(ranked),
    premium: selectDynamicPremium(ranked),
    unlimited: selectDynamicUnlimited(ranked),
  });
}
