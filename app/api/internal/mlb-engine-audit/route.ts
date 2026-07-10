import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import {
  buildConsensusMovementFromSnapshots,
  buildMarketMovementFeatureMap,
} from "@/app/lib/mlb-engine/marketFeatures";
import {
  buildMlbSportsProjection,
  buildUnavailableMlbSportsIntelligenceFeatures,
  getLineupChangeStatus,
  getLineupPersistenceStatus,
  getMlbOfficialSportsIntelligenceProviderWhenEnabled,
  getMlbSportsIntelligenceFeatures,
  getMlbSportsIntelligenceFlags,
  getStarterVerificationStatus,
  unavailableMlbSportsIntelligenceProvider,
  type MlbGameContext,
  type MlbOfficialPitcherProviderHealth,
  type MlbSportsIntelligenceFeatures,
  type OffensiveTeamForm,
} from "@/app/lib/mlb-engine/sports-intelligence";
import { getOffensiveFormSnapshotStatus } from "@/app/lib/mlb-engine/sports-intelligence/offense/offensive-form-repository";
import { getOffensiveBaselineStorageStatus } from "@/app/lib/mlb-engine/sports-intelligence/offense/offensive-baseline-repository";
import {
  getBullpenQualityBaselineStatus,
  getBullpenFeatureSnapshotStatus,
  loadLatestCanonicalBullpenTeamFeatures,
} from "@/app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-feature-repository";
import { getMlbTeamIdentityByName } from "@/app/lib/mlb-engine/sports-intelligence/mlb-team-mapping";
import {
  BULLPEN_FATIGUE_SCORE_VERSION_V2,
  BULLPEN_QUALITY_SCORE_VERSION,
  effectiveDepthDistribution,
  fatigueDistribution,
  qualityDistribution,
} from "@/app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-calibration";
import { BULLPEN_QUALITY_SCORE_VERSION_V2 } from "@/app/lib/mlb-engine/sports-intelligence/bullpen/bullpen-season-quality";
import { getRecentSnapshots, getSnapshotStatus } from "@/lib/market-impact/odds/snapshotRepository";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

async function recentPublicRows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_public_signals")
    .select("date,game_id,away_team,home_team,pick,market,line,odds,status,start_time")
    .order("date", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

async function recentTop5Rows() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mlb_top5_live")
    .select("date,rank,game_id,away_team,home_team,pick,market,line,odds,status,is_top_signal,start_time")
    .order("date", { ascending: false })
    .order("rank", { ascending: true })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}

function auditContextFromRows(publicSignals: any[], liveTop5: any[]): MlbGameContext {
  const row = publicSignals[0] ?? liveTop5[0] ?? {};

  return {
    eventId: String(row.game_id ?? "audit-context-unavailable"),
    homeTeam: String(row.home_team ?? ""),
    awayTeam: String(row.away_team ?? ""),
    commenceTime: String(row.start_time ?? new Date().toISOString()),
    currentTime: new Date().toISOString(),
    marketKeys: ["h2h", "spreads", "totals"],
  };
}

function auditContextsFromRows(publicSignals: any[], liveTop5: any[], eventId?: string | null) {
  const rowsById = new Map<string, any>();

  [...publicSignals, ...liveTop5].forEach((row) => {
    const gameId = String(row.game_id ?? "");
    if (!gameId || rowsById.has(gameId)) return;
    rowsById.set(gameId, row);
  });

  const rows = eventId
    ? Array.from(rowsById.values()).filter((row) => String(row.game_id ?? "") === eventId)
    : Array.from(rowsById.values()).slice(0, 3);

  return rows.map((row): MlbGameContext => ({
    eventId: String(row.game_id ?? "audit-context-unavailable"),
    homeTeam: String(row.home_team ?? ""),
    awayTeam: String(row.away_team ?? ""),
    commenceTime: String(row.start_time ?? new Date().toISOString()),
    currentTime: new Date().toISOString(),
    marketKeys: ["h2h", "spreads", "totals"],
  }));
}

