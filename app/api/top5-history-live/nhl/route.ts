import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

function getYesterdayInET() {
  const now = new Date();
  const etNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  );

  etNow.setDate(etNow.getDate() - 1);

  return etNow.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export async function GET() {
  try {
    const yesterday = getYesterdayInET();

    const { data, error } = await supabase
      .from("nhl_top_signal_history")
      .select("*")
      .eq("date", yesterday)
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
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    );
  }
}