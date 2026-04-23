import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const oddsApiKey = process.env.ODDS_API_KEY!;

function normalizeName(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET() {
  try {
    const { data: pendingRows, error: fetchError } = await supabase
      .from("soccer_top5_history")
      .select("*")
      .eq("result", "PENDING");

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 }
      );
    }

    if (!pendingRows || pendingRows.length === 0) {
      return NextResponse.json({
        success: true,
        updated: 0,
        message: "No pending rows",
      });
    }

    const leagues = [
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
      "soccer_england_championship"
    ];

    const responses = await Promise.all(
      leagues.map(async (league) => {
        const res = await fetch(
          `https://api.the-odds-api.com/v4/sports/${league}/scores?daysFrom=3&apiKey=${oddsApiKey}`,
          { cache: "no-store" }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      })
    );

    const scoreGames = responses.flat();

    let updatedCount = 0;

    for (const row of pendingRows) {
      const match = scoreGames.find((game: any) => {
        return (
          normalizeName(game.away_team) === normalizeName(row.away_team) &&
          normalizeName(game.home_team) === normalizeName(row.home_team) &&
          game.completed === true
        );
      });

      if (!match) continue;

      const awayScore = Number(
        match.scores?.find((s: any) => normalizeName(s.name) === normalizeName(match.away_team))?.score ?? NaN
      );

      const homeScore = Number(
        match.scores?.find((s: any) => normalizeName(s.name) === normalizeName(match.home_team))?.score ?? NaN
      );

      let result: "WON" | "LOST" | "PUSH" = "PUSH";

      if (awayScore > homeScore) result = "WON";
      else if (awayScore < homeScore) result = "LOST";

      const { error: updateError } = await supabase
        .from("soccer_top5_history")
        .update({
          result,
          graded_at: new Date().toISOString(),
          away_score: awayScore,
          home_score: homeScore,
        })
        .eq("id", row.id);

      if (!updateError) updatedCount++;
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unexpected cron error" },
      { status: 500 }
    );
  }
}