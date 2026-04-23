import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const picks = Array.isArray(body?.picks) ? body.picks : [];

    if (!picks.length) {
      return NextResponse.json(
        { success: false, error: "No picks provided" },
        { status: 400 }
      );
    }

    const date = body.date;

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];

      const row = {
        date,
        sport: "SOCCER",
        rank: Number(pick.rank ?? i + 1),
        away_team: pick.awayTeam ?? "",
        home_team: pick.homeTeam ?? "",
        pick: pick.pick ?? "",
        market: pick.market ?? "",
        line: pick.line ?? null,
        odds: pick.odds ?? null,
        result: pick.result ?? "PENDING",
        graded_at: pick.gradedAt ?? null,
        home_score: pick.home_score ?? null,
        away_score: pick.away_score ?? null,
        start_time: pick.startTime ?? null,
      };

      const { data: existing } = await supabase
        .from("soccer_top5_history")
        .select("id")
        .eq("date", row.date)
        .eq("away_team", row.away_team)
        .eq("home_team", row.home_team)
        .limit(1);

      if (!existing || existing.length === 0) {
        const { error } = await supabase
          .from("soccer_top5_history")
          .insert([row]);

        if (error) {
          console.error("Soccer top5 insert error:", error);
          return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}