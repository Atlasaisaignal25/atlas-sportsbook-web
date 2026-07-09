import { supabase } from "./client";

function appendLineToPick(pick: string, line: unknown, style: "spread" | "total") {
  if (line === null || line === undefined) return pick;

  const numberLine = Number(line);
  const lineText =
    Number.isFinite(numberLine) && numberLine > 0 ? `+${numberLine}` : `${line}`;

  if (pick.includes(`(${lineText})`) || pick.includes(String(line))) {
    return pick;
  }

  return style === "spread" ? `${pick} (${lineText})` : `${pick} ${line}`;
}

function todayMiamiDate() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export async function getMlbPublicSignals(date = todayMiamiDate()) {

  const { data, error } = await supabase
    .from("mlb_public_signals")
    .select("*")
    .eq("sport", "MLB")
    .eq("date", date)
    .order("start_time", { ascending: true });

  if (error) {
    console.error("getMlbPublicSignals error:", error);
    return [];
  }

  return data ?? [];
}

export async function getMlbTop5Live(date = todayMiamiDate()) {
  const { data, error } = await supabase
    .from("mlb_top5_live")
    .select("*")
    .eq("sport", "MLB")
    .eq("date", date)
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
      formattedPick = appendLineToPick(pick, line, "spread");
    }

    if (market === "totals" && line !== null && line !== undefined) {
      formattedPick = appendLineToPick(pick, line, "total");
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
      analysisSummary: row.analysis_summary,
      confidenceLabel: row.confidence_label,
      edgeLabel: row.edge_label,
      riskNote: row.risk_note,
      modelFactors: row.model_factors,
      startTime: row.start_time ?? row.commence_time ?? null,
      start_time: row.start_time ?? row.commence_time ?? null,
    };
  });
}
