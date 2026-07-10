import { NextResponse } from "next/server";
import {
  captureMlbOffensiveFormSnapshots,
  selectOffensiveDiagnosticExamples,
} from "@/app/lib/mlb-engine/sports-intelligence/offense/offensive-form-capture";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await captureMlbOffensiveFormSnapshots();
    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      teamsInspected: result.teamsInspected,
      teamsMapped: result.teamsMapped,
      windowsCalculated: result.windowsCalculated,
      snapshotsInserted: result.snapshotsInserted,
      duplicateSnapshotsSkipped: result.duplicateSnapshotsSkipped,
      sufficientWindows: result.sufficientWindows,
      limitedWindows: result.limitedWindows,
      insufficientWindows: result.insufficientWindows,
      unavailableWindows: result.unavailableWindows,
      statcastRowsProcessed: result.statcastRowsProcessed,
      uniquePlateAppearances: result.uniquePlateAppearances,
      providerErrors: result.providerErrors,
      storageHealth: result.storageHealth,
      baselinesInserted: result.baselinesInserted,
      duplicateBaselinesSkipped: result.duplicateBaselinesSkipped,
      teamsScored: result.teamsScored,
      teamsUnscored: result.teamsUnscored,
      scoreMode: result.scoreMode,
      scoreDistribution: result.scoreDistribution,
      baselineStatus: result.baselineStatus,
      requestHealth: {
        scheduleRequests: result.requestHealth.scheduleRequests,
        statcastRequests: result.requestHealth.statcastRequests,
        statcastCacheHits: result.requestHealth.statcastCacheHits,
        statcastCacheMisses: result.requestHealth.statcastCacheMisses,
        statcastRows: result.requestHealth.statcastRows,
        statcastLatencyMs: result.requestHealth.statcastLatencyMs,
      },
      sampleQualityDistribution: result.sampleQualityDistribution,
      examples: selectOffensiveDiagnosticExamples(result.teamForms),
      offensiveScoreEnabled: result.scoreEnabled,
      rawCsvRowsReturned: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Offensive form capture failed",
        details: serializeError(error),
      },
      { status: 500 },
    );
  }
}