function sportsIntelligenceAuditSummary(input: {
  enabled: boolean;
  provider: string;
  features: MlbSportsIntelligenceFeatures;
  health?: MlbOfficialPitcherProviderHealth | null;
}) {
  const projection = buildMlbSportsProjection(input.features);

  return {
    enabled: input.enabled,
    provider: input.provider,
    overallAvailability: input.features.overallAvailability,
    availableModuleCount: input.features.availableModuleCount,
    totalModuleCount: input.features.totalModuleCount,
    pitcherAvailability: input.features.startingPitcher.metadata.availability,
    lineupAvailability: input.features.lineup.metadata.availability,
    offensiveFormAvailability: input.features.offensiveForm.metadata.availability,
    bullpenAvailability: input.features.bullpen.metadata.availability,
    weatherAvailability: input.features.weatherPark.metadata.availability,
    warnings: input.features.warnings,
    projectionAvailability: projection.projectionAvailability,
    providerHealth: input.health ?? {
      source: "MLB_STATS_API",
      reachable: false,
      gamesMapped: 0,
      gamesUnmatched: 0,
      bothPitchersAvailable: 0,
      onePitcherAvailable: 0,
      zeroPitchersAvailable: 0,
      staleRecords: 0,
      errors: [],
      cacheStatus: "DISABLED",
    },
  };
}

function offensiveTeamAudit(team: OffensiveTeamForm | undefined) {
  if (!team) return undefined;

  return {
    teamId: team.teamId,
    teamName: team.teamName,
    offensiveScore: team.atlasOffensiveScore,
    currentScore: team.currentScore,
    scoreTimestamp: team.scoreTimestamp,
    source: team.source,
    availability: team.availability,
    rollingWindows: team.rollingWindows,
    componentBreakdown: team.componentBreakdown,
  };
}

function offensiveFormAudit(
  features: MlbSportsIntelligenceFeatures,
  snapshotStatus: Awaited<ReturnType<typeof getOffensiveFormSnapshotStatus>>,
  baselineStatus: Awaited<ReturnType<typeof getOffensiveBaselineStorageStatus>>,
  scoreEnabled: boolean,
) {
  const homeScoreAvailable = features.offensiveForm.home?.atlasOffensiveScore !== undefined;
  const awayScoreAvailable = features.offensiveForm.away?.atlasOffensiveScore !== undefined;
  const rawDataAvailable = [features.offensiveForm.home, features.offensiveForm.away].some((team) =>
    Object.values(team?.rollingWindows ?? {}).some((window) => Boolean(window?.plateAppearances || window?.battedBallEvents)),
  );

  return {
    enabled: features.offensiveForm.metadata.availability !== "UNAVAILABLE",
    provider: features.offensiveForm.metadata.source ?? "none",
    providerHealth: "See sportsIntelligence.providerHealth.offense when Statcast provider is active.",
    storageHealth: snapshotStatus,
    baselineStorageHealth: baselineStatus,
    snapshotsTotal: snapshotStatus.totalSnapshots,
    canonicalSnapshotCount: snapshotStatus.canonicalSnapshots,
    noncanonicalSnapshotCount: snapshotStatus.noncanonicalSnapshots,
    teamsTracked: snapshotStatus.teamsTracked,
    windowsTracked: snapshotStatus.windowsTracked,
    rawDataAvailability: rawDataAvailable ? "AVAILABLE" : "UNAVAILABLE",
    scoreEnabled,
    scoreMode: scoreEnabled ? process.env.MLB_OFFENSIVE_SCORE_MODE ?? "AUDIT_ONLY" : "DISABLED",
    scoreAvailability: scoreEnabled && (homeScoreAvailable || awayScoreAvailable) ? "AVAILABLE" : "UNAVAILABLE",
    teamsScored: snapshotStatus.teamsScored,
    teamsUnscored: Math.max(0, snapshotStatus.teamsTracked - (snapshotStatus.teamsScored ?? 0)),
    baselineAsOf: baselineStatus.latestAsOf,
    baselineAvailability: homeScoreAvailable || awayScoreAvailable ? "AVAILABLE" : "UNAVAILABLE",
    teamsAvailable: [features.offensiveForm.home, features.offensiveForm.away]
      .filter((team) => team?.availability === "AVAILABLE")
      .map((team) => team?.teamName),
    teamsUnavailable: [features.offensiveForm.home, features.offensiveForm.away]
      .filter((team) => !team || team.availability !== "AVAILABLE")
      .map((team) => team?.teamName)
      .filter(Boolean),
    cacheHealth: "server-side provider cache only",
    latestRefresh: snapshotStatus.latestRefresh,
    lastSuccessfulRefresh: features.offensiveForm.metadata.updatedAt ?? snapshotStatus.latestRefresh,
    availability: features.offensiveForm.metadata.availability,
    source: features.offensiveForm.metadata.source ?? "none",
    observedAt: features.offensiveForm.metadata.observedAt,
    updatedAt: features.offensiveForm.metadata.updatedAt,
    freshnessMinutes: features.offensiveForm.metadata.freshnessMinutes,
    warnings: features.offensiveForm.metadata.warnings ?? [],
    home: offensiveTeamAudit(features.offensiveForm.home),
    away: offensiveTeamAudit(features.offensiveForm.away),
    formAdvantage: features.offensiveForm.formAdvantage,
  };
}

