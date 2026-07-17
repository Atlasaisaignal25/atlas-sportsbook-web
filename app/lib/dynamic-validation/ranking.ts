import type { DynamicValidatedSignal } from "./types";

function startTimeValue(signal: DynamicValidatedSignal) {
  const parsed = Date.parse(signal.timestamp ?? "");
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

/**
 * Dynamic ranking always sorts by Current Confidence.
 * Base Confidence is preserved for audit, but never owns final DVE ranking.
 */
export function rankByCurrentConfidence(signals: ReadonlyArray<DynamicValidatedSignal>) {
  return signals
    .slice()
    .sort((a, b) => {
      const confidenceDiff = b.currentConfidence - a.currentConfidence;
      if (confidenceDiff !== 0) return confidenceDiff;

      const baseDiff = b.baseConfidence - a.baseConfidence;
      if (baseDiff !== 0) return baseDiff;

      const sourceRankDiff = (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
      if (sourceRankDiff !== 0) return sourceRankDiff;

      return startTimeValue(a) - startTimeValue(b);
    })
    .map((signal, index) => Object.freeze({
      ...signal,
      dynamicRank: index + 1,
    }));
}

export function selectDynamicTopSignal(signals: ReadonlyArray<DynamicValidatedSignal>) {
  return signals[0] ?? null;
}

export function selectDynamicPremium(signals: ReadonlyArray<DynamicValidatedSignal>) {
  return Object.freeze(signals.slice(1, 4));
}

export function selectDynamicUnlimited(signals: ReadonlyArray<DynamicValidatedSignal>) {
  return Object.freeze(signals.slice());
}
