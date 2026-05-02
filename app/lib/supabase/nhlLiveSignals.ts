import { supabase } from "./client";

function todayMiamiDate() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export async function getNhlPublicSignals() {
  const today = todayMiamiDate();

  const { data, error } = await supabase
    .from("nhl_public_signals")
    .select("*")
    .eq("sport", "NHL")
    .eq("date", today)
    .order("start_time", { ascending: true });

  if (error) {
    console.log("NHL public signals error:", error);
    return [];
  }

  return data ?? [];
}

export async function getNhlTop5Live() {
  const today = todayMiamiDate();

  const { data, error } = await supabase
    .from("nhl_top5_live")
    .select("*")
    .eq("sport", "NHL")
    .eq("date", today)
    .order("rank", { ascending: true });

  if (error) {
    console.log("NHL top5 live error:", error);
    return [];
  }

  return data ?? [];
}