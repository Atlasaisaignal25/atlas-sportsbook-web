import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function buildRecordResponse(tableName: string, req?: Request) {
  try {
    const date = req ? new URL(req.url).searchParams.get("date") : null;
    let query = supabase.from(tableName).select("result,date");

    if (date) query = query.eq("date", date);

    const { data, error } = await query;

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
