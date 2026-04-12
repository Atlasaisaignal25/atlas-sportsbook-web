import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get("sport") || "icehockey_nhl";

    const apiKey = process.env.ODDS_API_KEY;

    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

    const res = await fetch(url, {
      cache: "no-store",
    });

    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}