import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("nba_top5_history")
      .select("*")
      .order("date", { ascending: false })
      .order("rank", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(100);

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
  } catch {
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
