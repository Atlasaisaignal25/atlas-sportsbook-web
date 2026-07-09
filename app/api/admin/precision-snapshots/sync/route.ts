import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import {
  normalizePrecisionDate,
  syncPrecisionSnapshots,
} from "@/app/lib/precision-engine";

export const dynamic = "force-dynamic";

async function readDate(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryDate = searchParams.get("date");

  if (queryDate) {
    return normalizePrecisionDate(queryDate);
  }

  try {
    const body = await request.json();
    return normalizePrecisionDate(body?.date);
  } catch {
    return normalizePrecisionDate(null);
  }
}

export async function POST(request: Request) {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const date = await readDate(request);

  try {
    const result = await syncPrecisionSnapshots(date);

    return NextResponse.json({
      success: true,
      date,
      source: result.candidateSource,
      candidateSource: result.candidateSource,
      syncedCount: result.snapshots.length,
      snapshots: result.snapshots,
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
            : "Unable to sync Precision Engine snapshots.",
        sqlFile: "precision_engine_schema.sql",
      },
      { status: 500 }
    );
  }
}
