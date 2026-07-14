import { buildFinancialPlan, roundCurrency } from "./engine";
import { calculateAmericanOddsProfit } from "./result-engine";
import { normalizeBankrollConfig, saveBankrollConfig } from "./storage";
import { calculateManualStats, normalizeManualTracking } from "./manual-tracking-engine";
import type {
  AtlasPlanFinalResult,
  BankrollConfig,
  ManualFinancialState,
  ManualPickTimelineEvent,
  ManualTrackedPick,
  ManualTrackingCollection,
} from "./types";

export type ProcessManualResultOptions = {
  pickId: string;
  settledAt?: string;
};

export function processManualResult(
  config: BankrollConfig,
  result: AtlasPlanFinalResult,
  options: ProcessManualResultOptions,
): BankrollConfig {
  const settledAt = options.settledAt ?? new Date().toISOString();
  const manualTracking = normalizeManualTracking(config.manualTracking, config.updatedAt, config.currentBankroll);
  const targetPick = manualTracking.picks.find((pick) => pick.id === options.pickId);

  if (!targetPick || isManualPickFinal(targetPick)) return config;

  const resultProfit = calculateManualResultProfit(targetPick, result);
  const financialState = updateManualFinancialState(manualTracking.manualFinancialState, resultProfit, settledAt);
  const completedPick = updateManualPickResult(targetPick, result, resultProfit, financialState, settledAt);
  const updatedTracking = updateManualTracking(manualTracking, completedPick, financialState, settledAt);

  return normalizeBankrollConfig({
    ...config,
    manualTracking: updatedTracking,
    updatedAt: settledAt,
  });
}

export function persistManualTracking(
  config: BankrollConfig,
  result: AtlasPlanFinalResult,
  options: ProcessManualResultOptions,
) {
  const nextConfig = processManualResult(config, result, options);
  saveBankrollConfig(nextConfig);
  return nextConfig;
}

export function applyManualWin(pick: ManualTrackedPick) {
  return calculateAmericanOddsProfit(pick.riskAmount, pick.odds ?? 0);
}

export function applyManualLoss(pick: ManualTrackedPick) {
  return roundCurrency(-Math.max(0, pick.riskAmount));
}

export function applyManualPush() {
  return 0;
}

export function applyManualCancelled() {
  return 0;
}

export function updateManualFinancialState(
  state: ManualFinancialState,
  resultProfit: number,
  updatedAt = new Date().toISOString(),
): ManualFinancialState {
  const nextBankroll = roundCurrency(Math.max(0, state.currentBankroll + resultProfit));
  const financialPlan = buildFinancialPlan({
    initialBankroll: state.initialBankroll,
    currentBankroll: nextBankroll,
    recommendedUnit: state.recommendedUnit,
    profile: "atlas_recommended",
    createdAt: state.createdAt,
    updatedAt,
  });

  return {
    initialBankroll: financialPlan.state.initialBankroll,
    currentBankroll: financialPlan.metrics.currentBankroll,
    recommendedUnit: financialPlan.metrics.recommendedUnit,
    profit: financialPlan.metrics.profit,
    roi: financialPlan.metrics.roi.value,
    createdAt: state.createdAt,
    updatedAt,
  };
}

export function updateManualTracking(
  collection: ManualTrackingCollection,
  completedPick: ManualTrackedPick,
  financialState: ManualFinancialState,
  updatedAt = new Date().toISOString(),
): ManualTrackingCollection {
  const picks = collection.picks.map((pick) => (pick.id === completedPick.id ? completedPick : pick));
  const manualTimeline = [
    ...(collection.manualTimeline ?? []),
    createManualTimelineEvent("result_registered", completedPick.status, "Result Registered", updatedAt),
    createManualTimelineEvent("manual_bankroll_updated", completedPick.status, "Manual Bankroll Updated", updatedAt),
  ];
  const normalized = normalizeManualTracking({
    ...collection,
    picks,
    updatedAt,
    manualFinancialState: financialState,
    manualTimeline,
  }, updatedAt, financialState.currentBankroll);

  return {
    ...normalized,
    manualFinancialState: financialState,
    stats: calculateManualStats(normalized.picks, financialState),
    manualStats: calculateManualStats(normalized.picks, financialState),
  };
}

export function calculateManualResultProfit(pick: ManualTrackedPick, result: AtlasPlanFinalResult) {
  if (result === "won") return applyManualWin(pick);
  if (result === "lost") return applyManualLoss(pick);
  if (result === "push") return applyManualPush();
  return applyManualCancelled();
}

function updateManualPickResult(
  pick: ManualTrackedPick,
  result: AtlasPlanFinalResult,
  profit: number,
  financialState: ManualFinancialState,
  settledAt: string,
): ManualTrackedPick {
  const timeline = [
    ...pick.timeline,
    createManualTimelineEvent("event_started", "started", "Event Started", settledAt),
    createManualTimelineEvent("result_registered", result, "Result Registered", settledAt),
    createManualTimelineEvent("manual_bankroll_updated", result, "Manual Bankroll Updated", settledAt),
  ];

  return {
    ...pick,
    status: result,
    result,
    profit,
    riskPercentage: financialState.currentBankroll > 0 ? pick.riskPercentage : pick.riskPercentage,
    updatedAt: settledAt,
    completedAt: settledAt,
    timeline,
  };
}

function createManualTimelineEvent(
  type: string,
  status: ManualPickTimelineEvent["status"],
  description: string,
  createdAt: string,
): ManualPickTimelineEvent {
  return {
    id: `manual-${type}-${createdAt.replace(/\D/g, "")}`,
    type,
    status,
    message: description,
    description,
    createdAt,
  };
}

function isManualPickFinal(pick: ManualTrackedPick) {
  return pick.result === "won" || pick.result === "lost" || pick.result === "push" || pick.result === "cancelled";
}
