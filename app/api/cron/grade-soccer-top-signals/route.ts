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

function getLastWord(value: string) {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function gradePickFromScore(
  pickRaw: string,
  awayTeam: string,
  homeTeam: string,
  awayScore: number,
  homeScore: number
): "WON" | "LOST" | "PUSH" | "PENDING" {
  const pick = String(pickRaw ?? "").trim().toLowerCase();
  const pickNorm = normalizeName(pickRaw);
  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(awayTeam);
  const homeName = normalizeName(homeTeam);
  const awayLast = getLastWord(awayTeam);
  const homeLast = getLastWord(homeTeam);

  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return "PENDING";
  }

  const totalMatch =
    pick.match(/\bover\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bunder\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bo\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bu\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);
    if (!Number.isFinite(line)) return "PENDING";

    const isOver = /\bover\b|\bo\b/i.test(pick);
    const isUnder = /\bunder\b|\bu\b/i.test(pick);

    if (isOver) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (isUnder) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  const spreadMatch = pickRaw.match(
    /^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/
  );

  if (spreadMatch) {
    const teamPartRaw = spreadMatch[1].trim();
    const teamPart = normalizeName(teamPartRaw);
    const teamLast = getLastWord(teamPartRaw);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    const isAwayTeam =
      teamPart.includes(awayName) ||
      awayName.includes(teamPart) ||
      (teamLast && teamLast === awayLast);

    const isHomeTeam =
      teamPart.includes(homeName) ||
      homeName.includes(teamPart) ||
      (teamLast && teamLast === homeLast);

    if (isAwayTeam) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (isHomeTeam) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
  }

  const looksLikeAwayML =
    pickNorm.includes(awayName) ||
    awayName.includes(pickNorm) ||
    (awayLast && pickNorm.includes(awayLast));

  const looksLikeHomeML =
    pickNorm.includes(homeName) ||
    homeName.includes(pickNorm) ||
    (homeLast && pickNorm.includes(homeLast));

  if (looksLikeAwayML && !looksLikeHomeML) {
    if (awayScore > homeScore) return "WON";
    if (awayScore < homeScore) return "LOST";
    return "PUSH";
  }

  if (looksLikeHomeML && !looksLikeAwayML) {
    if (homeScore > awayScore) return "WON";
    if (homeScore < awayScore) return "LOST";
    return "PUSH";
  }

  return "PENDING";
}

export async function GET() {
  try {
    const { data: pendingRows, error: fetchError } = await supabase
      .from("soccer_top_signal_history")
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

    const soccerLeagues = [
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
    ];

    const responses = await Promise.all(
      soccerLeagues.map(async (league) => {
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
        match.scores?.find(
          (s: any) => normalizeName(s.name) === normalizeName(match.away_team)
        )?.score ?? NaN
      );

      const homeScore = Number(
        match.scores?.find(
          (s: any) => normalizeName(s.name) === normalizeName(match.home_team)
        )?.score ?? NaN
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
        .from("soccer_top_signal_history")
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