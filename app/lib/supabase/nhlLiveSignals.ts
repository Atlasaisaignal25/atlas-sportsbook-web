import { supabase } from "./client";

export async function getNhlPublicSignals() {
  const { data, error } = await supabase
    .from("nhl_public_signals")
    .select("*")
    .order("start_time", { ascending: true });

  if (error) {
    console.log("NHL public signals error:", error);
    return [];
  }

  return data ?? [];
}

export async function getNhlTop5Live() {
  const { data, error } = await supabase
    .from("nhl_top5_live")
    .select("*")
    .order("rank", { ascending: true });

  if (error) {
    console.log("NHL top5 live error:", error);
    return [];
  }

  return data ?? [];
}