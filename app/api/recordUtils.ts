import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function buildRecordResponse(tableName: string) {
  try {
    const { data, error } = await supabase.from(tableName).select("result");

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const rows = Array.isArray(data) ? data : [];
    const wins = rows.filter((row) => row.result === "WON").length;
    const losses = rows.filter((row) => row.result === "LOST").length;
    const pushes = rows.filter((row) => row.result === "PUSH").length;
    const pending = rows.filter((row) => row.result === "PENDING").length;
    const decided = wins + losses;
    const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

    return NextResponse.json({
      success: true,
      wins,
      losses,
      pushes,
      pending,
      decided,
      total: rows.length,
      winRate,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}
