import { NextResponse } from "next/server";
import {
  getSportsDataIoScores,
  isSportsDataIoSport,
} from "@/app/lib/sportsdataio";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = (searchParams.get("sport") || "MLB").toUpperCase();
    const date = searchParams.get("date");

    if (!isSportsDataIoSport(sport)) {
      return NextResponse.json(
        { error: "Unsupported SportsDataIO sport" },
        { status: 400 }
      );
    }

    const games = await getSportsDataIoScores(sport, date);

    return NextResponse.json({
      success: true,
      provider: "sportsdataio",
      sport,
      games,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        provider: "sportsdataio",
        error: "Failed to fetch SportsDataIO scores",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}