function bullpenTeamAudit(team: MlbSportsIntelligenceFeatures["bullpen"]["home"] | undefined) {
  if (!team) return undefined;
  return {
    teamId: team.teamId,
    teamName: team.teamName,
    availability: team.metadata.availability,
    freshness: team.metadata.freshnessMinutes,
    gamesIncluded: team.metadata.gamesIncluded,
    appearancesIncluded: team.metadata.appearancesIncluded,
    appearancesMissingPitchCounts: team.metadata.appearancesMissingPitchCounts,
    completenessPercentage: team.metadata.completenessPercentage,
    totalAppearancesLast3Days: team.totalAppearancesLast3Days,
    totalPitchesLast3Days: team.totalPitchesLast3Days,
    totalInningsLast3Days: team.totalInningsLast3Days,
    relieversUsedLast1Day: team.relieversUsedLast1Day,
    relieversUsedLast2Days: team.relieversUsedLast2Days,
    relieversUsedLast3Days: team.relieversUsedLast3Days,
    relieversOnConsecutiveDays: team.relieversOnConsecutiveDays,
    relieversWithHeavyWorkload: team.relieversWithHeavyWorkload,
    closerCandidate: team.closerCandidate,
    highLeverageRelievers: team.highLeverageRelievers,
    fatigueScore: team.fatigueScore,
    fatigueScoreV1: team.fatigueScoreV1,
    fatigueScoreV2: team.fatigueScoreV2,
    fatigueTier: team.fatigueScoreV2 === undefined ? undefined : team.fatigueScoreV2 <= 20 ? "VERY_LIGHT" : team.fatigueScoreV2 <= 40 ? "RESTED" : team.fatigueScoreV2 <= 60 ? "MODERATE" : team.fatigueScoreV2 <= 80 ? "ELEVATED" : "EXTREME",
    fatigueScoreVersion: team.fatigueScoreVersion,
    fatigueComponents: team.fatigueComponents,
    qualityScore: team.qualityScore,
    qualityScoreV1: team.qualityScoreV1,
    qualityScoreV2: team.qualityScoreV2,
    qualityScoreVersion: team.qualityScoreVersion,
    qualityComponents: team.qualityComponents,
    qualityConfidence: team.qualityConfidence,
    seasonQualityComponent: team.seasonQualityComponent,
    last30QualityComponent: team.last30QualityComponent,
    last14QualityComponent: team.last14QualityComponent,
    last7QualityComponent: team.last7QualityComponent,
    reliefWindows: team.reliefWindows,
    baselineVersion: team.baselineVersion,
    qualitySample: team.qualitySample,
    effectiveDepth: team.effectiveDepth,
    closerHighLeverageFatigueEvidence: team.relieverFatigue?.filter((reliever) =>
      reliever.playerId === team.closerCandidate?.playerId ||
      team.highLeverageRelievers.some((candidate) => candidate.playerId === reliever.playerId),
    ),
    warnings: team.warnings,
  };
}

