import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    let query = supabase
      .from("nhl_top5_history")
      .select("*")
      .order("date", { ascending: false })
      .order("rank", { ascending: true })
      .order("created_at", { ascending: false });

    if (date) query = query.eq("date", date);
    else query = query.limit(100);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      history: dedupeTop5History(data ?? []),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}

function dedupeTop5History(rows: any[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = `${row.date}-${row.rank}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
