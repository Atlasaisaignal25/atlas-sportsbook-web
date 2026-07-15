import type {
  AtlasDailySnapshot,
  AtlasPlanPackage,
  AtlasPlanSource,
  AtlasSnapshotPick,
  AtlasTrackingPickOption,
  BankrollConfig,
} from "./types";
import type { AtlasPackageSourcePick, AtlasPackageSources } from "./package-engine";

type SnapshotModeResult = {
  picks: AtlasTrackingPickOption[];
  demoModeEnabled: boolean;
  snapshot: AtlasDailySnapshot | null;
  sourceLabel: "live" | "snapshot" | "empty";
};

const SNAPSHOT_SOURCE_ORDER: AtlasPlanSource[] = ["signals", "top3", "top5"];

export function createSnapshot(
  picks: AtlasTrackingPickOption[],
  options: {
    snapshotDate?: string;
    createdAt?: string;
    package?: AtlasPlanPackage;
  } = {},
): AtlasDailySnapshot | null {
  if (picks.length === 0) return null;

  const createdAt = options.createdAt ?? new Date().toISOString();
  const snapshotDate = options.snapshotDate ?? createdAt.slice(0, 10);
  const snapshotPicks = picks.map((pick): AtlasSnapshotPick => ({
    id: pick.id,
    snapshotDate,
    sport: pick.sport,
    league: pick.league,
    eventId: pick.eventId,
    homeTeam: pick.homeTeam,
    awayTeam: pick.awayTeam,
    selection: pick.selection,
    market: pick.market,
    odds: pick.odds,
    confidence: getSnapshotConfidence(pick.rank),
    package: options.package ?? "premium",
    rank: pick.rank,
    status: pick.status,
    source: pick.source,
    startTime: pick.startTime,
  }));

  return {
    id: `atlas-snapshot-${snapshotDate}`,
    snapshotDate,
    createdAt,
    updatedAt: createdAt,
    picks: snapshotPicks,
  };
}

export function loadLatestSnapshot(config: Pick<BankrollConfig, "lastAtlasSnapshot" | "lastGlobalSnapshot"> | null | undefined) {
  return normalizeSnapshot(config?.lastGlobalSnapshot) ?? normalizeSnapshot(config?.lastAtlasSnapshot);
}

export function atlasSourcesToTrackingPicks(sources: AtlasPackageSources): AtlasTrackingPickOption[] {
  return [
    ...sourcePicksToTrackingPicks(sources.signals, "signals"),
    ...sourcePicksToTrackingPicks(sources.top3, "top3"),
    ...sourcePicksToTrackingPicks(sources.top5, "top5"),
  ].sort((a, b) => a.source.localeCompare(b.source) || a.sport.localeCompare(b.sport) || a.rank - b.rank);
}

export function createSnapshotFromSources(
  sources: AtlasPackageSources,
  options: {
    snapshotDate?: string;
    createdAt?: string;
    package?: AtlasPlanPackage;
  } = {},
) {
  return createSnapshot(atlasSourcesToTrackingPicks(sources), options);
}

export function shouldUseSnapshot(livePicks: AtlasTrackingPickOption[], snapshot: AtlasDailySnapshot | null | undefined) {
  return livePicks.length === 0 && Boolean(snapshot?.picks.length);
}

export function activateDemoMode(config: BankrollConfig, snapshot: AtlasDailySnapshot, now = new Date().toISOString()): BankrollConfig {
  return {
    ...config,
    lastAtlasSnapshot: snapshot,
    lastSnapshotDate: snapshot.snapshotDate,
    demoModeEnabled: true,
    updatedAt: now,
  };
}

export function deactivateDemoMode(config: BankrollConfig, snapshot: AtlasDailySnapshot | null, now = new Date().toISOString()): BankrollConfig {
  return {
    ...config,
    lastAtlasSnapshot: snapshot,
    lastSnapshotDate: snapshot?.snapshotDate ?? config.lastSnapshotDate ?? null,
    demoModeEnabled: false,
    updatedAt: now,
  };
}

export function resolveSnapshotMode(
  livePicks: AtlasTrackingPickOption[],
  snapshot: AtlasDailySnapshot | null | undefined,
): SnapshotModeResult {
  const normalizedSnapshot = normalizeSnapshot(snapshot);

  if (livePicks.length > 0) {
    return {
      picks: livePicks,
      demoModeEnabled: false,
      snapshot: normalizedSnapshot,
      sourceLabel: "live",
    };
  }

  if (normalizedSnapshot?.picks.length) {
    return {
      picks: snapshotToTrackingPicks(normalizedSnapshot),
      demoModeEnabled: true,
      snapshot: normalizedSnapshot,
      sourceLabel: "snapshot",
    };
  }

  return {
    picks: [],
    demoModeEnabled: false,
    snapshot: null,
    sourceLabel: "empty",
  };
}

