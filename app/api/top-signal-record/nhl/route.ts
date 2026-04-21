import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("nhl_top_signal_history")
      .select("result");

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? data : [];

    const wins = rows.filter((r) => r.result === "WON").length;
    const losses = rows.filter((r) => r.result === "LOST").length;
    const pushes = rows.filter((r) => r.result === "PUSH").length;
    const decided = wins + losses;
    const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

    return NextResponse.json({
      success: true,
      wins,
      losses,
      pushes,
      decided,
      winRate,
      total: rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}