async function bullpenAudit(
  features: MlbSportsIntelligenceFeatures,
  snapshotStatus: Awaited<ReturnType<typeof getBullpenFeatureSnapshotStatus>>,
  baselineStatus: Awaited<ReturnType<typeof getBullpenQualityBaselineStatus>>,
  scoreEnabled: boolean,
) {
  const teams = [features.bullpen.home, features.bullpen.away].filter(Boolean) as NonNullable<MlbSportsIntelligenceFeatures["bullpen"]["home"]>[];
  const allTeams = await loadLatestCanonicalBullpenTeamFeatures();
  const qualityV1Teams = allTeams.map((team) => ({ ...team, qualityScore: team.qualityScoreV1 }));
  const qualityV2Teams = allTeams.map((team) => ({ ...team, qualityScore: team.qualityScoreV2 }));
  const confidenceDistribution = allTeams.reduce((acc: Record<string, number>, team) => {
    const key = team.qualityConfidence?.tier ?? "UNAVAILABLE";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const v1v2Rows = allTeams.map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    qualityV1: team.qualityScoreV1,
    qualityV2: team.qualityScoreV2,
    delta: team.qualityScoreV1 !== undefined && team.qualityScoreV2 !== undefined
      ? Math.round((team.qualityScoreV2 - team.qualityScoreV1) * 10) / 10
      : undefined,
    seasonComponent: team.seasonQualityComponent,
    last30Component: team.last30QualityComponent,
    last14Component: team.last14QualityComponent,
    last7Component: team.last7QualityComponent,
    confidence: team.qualityConfidence,
  }));
  return {
    enabled: features.bullpen.metadata.availability !== "UNAVAILABLE",
    provider: features.bullpen.metadata.source ?? "none",
    providerHealth: "See sportsIntelligence.providerHealth.bullpen when the official bullpen provider is active.",
    storageHealth: snapshotStatus,
    teamsAvailable: teams.filter((team) => team.metadata.availability === "AVAILABLE").map((team) => team.teamName),
    teamsPartial: teams.filter((team) => team.metadata.availability === "PARTIAL").map((team) => team.teamName),
    teamsUnavailable: teams.filter((team) => team.metadata.availability === "UNAVAILABLE").map((team) => team.teamName),
    latestRefresh: snapshotStatus.latestRefresh,
    scoreEnabled,
    scoreMode: scoreEnabled ? process.env.MLB_BULLPEN_SCORE_MODE ?? "AUDIT_ONLY" : "DISABLED",
    fatigueVersion: process.env.MLB_BULLPEN_FATIGUE_VERSION ?? "v1",
    scoreVersion: BULLPEN_FATIGUE_SCORE_VERSION_V2,
    fatigueDistribution: fatigueDistribution(allTeams),
    fatigueV1Distribution: fatigueDistribution(allTeams.map((team) => ({ ...team, fatigueScore: team.fatigueScoreV1 }))),
    fatigueV2Distribution: fatigueDistribution(allTeams.map((team) => ({ ...team, fatigueScore: team.fatigueScoreV2 }))),
    qualityVersion: BULLPEN_QUALITY_SCORE_VERSION,
    qualityDistribution: qualityDistribution(allTeams),
    bullpenQuality: {
      version: process.env.MLB_BULLPEN_QUALITY_VERSION === "v2" ? BULLPEN_QUALITY_SCORE_VERSION_V2 : BULLPEN_QUALITY_SCORE_VERSION,
      seasonArchiveHealth: {
        enabled: process.env.MLB_BULLPEN_SEASON_ARCHIVE_ENABLED === "true",
        teamsWithSeasonWindow: allTeams.filter((team) => team.reliefWindows?.SEASON).length,
      },
      baselineHealth: baselineStatus,
      teamsScored: allTeams.filter((team) => team.qualityScoreV2 !== undefined).length,
      teamsUnscored: allTeams.filter((team) => team.qualityScoreV2 === undefined).length,
      distribution: qualityDistribution(qualityV2Teams),
      confidenceDistribution,
      v1V2Summary: {
        distributionV1: qualityDistribution(qualityV1Teams),
        distributionV2: qualityDistribution(qualityV2Teams),
        largestChanges: v1v2Rows
          .filter((row) => row.delta !== undefined)
          .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
          .slice(0, 8),
      },
      latestRefresh: snapshotStatus.latestRefresh,
      warnings: [
        ...(baselineStatus.errors ?? []),
        ...(allTeams.length < 30 ? ["Fewer than 30 canonical bullpen teams loaded."] : []),
      ],
    },
    teamsQualityAvailable: allTeams.filter((team) => team.qualitySample?.availability === "AVAILABLE").map((team) => team.teamName),
    teamsQualityPartial: allTeams.filter((team) => team.qualitySample?.availability === "PARTIAL").map((team) => team.teamName),
    teamsQualityUnavailable: allTeams.filter((team) => !team.qualitySample || team.qualitySample.availability === "UNAVAILABLE").map((team) => team.teamName),
    effectiveDepthDistribution: effectiveDepthDistribution(allTeams),
    warnings: features.bullpen.metadata.warnings ?? [],
    home: bullpenTeamAudit(features.bullpen.home),
    away: bullpenTeamAudit(features.bullpen.away),
    fatigueAdvantage: features.bullpen.fatigueAdvantage,
    qualityAdvantage: features.bullpen.qualityAdvantage,
  };
}

