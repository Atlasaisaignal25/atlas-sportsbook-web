import type { AtlasProductSignal } from "../product-normalization";
import { createNeutralValidationResult, createValidationResult, UNIVERSAL_LINE_MOVEMENT_SPORTS } from "./modules";
import type {
  DynamicValidationDirection,
  DynamicValidationResult,
  DynamicValidationSupportedSport,
} from "./types";

export type LineMovementSnapshot = {
  openingLine?: number | string | null;
  currentLine?: number | string | null;
  previousLine?: number | string | null;
  timestamp?: string | null;
};

export type LineMovementEvaluationInput = {
  signal: AtlasProductSignal;
  movement?: LineMovementSnapshot | null;
  timestamp?: string;
};

const MODULE_ID = "line_movement";
const INSIGNIFICANT_LINE_DELTA = 0.01;

/**
 * Universal Line Movement Validation Module.
 *
 * This module is intentionally sport-agnostic. It supports every current Atlas
 * sport listed in UNIVERSAL_LINE_MOVEMENT_SPORTS and returns NEUTRAL whenever a
 * sport or market does not have usable line movement data. It never generates,
 * removes, or mutates picks. It only emits a POSITIVE, NEGATIVE, or NEUTRAL
 * validation result for the Dynamic Validation Engine.
 */
export function evaluateLineMovementValidation(params: LineMovementEvaluationInput): DynamicValidationResult {
  const timestamp = params.timestamp ?? params.movement?.timestamp ?? new Date().toISOString();
  const sport = normalizeSport(params.signal.sport);

  if (!isLineMovementSupportedSport(sport)) {
    return createNeutralValidationResult(MODULE_ID, timestamp, `Line movement is not supported for ${params.signal.sport || "UNKNOWN"}.`);
  }

  const openingLine = numberOrNull(params.movement?.openingLine);
  const currentLine = numberOrNull(params.movement?.currentLine);

  if (openingLine === null || currentLine === null) {
    return createNeutralValidationResult(MODULE_ID, timestamp, "Line movement data unavailable.");
  }

  const delta = currentLine - openingLine;
  if (Math.abs(delta) <= INSIGNIFICANT_LINE_DELTA) {
    return createNeutralValidationResult(MODULE_ID, timestamp, "Line movement is insignificant.");
  }

  const direction = getLineMovementDirection(params.signal, delta);
  if (direction === "NEUTRAL") {
    return createNeutralValidationResult(MODULE_ID, timestamp, "Market type does not provide actionable line movement.");
  }

  return createValidationResult({
    moduleId: MODULE_ID,
    direction,
    reason: direction === "POSITIVE"
      ? `Line moved in favor of ${params.signal.selection}.`
      : `Line moved against ${params.signal.selection}.`,
    timestamp,
  });
}

export function isLineMovementSupportedSport(sport: string): sport is DynamicValidationSupportedSport {
  return UNIVERSAL_LINE_MOVEMENT_SPORTS.includes(normalizeSport(sport) as DynamicValidationSupportedSport);
}

function getLineMovementDirection(signal: AtlasProductSignal, delta: number): DynamicValidationDirection {
  const market = normalizeText(signal.market);
  const selection = normalizeText(signal.selection);

  if (isTotalMarket(market, selection)) {
    if (selection.includes("over")) return delta < 0 ? "POSITIVE" : "NEGATIVE";
    if (selection.includes("under")) return delta > 0 ? "POSITIVE" : "NEGATIVE";
    return "NEUTRAL";
  }

  if (isSpreadMarket(market, selection)) {
    const pickLine = numberOrNull(signal.line) ?? parseLineFromSelection(selection);
    if (pickLine === null) return "NEUTRAL";

    if (pickLine < 0) return delta > 0 ? "POSITIVE" : "NEGATIVE";
    if (pickLine > 0) return delta < 0 ? "POSITIVE" : "NEGATIVE";
  }

  return "NEUTRAL";
}

function isTotalMarket(market: string, selection: string) {
  return market.includes("total") || selection.includes("over") || selection.includes("under");
}

function isSpreadMarket(market: string, selection: string) {
  return market.includes("spread") || /(^|\s)[+-]\d+(\.\d+)?($|\s|\))/.test(selection);
}

function parseLineFromSelection(selection: string) {
  const match = selection.match(/[+-]\d+(\.\d+)?/);
  return match ? numberOrNull(match[0]) : null;
}

function normalizeSport(sport: string) {
  const normalized = String(sport ?? "").trim().toUpperCase();
  if (normalized === "SOCCER" || normalized === "FOOTBALL_SOCCER") return "SOCCER";
  return normalized;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
