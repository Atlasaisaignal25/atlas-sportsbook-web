import { NextResponse } from "next/server";
import {
  buildPrecisionPublicResponse,
  getPrecisionRequestDate,
  getPrecisionSnapshot,
  getPrecisionUserContext,
  normalizePrecisionSport,
} from "@/app/lib/precision-engine/access";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sport: string }> }
) {
  const { sport: sportParam } = await params;
  const sport = normalizePrecisionSport(sportParam);

  if (!sport) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported sport",
        supportedSports: ["mlb", "nba", "nhl", "soccer", "nfl"],
      },
      { status: 400 }
    );
  }

  const date = getPrecisionRequestDate(request);

  try {
    const [snapshot, access] = await Promise.all([
      getPrecisionSnapshot({
        productType: "top_signal",
        sport,
        date,
      }),
      getPrecisionUserContext({
        productType: "top_signal",
        sport,
        date,
      }),
    ]);

    return NextResponse.json(
      buildPrecisionPublicResponse({
        productType: "top_signal",
        sport,
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
            : "Unable to load Top Signal.",
      },
      { status: 500 }
    );
  }
}