export function snapshotToTrackingPicks(snapshot: AtlasDailySnapshot): AtlasTrackingPickOption[] {
  return snapshot.picks.map((pick) => ({
    id: `snapshot-${snapshot.snapshotDate}-${pick.id}`,
    sport: pick.sport,
    league: pick.league,
    eventId: pick.eventId,
    homeTeam: pick.homeTeam,
    awayTeam: pick.awayTeam,
    eventDate: pick.startTime.slice(0, 10),
    eventTime: new Date(pick.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    startTime: pick.startTime,
    market: pick.market,
    selection: pick.selection,
    odds: pick.odds,
    status: pick.status,
    source: pick.source,
    rank: pick.rank,
    completedAt: null,
  }));
}

export function snapshotToAtlasSources(snapshot: AtlasDailySnapshot | null | undefined): AtlasPackageSources {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const emptySources: AtlasPackageSources = { signals: [], top3: [], top5: [] };
  if (!normalizedSnapshot) return emptySources;

  return normalizedSnapshot.picks.reduce((sources, pick) => {
    const sourcePick = snapshotPickToSourcePick(pick);
    if (pick.source === "signals") sources.signals.push(sourcePick);
    if (pick.source === "top3") sources.top3.push(sourcePick);
    if (pick.source === "top5") sources.top5.push(sourcePick);
    return sources;
  }, emptySources);
}

export function normalizeSnapshot(value: unknown): AtlasDailySnapshot | null {
  if (!isValidSnapshot(value)) return null;

  const uniquePicks = new Map<string, AtlasSnapshotPick>();
  value.picks.forEach((pick) => {
    uniquePicks.set(`${pick.source}-${pick.sport}-${pick.rank}-${pick.id}`, pick);
  });

  return {
    ...value,
    picks: Array.from(uniquePicks.values()).sort((a, b) => {
      const sourceDelta = SNAPSHOT_SOURCE_ORDER.indexOf(a.source) - SNAPSHOT_SOURCE_ORDER.indexOf(b.source);
      return sourceDelta || a.sport.localeCompare(b.sport) || a.rank - b.rank;
    }),
  };
}

export function isValidSnapshot(value: unknown): value is AtlasDailySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<AtlasDailySnapshot>;

  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.snapshotDate === "string" &&
    typeof snapshot.createdAt === "string" &&
    typeof snapshot.updatedAt === "string" &&
    Array.isArray(snapshot.picks) &&
    snapshot.picks.every(isValidSnapshotPick)
  );
}

function isValidSnapshotPick(value: unknown): value is AtlasSnapshotPick {
  if (!value || typeof value !== "object") return false;
  const pick = value as Partial<AtlasSnapshotPick>;

  return (
    typeof pick.id === "string" &&
    typeof pick.snapshotDate === "string" &&
    typeof pick.sport === "string" &&
    typeof pick.league === "string" &&
    typeof pick.selection === "string" &&
    typeof pick.market === "string" &&
    typeof pick.odds === "number" &&
    typeof pick.confidence === "number" &&
    typeof pick.package === "string" &&
    typeof pick.rank === "number" &&
    typeof pick.status === "string" &&
    typeof pick.source === "string" &&
    typeof pick.startTime === "string"
  );
}

function snapshotPickToSourcePick(pick: AtlasSnapshotPick): AtlasPackageSourcePick {
  return {
    id: pick.id,
    sport: pick.sport,
    league: pick.league,
    eventId: pick.eventId,
    homeTeam: pick.homeTeam,
    awayTeam: pick.awayTeam,
    selection: pick.selection,
    market: pick.market,
    odds: pick.odds,
    status: pick.status,
    rank: pick.rank,
    startTime: pick.startTime,
  };
}

function sourcePicksToTrackingPicks(picks: AtlasPackageSourcePick[], source: AtlasPlanSource): AtlasTrackingPickOption[] {
  return picks
    .filter((pick) => pick.id && pick.selection && pick.market && Number.isFinite(pick.odds))
    .map((pick, index) => ({
      id: pick.id,
      sport: pick.sport,
      league: pick.league ?? pick.sport,
      eventId: pick.eventId ?? pick.id,
      homeTeam: pick.homeTeam ?? "",
      awayTeam: pick.awayTeam ?? "",
      eventDate: pick.startTime.slice(0, 10),
      eventTime: new Date(pick.startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      startTime: pick.startTime,
      market: pick.market,
      selection: pick.selection,
      odds: pick.odds,
      status: pick.status,
      source,
      rank: pick.rank ?? index + 1,
      completedAt: null,
    }));
}

function getSnapshotConfidence(rank: number) {
  return Math.max(74, Math.min(94, 95 - rank * 3));
}
