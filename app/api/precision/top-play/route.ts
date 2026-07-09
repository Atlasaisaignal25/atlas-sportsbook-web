import { NextResponse } from "next/server";
import {
  buildPrecisionPublicResponse,
  getPrecisionRequestDate,
  getPrecisionSnapshot,
  getPrecisionUserContext,
} from "@/app/lib/precision-engine/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const date = getPrecisionRequestDate(request);

  try {
    const [snapshot, access] = await Promise.all([
      getPrecisionSnapshot({
        productType: "top_play",
        sport: "global",
        date,
      }),
      getPrecisionUserContext({
        productType: "top_play",
        sport: "global",
        date,
      }),
    ]);

    return NextResponse.json(
      buildPrecisionPublicResponse({
        productType: "top_play",
        sport: "global",
        date,
        snapshot,
        access,
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load Top Play.",
      },
      { status: 500 }
    );
  }
}
