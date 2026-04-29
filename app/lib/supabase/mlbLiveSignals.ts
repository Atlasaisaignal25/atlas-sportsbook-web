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
    console.error("MLB top5 live error:", error);
    return [];
  }

  return (data ?? []).map((row: any) => {
    const market = String(row.market ?? "").toLowerCase();
    const pick = String(row.pick ?? "");
    const line = row.line;

    let formattedPick = pick;

    if (market === "spreads" && line !== null && line !== undefined) {
      const numberLine = Number(line);
      const lineText =
        Number.isFinite(numberLine) && numberLine > 0
          ? `+${numberLine}`
          : `${line}`;

      formattedPick = `${pick} (${lineText})`;
    }

    if (market === "totals" && line !== null && line !== undefined) {
      formattedPick = `${pick} ${line}`;
    }

    return {
      gameId: row.game_id,
      awayTeam: row.away_team,
      homeTeam: row.home_team,
      pick: formattedPick,
      status: row.status,
      rank: row.rank,
      isTopSignal: row.is_top_signal,
      confidence: row.confidence,
      internalScore: row.internal_score,
      edge: row.edge,
    };
  });
}