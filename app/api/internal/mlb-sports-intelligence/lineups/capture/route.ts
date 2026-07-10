import { NextResponse } from "next/server";
import { fetchCurrentMlbOdds, type OddsGame } from "@/lib/market-impact/providers/oddsProvider";
import {
  buildStarterVerificationSnapshot,
  getMlbSportsIntelligenceFlags,
  insertStarterVerificationSnapshotDeduped,
  MlbOfficialSportsIntelligenceProvider,
  processLineupSnapshot,
  type MlbGameContext,
  type NormalizedTeamLineup,
  type StarterVerificationResult,
} from "@/app/lib/mlb-engine/sports-intelligence";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const url = new URL(request.url);
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

function serializeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function contextFromOddsGame(game: OddsGame): MlbGameContext | null {
  if (!game.id || !game.home_team || !game.away_team || !game.commence_time) return null;
  return {
    eventId: game.id,
    homeTeam: game.home_team,
    awayTeam: game.away_team,
    commenceTime: game.commence_time,
    currentTime: new Date().toISOString(),
    marketKeys: ["h2h", "spreads", "totals"],
  };
}

function canInspectGame(game: OddsGame) {
  const start = new Date(game.commence_time ?? "").getTime();
  if (!Number.isFinite(start)) return false;
  const hoursFromStart = (start - Date.now()) / 3600000;
  return hoursFromStart <= 24 && hoursFromStart >= -4;
}

async function persistLineup(input: {
  officialGameId: string;
  context: MlbGameContext;
  side: "HOME" | "AWAY";
  lineup?: NormalizedTeamLineup;
  gameStatus?: string;
  sourceUpdatedAt?: string;
  persistChanges: boolean;
}) {
  if (!input.lineup) {
    return {
      inserted: 0,
      duplicate: 0,
      changes: 0,
      firstConfirmed: 0,
      lateScratches: 0,
      partial: 0,
      unavailable: 1,
      eventInserts: 0,
      duplicateEvents: 0,
      warnings: [`${input.side} lineup unavailable.`],
      storageHealth: "OK" as const,
      exampleChange: null,
      exampleFirstConfirmed: null,
    };
  }

  const result = await processLineupSnapshot({
    officialGameId: input.officialGameId,
    oddsEventId: input.context.eventId,
    side: input.side,
    lineup: input.lineup,
    gameStartTime: input.context.commenceTime,
    gameStatus: input.gameStatus,
    sourceUpdatedAt: input.sourceUpdatedAt,
    persistChanges: input.persistChanges,
  });
  const firstConfirmed = result.changes.filter((change) => change.changeType === "FIRST_CONFIRMED_LINEUP").length;
  const lateScratches = result.changes.filter((change) => change.changeType === "LATE_SCRATCH").length;

  return {
    inserted: result.writeResult.inserted ? 1 : 0,
    duplicate: result.writeResult.duplicate ? 1 : 0,
    changes: result.changes.length,
    firstConfirmed,
    lateScratches,
    partial: input.lineup.players.length > 0 && !input.lineup.confirmed ? 1 : 0,
    unavailable: input.lineup.players.length === 0 ? 1 : 0,
    eventInserts: result.eventsInserted,
    duplicateEvents: result.duplicateEventsSkipped,
    warnings: result.warnings,
    storageHealth: result.storageHealth,
    exampleChange: result.changes.find((change) => change.changeType !== "FIRST_CONFIRMED_LINEUP") ?? null,
    exampleFirstConfirmed: result.changes.find((change) => change.changeType === "FIRST_CONFIRMED_LINEUP") ?? null,
  };
}

