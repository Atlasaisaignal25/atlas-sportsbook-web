import { buildFinancialPlan, roundCurrency } from "./engine";
import { calculateAmericanOddsProfit } from "./result-engine";
import { normalizeBankrollConfig, saveBankrollConfig } from "./storage";
import { calculateManualStats, loadAvailableAtlasPicks, normalizeManualTracking } from "./manual-tracking-engine";
import type {
  AtlasTrackingPickOption,
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
  availableAtlasPicks?: AtlasTrackingPickOption[];
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

  const atlasPicks = options.availableAtlasPicks ?? loadAvailableAtlasPicks(config, settledAt);
  const syncResult = validateAndSyncLinkedPick(targetPick, atlasPicks, settledAt);
  const syncedTracking = replaceManualPick(manualTracking, syncResult.pick, settledAt);

  if (!syncResult.valid || isNonFinancialAtlasStatus(syncResult.atlasPick?.status)) {
    return normalizeBankrollConfig({
      ...config,
      manualTracking: syncedTracking,
      updatedAt: settledAt,
    });
  }

  const syncedPick = syncResult.pick;
  if (isManualPickFinal(syncedPick)) {
    return normalizeBankrollConfig({
      ...config,
      manualTracking: syncedTracking,
      updatedAt: settledAt,
    });
  }

  const resultSyncKey = createResultSyncKey(syncedPick, result, settledAt);
  if (syncedPick.resultSyncKey === resultSyncKey || hasTimelineEvent(syncedPick.timeline, resultSyncKey)) {
    return normalizeBankrollConfig({
      ...config,
      manualTracking: syncedTracking,
      updatedAt: settledAt,
    });
  }

  const resultProfit = calculateManualResultProfit(syncedPick, result);
  const financialState = updateManualFinancialState(syncedTracking.manualFinancialState, resultProfit, settledAt);
  const completedPick = updateManualPickResult(syncedPick, result, resultProfit, financialState, settledAt, resultSyncKey);
  const updatedTracking = updateManualTracking(syncedTracking, completedPick, financialState, settledAt);

  return normalizeBankrollConfig({
    ...config,
    manualTracking: updatedTracking,
    updatedAt: settledAt,
  });
}

