import { supabase } from "./client";

export async function getNbaPublicSignals() {
  const { data, error } = await supabase
    .from("nba_public_signals")
    .select("*")
    .order("start_time", { ascending: true });

  if (error) {
    console.log("NBA public signals error:", error);
    return [];
  }

  return data ?? [];
}

export async function getNbaTop5Live() {
  const { data, error } = await supabase
    .from("nba_top5_live")
    .select("*")
    .order("rank", { ascending: true });

  if (error) {
    console.log("NBA top5 live error:", error);
    return [];
  }

  return data ?? [];
}