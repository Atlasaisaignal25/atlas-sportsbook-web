import { NextResponse } from "next/server";
import {
  normalizePrecisionDate,
  syncPrecisionSnapshots,
} from "@/app/lib/precision-engine";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request, cronSecret: string) {
  const { searchParams } = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = searchParams.get("secret");

  return bearer === cronSecret || querySecret === cronSecret;
}

async function runPrecisionCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Missing CRON_SECRET. Add CRON_SECRET before enabling /api/cron/precision-engine.",
        missingEnv: ["CRON_SECRET"],
      },
      { status: 501 }
    );
  }

  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = normalizePrecisionDate(searchParams.get("date"));

  try {
    const result = await syncPrecisionSnapshots(date);

    return NextResponse.json({
      success: true,
      date,
      source: result.candidateSource,
      candidateSource: result.candidateSource,
      syncedCount: result.snapshots.length,
      candidateCount: result.preview.candidateCount,
      qualifiedCount: result.preview.qualifiedCount,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        date,
        error:
          error instanceof Error
            ? error.message
            : "Unable to run Precision Engine cron.",
        sqlFile: "precision_engine_schema.sql",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return runPrecisionCron(request);
}

export async function POST(request: Request) {
  return runPrecisionCron(request);
}