export function syncManualTrackingWithAtlas(
  config: BankrollConfig,
  availableAtlasPicks = loadAvailableAtlasPicks(config),
  syncedAt = new Date().toISOString(),
): BankrollConfig {
  const manualTracking = normalizeManualTracking(config.manualTracking, config.updatedAt, config.currentBankroll);

  return manualTracking.picks.reduce((currentConfig, pick) => {
    if (isManualPickFinal(pick)) return currentConfig;

    const syncedCollection = normalizeManualTracking(currentConfig.manualTracking, currentConfig.updatedAt, currentConfig.currentBankroll);
    const currentPick = syncedCollection.picks.find((candidate) => candidate.id === pick.id);
    if (!currentPick) return currentConfig;

    const syncResult = validateAndSyncLinkedPick(currentPick, availableAtlasPicks, syncedAt);
    const nextConfig = normalizeBankrollConfig({
      ...currentConfig,
      manualTracking: replaceManualPick(syncedCollection, syncResult.pick, syncedAt),
      updatedAt: syncedAt,
    });

    if (!syncResult.valid || !syncResult.atlasPick) return nextConfig;
    if (syncResult.atlasPick.status === "started") return nextConfig;
    if (!isFinalManualStatus(syncResult.atlasPick.status)) return nextConfig;

    return processManualResult(nextConfig, syncResult.atlasPick.status, {
      pickId: syncResult.pick.id,
      settledAt: syncResult.atlasPick.completedAt ?? syncedAt,
      availableAtlasPicks,
    });
  }, config);
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
  return calculateAmericanOddsProfit(pick.riskAmount, pick.trackedOdds ?? pick.odds ?? 0);
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
  resultSyncKey: string,
): ManualTrackedPick {
  const timeline = [
    ...pick.timeline,
    ...createMissingTimelineEvents(
      pick.timeline,
      [
        createManualTimelineEvent("event_started", "started", "Event Started", settledAt),
        createManualTimelineEvent("result_synced_from_atlas", result, "Result Synced from Atlas", settledAt, { syncKey: resultSyncKey }),
        createManualTimelineEvent("manual_bankroll_updated", result, "Manual Bankroll Updated", settledAt, { syncKey: resultSyncKey }),
      ],
    ),
  ];

  return {
    ...pick,
    status: result,
    result,
    profit,
    riskPercentage: financialState.currentBankroll > 0 ? pick.riskPercentage : pick.riskPercentage,
    locked: true,
    trackingState: "active",
    resultSyncKey,
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
  metadata?: ManualPickTimelineEvent["metadata"],
): ManualPickTimelineEvent {
  return {
    id: `manual-${type}-${createdAt.replace(/\D/g, "")}-${metadata?.syncKey ?? ""}`,
    type,
    status,
    message: description,
    description,
    createdAt,
    metadata,
  };
}

function isManualPickFinal(pick: ManualTrackedPick) {
  return pick.result === "won" || pick.result === "lost" || pick.result === "push" || pick.result === "cancelled";
}

function validateAndSyncLinkedPick(
  pick: ManualTrackedPick,
  atlasPicks: AtlasTrackingPickOption[],
  syncedAt: string,
): { valid: boolean; pick: ManualTrackedPick; atlasPick: AtlasTrackingPickOption | null } {
  if (!pick.linkedAtlasPickId) {
    return {
      valid: false,
      atlasPick: null,
      pick: appendTimelineEvent(
        {
          ...pick,
          trackingState: "legacy_unlinked",
          locked: Boolean(pick.locked || pick.result),
          updatedAt: syncedAt,
        },
        createManualTimelineEvent("legacy_unlinked", pick.status, "Legacy Unlinked Manual Pick", syncedAt),
      ),
    };
  }

  const atlasPick = atlasPicks.find((candidate) => candidate.id === pick.linkedAtlasPickId) ?? null;
  if (!atlasPick) {
    return {
      valid: false,
      atlasPick,
      pick: appendTimelineEvent(
        {
          ...pick,
          trackingState: "linked_pick_invalid",
          updatedAt: syncedAt,
        },
        createManualTimelineEvent("linked_pick_invalid", pick.status, "Archived Atlas Pick", syncedAt, { linkedAtlasPickId: pick.linkedAtlasPickId }),
      ),
    };
  }

  return {
    valid: true,
    atlasPick,
    pick: syncImmutableAtlasFields(pick, atlasPick, syncedAt),
  };
}

function syncImmutableAtlasFields(pick: ManualTrackedPick, atlasPick: AtlasTrackingPickOption, syncedAt: string): ManualTrackedPick {
  const atlasFields = {
    sport: atlasPick.sport,
    league: atlasPick.league,
    eventId: atlasPick.eventId,
    homeTeam: atlasPick.homeTeam,
    awayTeam: atlasPick.awayTeam,
    eventDate: atlasPick.eventDate,
    eventTime: atlasPick.eventTime,
    startTime: atlasPick.startTime,
    market: atlasPick.market,
    selection: atlasPick.selection,
    atlasSource: atlasPick.source,
    rank: atlasPick.rank,
  };
  const needsResync = Object.entries(atlasFields).some(([key, value]) => pick[key as keyof ManualTrackedPick] !== value);
  const nextStatus = atlasPick.status === "started" && !isManualPickFinal(pick) ? "started" : pick.status;
  const nextPick: ManualTrackedPick = {
    ...pick,
    ...atlasFields,
    odds: pick.trackedOdds ?? pick.odds ?? atlasPick.odds,
    trackedOdds: pick.trackedOdds ?? pick.odds ?? atlasPick.odds,
    status: nextStatus,
    locked: Boolean(pick.locked || atlasPick.status === "started" || isManualPickFinal(pick)),
    trackingState: "active",
    updatedAt: needsResync || nextStatus !== pick.status ? syncedAt : pick.updatedAt,
  };
  const withResyncEvent = needsResync
    ? appendTimelineEvent(nextPick, createManualTimelineEvent("linked_atlas_pick_data_resynced", nextStatus, "Linked Atlas Pick Data Resynced", syncedAt, { linkedAtlasPickId: atlasPick.id }))
    : nextPick;

  if (atlasPick.status === "started") {
    return appendTimelineEvent(withResyncEvent, createManualTimelineEvent("event_started", "started", "Event Started", syncedAt, { linkedAtlasPickId: atlasPick.id }));
  }

  return withResyncEvent;
}

function replaceManualPick(collection: ManualTrackingCollection, pick: ManualTrackedPick, updatedAt: string) {
  const normalized = normalizeManualTracking({
    ...collection,
    updatedAt,
    picks: collection.picks.map((candidate) => (candidate.id === pick.id ? pick : candidate)),
  }, updatedAt, collection.manualFinancialState.currentBankroll);

  return {
    ...normalized,
    stats: calculateManualStats(normalized.picks, normalized.manualFinancialState),
    manualStats: calculateManualStats(normalized.picks, normalized.manualFinancialState),
  };
}

function appendTimelineEvent(pick: ManualTrackedPick, event: ManualPickTimelineEvent) {
  if (hasTimelineEvent(pick.timeline, event.id) || pick.timeline.some((item) => isSameTimelineEvent(item, event))) return pick;

  return {
    ...pick,
    timeline: [...pick.timeline, event],
  };
}

function createMissingTimelineEvents(existingEvents: ManualPickTimelineEvent[], events: ManualPickTimelineEvent[]) {
  return events.filter((event) => !hasTimelineEvent(existingEvents, event.id));
}

function hasTimelineEvent(events: ManualPickTimelineEvent[], id: string) {
  return events.some((event) => event.id === id || event.metadata?.syncKey === id);
}

function isSameTimelineEvent(current: ManualPickTimelineEvent, next: ManualPickTimelineEvent) {
  if (current.type !== next.type) return false;
  if (current.metadata?.syncKey && next.metadata?.syncKey) return current.metadata.syncKey === next.metadata.syncKey;
  if (current.metadata?.linkedAtlasPickId && next.metadata?.linkedAtlasPickId) return current.metadata.linkedAtlasPickId === next.metadata.linkedAtlasPickId;
  return !current.metadata && !next.metadata;
}

function createResultSyncKey(pick: ManualTrackedPick, result: AtlasPlanFinalResult, completedAt: string) {
  return `${pick.id}:${pick.linkedAtlasPickId}:${result}:${completedAt}`;
}

function isFinalManualStatus(status: ManualTrackedPick["status"]): status is AtlasPlanFinalResult {
  return status === "won" || status === "lost" || status === "push" || status === "cancelled";
}

function isNonFinancialAtlasStatus(status: ManualTrackedPick["status"] | undefined) {
  return status === "removed" || status === "downgraded" || status === "no_eligible_replacement";
}