async function bullpenFeaturesFromSnapshots(context: MlbGameContext) {
  const teams = await loadLatestCanonicalBullpenTeamFeatures();
  const homeId = getMlbTeamIdentityByName(context.homeTeam)?.officialTeamId;
  const awayId = getMlbTeamIdentityByName(context.awayTeam)?.officialTeamId;
  const home = teams.find((team) => team.teamId === homeId);
  const away = teams.find((team) => team.teamId === awayId);
  const availability: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" = home && away ? "AVAILABLE" : home || away ? "PARTIAL" : "UNAVAILABLE";
  return {
    metadata: {
      availability,
      source: "MLB_OFFICIAL" as const,
      observedAt: new Date().toISOString(),
      updatedAt: [home?.metadata.updatedAt, away?.metadata.updatedAt].filter(Boolean).sort().at(-1),
      warnings: availability === "UNAVAILABLE" ? ["No canonical bullpen snapshots matched audit teams."] : [],
    },
    home,
    away,
    fatigueAdvantage: home?.fatigueScore !== undefined && away?.fatigueScore !== undefined
      ? home.fatigueScore < away.fatigueScore ? "HOME" as const : away.fatigueScore < home.fatigueScore ? "AWAY" as const : "NEUTRAL" as const
      : undefined,
    qualityAdvantage: home?.qualityScore !== undefined && away?.qualityScore !== undefined
      ? home.qualityScore > away.qualityScore ? "HOME" as const : away.qualityScore > home.qualityScore ? "AWAY" as const : "NEUTRAL" as const
      : undefined,
    bullpenAdvantage: undefined,
    overallAvailability: availability,
  };
}

function lineupAudit(side: "home" | "away", features: MlbSportsIntelligenceFeatures, details: boolean) {
  const lineup = side === "home" ? features.lineup.homeLineup : features.lineup.awayLineup;
  if (!lineup) return undefined;

  return {
    teamId: lineup.teamId,
    teamName: lineup.teamName,
    confirmed: lineup.confirmed,
    actualPlayerCount: lineup.actualPlayerCount,
    expectedPlayerCount: lineup.expectedPlayerCount,
    battingOrderComplete: lineup.battingOrderComplete,
    warnings: lineup.warnings,
    players: details ? lineup.players : undefined,
  };
}

