import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getYesterdayET() {
  const now = new Date();
  const et = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );
  et.setDate(et.getDate() - 1);

  return et.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export async function GET() {
  try {
    const yesterday = getYesterdayET();

    const { data, error } = await supabase
      .from("mlb_top5_history")
      .select("*")
      .eq("date", yesterday)
      .in("result", ["WON", "LOST", "PUSH"])
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      history: data ?? [],
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}