import { NextResponse } from "next/server";
import {
  getSportsDataIoGameDetail,
  isSportsDataIoSport,
} from "@/app/lib/sportsdataio";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = (searchParams.get("sport") || "MLB").toUpperCase();
    const gameId = searchParams.get("gameId");

    if (!isSportsDataIoSport(sport)) {
      return NextResponse.json(
        { error: "Unsupported SportsDataIO sport" },
        { status: 400 }
      );
    }

    if (!gameId) {
      return NextResponse.json(
        { error: "Missing gameId" },
        { status: 400 }
      );
    }

    const detail = await getSportsDataIoGameDetail(sport, gameId);

    return NextResponse.json({
      success: true,
      ...detail,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        provider: "sportsdataio",
        error: "Failed to fetch SportsDataIO game detail",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}