function pitcherAuditItem(context: MlbGameContext, features: MlbSportsIntelligenceFeatures, details: boolean) {
  return {
    oddsEventId: context.eventId,
    homeTeam: context.homeTeam,
    awayTeam: context.awayTeam,
    commenceTime: context.commenceTime,
    featureAvailability: features.startingPitcher.metadata.availability,
    dataSource: features.startingPitcher.metadata.source,
    sourceTimestamp: features.startingPitcher.metadata.updatedAt,
    mappingConfidence: features.startingPitcher.metadata.confidence,
    homePitcher: features.startingPitcher.homeStarter
      ? {
          playerId: features.startingPitcher.homeStarter.playerId,
          name: features.startingPitcher.homeStarter.name,
          status: features.startingPitcher.homeStarter.status,
          confirmed: features.startingPitcher.homeStarter.confirmed,
          throwingHand: features.startingPitcher.homeStarter.throwingHand,
          restDays: features.startingPitcher.homeStarter.restDays,
          recentPitchCount: features.startingPitcher.homeStarter.recentPitchCount,
          season: {
            era: features.startingPitcher.homeStarter.era,
            whip: features.startingPitcher.homeStarter.whip,
            strikeoutRate: features.startingPitcher.homeStarter.strikeoutRate,
            walkRate: features.startingPitcher.homeStarter.walkRate,
          },
        }
      : undefined,
    awayPitcher: features.startingPitcher.awayStarter
      ? {
          playerId: features.startingPitcher.awayStarter.playerId,
          name: features.startingPitcher.awayStarter.name,
          status: features.startingPitcher.awayStarter.status,
          confirmed: features.startingPitcher.awayStarter.confirmed,
          throwingHand: features.startingPitcher.awayStarter.throwingHand,
          restDays: features.startingPitcher.awayStarter.restDays,
          recentPitchCount: features.startingPitcher.awayStarter.recentPitchCount,
          season: {
            era: features.startingPitcher.awayStarter.era,
            whip: features.startingPitcher.awayStarter.whip,
            strikeoutRate: features.startingPitcher.awayStarter.strikeoutRate,
            walkRate: features.startingPitcher.awayStarter.walkRate,
          },
        }
      : undefined,
    warnings: features.startingPitcher.metadata.warnings ?? [],
    lineup: {
      availability: features.lineup.metadata.availability,
      homeConfirmed: features.lineup.homeConfirmed,
      awayConfirmed: features.lineup.awayConfirmed,
      home: lineupAudit("home", features, details),
      away: lineupAudit("away", features, details),
      warnings: features.lineup.metadata.warnings ?? [],
    },
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedEventId = url.searchParams.get("eventId");
    const details = url.searchParams.get("details") === "1";
    const [publicSignals, liveTop5, snapshotStatus, snapshots] = await Promise.all([
      recentPublicRows(),
      recentTop5Rows(),
      getSnapshotStatus(),
      getRecentSnapshots("MLB", 180),
    ]);
    const booksByEvent = new Map<string, Set<string>>();

    snapshots.forEach((snapshot) => {
      const books = booksByEvent.get(snapshot.eventId) ?? new Set<string>();
      books.add(snapshot.bookmaker);
      booksByEvent.set(snapshot.eventId, books);
    });

    const monitoredSportsbookCountByEvent = new Map(
      Array.from(booksByEvent.entries()).map(([eventId, books]) => [eventId, books.size]),
    );
    const consensusMovement = buildConsensusMovementFromSnapshots(
      snapshots,
      monitoredSportsbookCountByEvent,
    );
    const movementFeatures = buildMarketMovementFeatureMap(consensusMovement);
    const sportsFlags = getMlbSportsIntelligenceFlags();
    const [lineupPersistence, lineupChanges, starterVerification, offensiveSnapshotStatus, offensiveBaselineStatus, bullpenSnapshotStatus, bullpenBaselineStatus] = await Promise.all([
      getLineupPersistenceStatus(),
      getLineupChangeStatus(details),
      getStarterVerificationStatus(details),
      getOffensiveFormSnapshotStatus(),
      getOffensiveBaselineStorageStatus(),
      getBullpenFeatureSnapshotStatus(),
      getBullpenQualityBaselineStatus(),
    ]);
    const sportsContext = auditContextFromRows(publicSignals, liveTop5);
    const pitcherContexts = auditContextsFromRows(publicSignals, liveTop5, requestedEventId);
    const sportsProvider = getMlbOfficialSportsIntelligenceProviderWhenEnabled({
      ...sportsFlags,
      bullpenModelEnabled: false,
      bullpenProviderEnabled: false,
    });
    let sportsFeatures =
      sportsFlags.sportsIntelligenceEnabled &&
      (sportsFlags.pitcherModelEnabled || sportsFlags.lineupModelEnabled || sportsFlags.offensiveFormModelEnabled || sportsFlags.bullpenModelEnabled)
        ? await getMlbSportsIntelligenceFeatures(sportsContext, sportsProvider)
        : buildUnavailableMlbSportsIntelligenceFeatures(sportsContext);
    if (sportsFlags.sportsIntelligenceEnabled && sportsFlags.bullpenModelEnabled) {
      sportsFeatures = {
        ...sportsFeatures,
        bullpen: await bullpenFeaturesFromSnapshots(sportsContext),
      };
    }
    const pitcherDiagnostics =
      sportsFlags.sportsIntelligenceEnabled &&
      (sportsFlags.pitcherModelEnabled || sportsFlags.lineupModelEnabled || sportsFlags.offensiveFormModelEnabled || sportsFlags.bullpenModelEnabled)
        ? await Promise.all(
            pitcherContexts.map(async (context) =>
              pitcherAuditItem(
                context,
                await getMlbSportsIntelligenceFeatures(context, sportsProvider),
                details,
              ),
            ),
          )
        : pitcherContexts.map((context) =>
            pitcherAuditItem(context, buildUnavailableMlbSportsIntelligenceFeatures(context), details),
          );
    const providerHealth =
      "getHealth" in sportsProvider && typeof sportsProvider.getHealth === "function"
        ? sportsProvider.getHealth()
        : null;

    return NextResponse.json({
      ok: true,
      engine: "atlas-mlb-automated-market-engine",
      generatedAt: new Date().toISOString(),
      verifiedDataSources: {
        odds: "The Odds API h2h, spreads/run line, totals",
        scores: "SportsDataIO when configured, The Odds API completed scores fallback",
        movements: "Supabase public.market_odds_snapshots, recent 180 minutes",
        unavailableInputsNotUsed: [
          "confirmed starting pitchers",
          "lineups",
          "injuries",
          "weather",
          "team-level rolling stats",
          "player props",
          "live odds",
        ],
      },
      selectionRules: {
        allowedMarkets: ["moneyline", "run line/spread", "totals"],
        automatedOddsRange: "-150 to +120",
        mlbMinimumBookCoverage: 2,
        staleOddsPolicy: "Reject when Odds API last_update is older than 240 minutes; missing timestamp is not treated as stale.",
        rankingInputs: [
          "American price",
          "no-vig two-way consensus when available",
          "book coverage",
          "price spread",
          "bounded recent odds movement context when backed by snapshots",
        ],
        abstentionPolicy: "Top 5 publishes fewer than five rows when fewer qualified candidates exist.",
      },
      snapshotStatus,
      movementSummary: {
        recentSnapshotRows: snapshots.length,
        consensusMovements: consensusMovement.length,
        featureKeys: movementFeatures.size,
        examples: consensusMovement.slice(0, 3),
      },
      sportsIntelligence: sportsIntelligenceAuditSummary({
        enabled:
          sportsFlags.sportsIntelligenceEnabled &&
          (sportsFlags.pitcherModelEnabled || sportsFlags.lineupModelEnabled || sportsFlags.offensiveFormModelEnabled),
        provider: sportsProvider.name ?? unavailableMlbSportsIntelligenceProvider.name,
        features: sportsFeatures,
        health: providerHealth,
      }),
      lineupPersistence: {
        enabled: sportsFlags.lineupSnapshotsEnabled,
        ...lineupPersistence,
      },
      lineupChanges: {
        enabled: sportsFlags.lineupChangeDetectionEnabled,
        ...lineupChanges,
      },
      starterVerification: {
        enabled: sportsFlags.starterVerificationSnapshotsEnabled,
        ...starterVerification,
      },
      playerAvailability: {
        availability: sportsFeatures.playerAvailability.metadata.availability,
        source: sportsFeatures.playerAvailability.metadata.source ?? "none",
        warnings: sportsFeatures.playerAvailability.warnings,
      },
      offensiveForm: offensiveFormAudit(
        sportsFeatures,
        offensiveSnapshotStatus,
        offensiveBaselineStatus,
        sportsFlags.offensiveScoreEnabled,
      ),
      bullpen: await bullpenAudit(
        sportsFeatures,
        bullpenSnapshotStatus,
        bullpenBaselineStatus,
        sportsFlags.bullpenFatigueScoreEnabled && sportsFlags.bullpenScoreMode === "AUDIT_ONLY",
      ),
      startingPitchers: {
        requestedEventId: requestedEventId ?? null,
        count: pitcherDiagnostics.length,
        items: pitcherDiagnostics,
      },
      recentPublicSignals: publicSignals,
      recentTop5: liveTop5,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "MLB engine audit unavailable",
        details: serializeError(error),
      },
      { status: 500 },
    );
  }
}
