import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { data: existing } = await supabase
      .from("nhl_top_signal_history")
      .select("id")
      .eq("date", body.date)
      .eq("away_team", body.awayTeam)
      .eq("home_team", body.homeTeam)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ success: true, message: "Already exists" });
    }

    const { error } = await supabase
      .from("nhl_top_signal_history")
      .insert([
        {
          date: body.date,
          sport: body.sport,
          away_team: body.awayTeam,
          home_team: body.homeTeam,
          pick: body.pick,
          market: body.market,
          line: body.line,
          odds: body.odds,
          result: body.result ?? "PENDING",
          graded_at: body.gradedAt,
          home_score: body.home_score,
          away_score: body.away_score,
          is_top_signal: body.isTopSignal ?? true,
          start_time: body.startTime,
        },
      ]);

    if (error) {
      console.error("NHL insert error:", error);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}