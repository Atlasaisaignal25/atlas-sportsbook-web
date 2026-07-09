import { supabase } from "./client";

function todayMiamiDate() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export async function getSoccerPublicSignals(date = todayMiamiDate()) {
  const { data, error } = await supabase
    .from("soccer_public_signals")
    .select("*")
    .eq("date", date)
    .order("start_time", { ascending: true });

  if (error) {
    console.log("Soccer public signals error:", error);
    return [];
  }

  return data ?? [];
}

export async function getSoccerTop5Live(date = todayMiamiDate()) {
  const { data, error } = await supabase
    .from("soccer_top5_live")
    .select("*")
    .eq("date", date)
    .order("rank", { ascending: true });

  if (error) {
    console.log("Soccer top5 live error:", error);
    return [];
  }

  return data ?? [];
}
