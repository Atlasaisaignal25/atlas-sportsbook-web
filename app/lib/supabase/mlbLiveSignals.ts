import { supabase } from "./client";

type MlbLiveSignalRow = {
  id?: string;
  sport?: string;
  game_id?: string;
  date?: string;
  away_team?: string;
  home_team?: string;
  pick?: string | null;
  market?: string | null;
  line?: string | number | null;
  odds?: string | number | null;
  status?: string | null;
  analysis_summary?: string | null;
  confidence_label?: string | null;
  edge_label?: string | null;
  risk_note?: string | null;
  model_factors?: unknown;
  start_time?: string | null;
  commence_time?: string | null;
  metadata?: Record<string, unknown> | null;
  rank?: number | null;
  is_top_signal?: boolean | null;
  confidence?: number | null;
  internal_score?: number | null;
  pick_ranking?: number | null;
  edge?: number | null;
  conviction_grade?: string | null;
  consensus_grade?: string | null;
  validation_reasons?: unknown;
};

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

function isAtlasCoreMlbEnabled() {
  return process.env.NEXT_PUBLIC_ATLAS_CORE_MLB_ENABLED === "true";
}

function normalizeSignalKeyPart(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeDisplaySignals<T extends {
  sport?: unknown;
  away_team?: unknown;
  home_team?: unknown;
  start_time?: unknown;
  pick?: unknown;
  market?: unknown;
  metadata?: unknown;
}>(rows: T[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = [
      normalizeSignalKeyPart(row.sport ?? "MLB"),
      normalizeSignalKeyPart(row.away_team),
      normalizeSignalKeyPart(row.home_team),
      normalizeSignalKeyPart(row.start_time),
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getMlbPublicSignals(date = todayMiamiDate()) {
  if (isAtlasCoreMlbEnabled()) {
    const { data, error } = await supabase
      .from("atlas_core_mlb_signals")
      .select("*")
      .eq("sport", "MLB")
      .eq("date", date)
      .eq("stage", "SIGNALS_DETECTED")
      .order("start_time", { ascending: true });

    if (error) {
      console.error("getMlbPublicSignals atlas core error:", error);
      return [];
    }

    return dedupeDisplaySignals((data ?? []) as MlbLiveSignalRow[]).map((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};

      return {
        id: row.id,
        sport: "MLB",
        game_id: row.game_id,
        date: row.date,
        away_team: row.away_team,
        home_team: row.home_team,
        pick: metadata.detectedPick ?? "Pending",
        market: metadata.detectedMarket ?? null,
        line: metadata.detectedLine ?? null,
        odds: metadata.detectedOdds ?? null,
        status: "Pending",
        analysis_summary: null,
        confidence_label: null,
        edge_label: null,
        risk_note: null,
        model_factors: null,
        start_time: row.start_time,
      };
    });
  }

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
  if (isAtlasCoreMlbEnabled()) {
    const { data, error } = await supabase
      .from("atlas_core_mlb_picks")
      .select("*")
      .eq("sport", "MLB")
      .eq("date", date)
      .in("status", ["INTERNAL_CANDIDATE", "UNDER_REVIEW", "VALIDATED", "CONFIRMED"])
      .or("engine_product.eq.PREMIUM_TOP5,engine_product.is.null")
      .order("rank", { ascending: true });

    if (error) {
      console.error("MLB atlas core top5 live error:", error);
      return [];
    }

    return ((data ?? []) as MlbLiveSignalRow[]).map((row) => ({
      gameId: row.game_id,
      awayTeam: row.away_team,
      homeTeam: row.home_team,
      pick: row.pick,
      market: row.market,
      line: row.line,
      odds: row.odds,
      status: row.status,
      rank: row.rank,
      isTopSignal: row.is_top_signal,
      confidence: row.confidence,
      internalScore: row.pick_ranking,
      edge: row.edge,
      analysisSummary: "Atlas Core validated this pick through the Final Pick Gate.",
      confidenceLabel: row.conviction_grade,
      edgeLabel: row.consensus_grade,
      riskNote: "This pick is shown only after Atlas Core validation. Final pregame status may update to confirmed, downgraded or removed.",
      modelFactors: row.validation_reasons,
      startTime: row.start_time,
      start_time: row.start_time,
    }));
  }

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

  return ((data ?? []) as MlbLiveSignalRow[]).map((row) => {
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
