import { supabase } from "./client";

export async function getMlbPublicSignals() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { data, error } = await supabase
    .from("mlb_public_signals")
    .select("*")
    .eq("sport", "MLB")
    .eq("date", today)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("getMlbPublicSignals error:", error);
    return [];
  }

  return data ?? [];
}

export async function getMlbTop5Live() {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  const { data, error } = await supabase
    .from("mlb_top5_live")
    .select("*")
    .eq("sport", "MLB")
    .eq("date", today)
    .order("rank", { ascending: true });

  if (error) {
    console.error("getMlbTop5Live error:", error);
    return [];
  }

  return data ?? [];
}