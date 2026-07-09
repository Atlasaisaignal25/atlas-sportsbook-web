import { supabase } from "./client";

function todayMiamiDate() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export async function getNbaPublicSignals(date = todayMiamiDate()) {
  const { data, error } = await supabase
    .from("nba_public_signals")
    .select("*")
    .eq("date", date)
    .order("start_time", { ascending: true });

  if (error) {
    console.log("NBA public signals error:", error);
    return [];
  }

  return data ?? [];
}

export async function getNbaTop5Live(date = todayMiamiDate()) {
  const { data, error } = await supabase
    .from("nba_top5_live")
    .select("*")
    .eq("date", date)
    .order("rank", { ascending: true });

  if (error) {
    console.log("NBA top5 live error:", error);
    return [];
  }

  return data ?? [];
}