async function persistStarter(input: {
  officialGameId: string;
  context: MlbGameContext;
  side: "HOME" | "AWAY";
  teamId?: string;
  teamName: string;
  verification?: StarterVerificationResult;
}) {
  if (!input.verification) return { inserted: 0, duplicate: 0, changed: 0, warnings: [`${input.side} starter unavailable.`] };

  const snapshot = buildStarterVerificationSnapshot({
    officialGameId: input.officialGameId,
    oddsEventId: input.context.eventId,
    teamId: input.teamId,
    teamName: input.teamName,
    side: input.side,
    verification: input.verification,
  });
  const result = await insertStarterVerificationSnapshotDeduped(snapshot);
  return {
    inserted: result.inserted ? 1 : 0,
    duplicate: result.duplicate ? 1 : 0,
    changed: snapshot.verificationStatus === "CHANGED" && result.inserted ? 1 : 0,
    warnings: result.warnings,
  };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const flags = getMlbSportsIntelligenceFlags();
  if (!flags.sportsIntelligenceEnabled || !flags.lineupModelEnabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "MLB Sports Intelligence lineup model is disabled.",
      gamesInspected: 0,
      gamesMapped: 0,
      lineupSnapshotsInserted: 0,
      duplicateSnapshotsSkipped: 0,
      firstConfirmedLineups: 0,
      lineupChangesDetected: 0,
      lateScratchesDetected: 0,
      starterChangesDetected: 0,
      partialLineups: 0,
      unavailableLineups: 0,
      errors: [],
      storageHealth: "DISABLED",
    });
  }

  if (!flags.lineupSnapshotsEnabled && !flags.starterVerificationSnapshotsEnabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Lineup and starter snapshot persistence flags are disabled.",
      gamesInspected: 0,
      gamesMapped: 0,
      lineupSnapshotsInserted: 0,
      duplicateSnapshotsSkipped: 0,
      firstConfirmedLineups: 0,
      lineupChangesDetected: 0,
      lateScratchesDetected: 0,
      starterChangesDetected: 0,
      partialLineups: 0,
      unavailableLineups: 0,
      errors: [],
      storageHealth: "DISABLED",
    });
  }

  const oddsApiKey = process.env.ODDS_API_KEY;
  if (!oddsApiKey) {
    return NextResponse.json({ ok: false, error: "Missing ODDS_API_KEY" }, { status: 500 });
  }

  const errors: string[] = [];
  const provider = new MlbOfficialSportsIntelligenceProvider({
    enablePitcher: flags.pitcherModelEnabled,
    enableLineup: flags.lineupModelEnabled,
  });
  let gamesMapped = 0;
  let lineupSnapshotsInserted = 0;
  let duplicateSnapshotsSkipped = 0;
  let firstConfirmedLineups = 0;
  let lineupChangesDetected = 0;
  let lateScratchesDetected = 0;
  let starterChangesDetected = 0;
  let partialLineups = 0;
  let unavailableLineups = 0;
  let starterSnapshotsInserted = 0;
  let duplicateStarterSnapshotsSkipped = 0;
  let storageHealth: "OK" | "ERROR" = "OK";
  let exampleFirstConfirmed = null;
  let exampleLineupChange = null;

  try {
    const { games, health } = await fetchCurrentMlbOdds(oddsApiKey);
    const inspectableGames = games.filter(canInspectGame);

    for (const game of inspectableGames) {
      const context = contextFromOddsGame(game);
      if (!context) continue;

      try {
        const capture = await provider.getOfficialLineupCaptureContext(context);
        if (!capture.officialGameId) {
          errors.push(...capture.warnings);
          continue;
        }

        gamesMapped += 1;
        const lineupResults = await Promise.all([
          flags.lineupSnapshotsEnabled
            ? persistLineup({
                officialGameId: capture.officialGameId,
                context,
                side: "HOME",
                lineup: capture.homeLineup,
                gameStatus: capture.gameStatus,
                sourceUpdatedAt: capture.sourceUpdatedAt,
                persistChanges: flags.lineupChangeDetectionEnabled,
              })
            : null,
          flags.lineupSnapshotsEnabled
            ? persistLineup({
                officialGameId: capture.officialGameId,
                context,
                side: "AWAY",
                lineup: capture.awayLineup,
                gameStatus: capture.gameStatus,
                sourceUpdatedAt: capture.sourceUpdatedAt,
                persistChanges: flags.lineupChangeDetectionEnabled,
              })
            : null,
        ]);

        lineupResults.filter(Boolean).forEach((result) => {
          if (!result) return;
          lineupSnapshotsInserted += result.inserted;
          duplicateSnapshotsSkipped += result.duplicate;
          firstConfirmedLineups += result.firstConfirmed;
          lineupChangesDetected += result.changes;
          lateScratchesDetected += result.lateScratches;
          partialLineups += result.partial;
          unavailableLineups += result.unavailable;
          if (result.storageHealth === "ERROR") storageHealth = "ERROR";
          errors.push(...result.warnings);
          exampleFirstConfirmed ??= result.exampleFirstConfirmed;
          exampleLineupChange ??= result.exampleChange;
        });

        if (flags.starterVerificationSnapshotsEnabled) {
          const starterResults = await Promise.all([
            persistStarter({
              officialGameId: capture.officialGameId,
              context,
              side: "HOME",
              teamId: capture.homeLineup?.teamId,
              teamName: capture.homeLineup?.teamName ?? context.homeTeam,
              verification: capture.homeStarter,
            }),
            persistStarter({
              officialGameId: capture.officialGameId,
              context,
              side: "AWAY",
              teamId: capture.awayLineup?.teamId,
              teamName: capture.awayLineup?.teamName ?? context.awayTeam,
              verification: capture.awayStarter,
            }),
          ]);
          starterResults.forEach((result) => {
            starterSnapshotsInserted += result.inserted;
            duplicateStarterSnapshotsSkipped += result.duplicate;
            starterChangesDetected += result.changed;
            errors.push(...result.warnings);
          });
        }
      } catch (error) {
        errors.push(serializeError(error));
        storageHealth = "ERROR";
      }
    }

    return NextResponse.json({
      ok: storageHealth === "OK",
      generatedAt: new Date().toISOString(),
      gamesInspected: inspectableGames.length,
      gamesMapped,
      lineupSnapshotsInserted,
      duplicateSnapshotsSkipped,
      firstConfirmedLineups,
      lineupChangesDetected,
      lateScratchesDetected,
      starterChangesDetected,
      starterSnapshotsInserted,
      duplicateStarterSnapshotsSkipped,
      partialLineups,
      unavailableLineups,
      errors: errors.slice(0, 25),
      storageHealth,
      oddsProviderHealth: health,
      examples: {
        firstConfirmedLineup: exampleFirstConfirmed,
        lineupChange: exampleLineupChange,
      },
      flags: {
        lineupSnapshotsEnabled: flags.lineupSnapshotsEnabled,
        lineupChangeDetectionEnabled: flags.lineupChangeDetectionEnabled,
        starterVerificationSnapshotsEnabled: flags.starterVerificationSnapshotsEnabled,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Lineup capture failed",
        details: serializeError(error),
        storageHealth: "ERROR",
      },
      { status: 500 },
    );
  }
}
