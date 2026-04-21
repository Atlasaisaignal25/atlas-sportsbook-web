import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const oddsApiKey = process.env.ODDS_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

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

function gradePickFromScore(
  pickRaw: string,
  awayTeam: string,
  homeTeam: string,
  awayScore: number,
  homeScore: number
): "WON" | "LOST" | "PUSH" | "PENDING" {
  const pick = String(pickRaw ?? "").trim().toLowerCase();
  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(awayTeam);
  const homeName = normalizeName(homeTeam);

  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return "PENDING";
  }

  if (pick.includes("ml")) {
    const pickNorm = normalizeName(pickRaw);

    if (pickNorm.includes(awayName)) {
      return awayScore > homeScore ? "WON" : "LOST";
    }

    if (pickNorm.includes(homeName)) {
      return homeScore > awayScore ? "WON" : "LOST";
    }

    return "PENDING";
  }

  const totalMatch =
    pick.match(/over\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    pick.match(/under\s*([0-9]+(?:\.[0-9]+)?)/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);

    if (!Number.isFinite(line)) return "PENDING";

    if (pick.includes("over")) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (pick.includes("under")) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  const spreadMatch = pickRaw.match(
    /^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/i
  );

  if (spreadMatch) {
    const teamPart = normalizeName(spreadMatch[1]);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    if (teamPart.includes(awayName) || awayName.includes(teamPart)) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (teamPart.includes(homeName) || homeName.includes(teamPart)) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
  }

  return "PENDING";
}

export async function GET() {
  try {
    const { data: pendingRows, error: fetchError } = await supabase
      .from("mlb_top_signal_history")
      .select("*")
      .eq("result", "PENDING");

    if (fetchError) {
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 }
      );
    }

    if (!pendingRows || pendingRows.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: "No pending rows" });
    }

    const scoresRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/baseball_mlb/scores?daysFrom=3&apiKey=${oddsApiKey}`,
      { cache: "no-store" }
    );

    if (!scoresRes.ok) {
      const text = await scoresRes.text();
      return NextResponse.json(
        { success: false, error: text },
        { status: 500 }
      );
    }

    const scoreGames = await scoresRes.json();

    let updatedCount = 0;

    for (const row of pendingRows) {
      const match = Array.isArray(scoreGames)
        ? scoreGames.find((game: any) => {
            const awayMatch =
              normalizeName(game.away_team) === normalizeName(row.away_team);
            const homeMatch =
              normalizeName(game.home_team) === normalizeName(row.home_team);

            return awayMatch && homeMatch && game.completed === true;
          })
        : null;

      if (!match) continue;

      const awayScore = Number(
        match.scores?.find((s: any) => normalizeName(s.name) === normalizeName(match.away_team))?.score ?? NaN
      );

      const homeScore = Number(
        match.scores?.find((s: any) => normalizeName(s.name) === normalizeName(match.home_team))?.score ?? NaN
      );

      const gradedResult = gradePickFromScore(
        row.pick,
        row.away_team,
        row.home_team,
        awayScore,
        homeScore
      );

      if (gradedResult === "PENDING") continue;

      const { error: updateError } = await supabase
        .from("mlb_top_signal_history")
        .update({
          result: gradedResult,
          graded_at: new Date().toISOString(),
          away_score: awayScore,
          home_score: homeScore,
        })
        .eq("id", row.id);

      if (!updateError) {
        updatedCount += 1;
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Unexpected cron error" },
      { status: 500 }
    );
  }
}