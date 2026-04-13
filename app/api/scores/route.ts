import { NextResponse } from "next/server";

const sportGroups = {
  NBA: ["basketball_nba"],
  NHL: ["icehockey_nhl"],
  MLB: ["baseball_mlb"],
  SOCCER: [
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_italy_serie_a",
    "soccer_germany_bundesliga",
    "soccer_france_ligue_one",
    "soccer_usa_mls",
    "soccer_mexico_ligamx",
    "soccer_uefa_champs_league",
    "soccer_uefa_europa_league",
    "soccer_uefa_europa_conference_league",
  ],
} as const;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = (searchParams.get("sport") || "NBA").toUpperCase();

    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing ODDS_API_KEY in environment variables" },
        { status: 500 }
      );
    }

    const selectedSports =
      sport in sportGroups
        ? sportGroups[sport as keyof typeof sportGroups]
        : sportGroups.NBA;

    const responses = await Promise.all(
      selectedSports.map(async (sportKey) => {
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores?daysFrom=1&apiKey=${apiKey}`;

        const res = await fetch(url, {
          cache: "no-store",
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Scores API failed for ${sportKey}: ${text}`);
        }

        const data = await res.json();
        return Array.isArray(data)
          ? data.map((game) => ({
              ...game,
              sport_key: sportKey,
            }))
          : [];
      })
    );

    const merged = responses.flat();

    return NextResponse.json(merged);
  } catch (error) {
    console.error("Scores route error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch live scores",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}