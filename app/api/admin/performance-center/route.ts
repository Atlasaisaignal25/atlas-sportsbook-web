import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SportKey = "MLB" | "NBA" | "NFL" | "NHL" | "SOCCER";
type ProductKey = "top5" | "topSignal" | "global";

type SportConfig = {
  sport: SportKey;
  top5HistoryTable?: string;
  topSignalHistoryTable?: string;
  markets: string[];
  futureMarkets?: string[];
};

type NormalizedPick = {
  sport: SportKey;
  product: Exclude<ProductKey, "global">;
  date: string | null;
  gameId: string | null;
  rank: number | null;
  market: string;
  selection: string;
  result: "WON" | "LOST" | "PUSH";
  odds: number | null;
  clv: number | null;
  gradedAt: string | null;
  identity: string;
};

type MlbOfficialPerformancePick = NormalizedPick & { isTopSignal: boolean };

const sportConfigs: Record<SportKey, SportConfig> = {
  MLB: {
    sport: "MLB",
    top5HistoryTable: "mlb_top5_history",
    topSignalHistoryTable: "mlb_top_signal_history",
    markets: ["MONEYLINE", "RUN LINE", "TOTALS"],
    futureMarkets: ["F5 MONEYLINE", "F5 RUN LINE", "F5 TOTALS", "NRFI", "YRFI"],
  },
  NBA: {
    sport: "NBA",
    top5HistoryTable: "nba_top5_history",
    topSignalHistoryTable: "nba_top_signal_history",
    markets: ["MONEYLINE", "SPREADS", "TOTALS"],
    futureMarkets: ["PLAYER PROPS", "TEAM TOTALS"],
  },
  NFL: {
    sport: "NFL",
    markets: ["MONEYLINE", "SPREADS", "TOTALS"],
    futureMarkets: ["TEAM TOTALS", "PLAYER PROPS"],
  },
  NHL: {
    sport: "NHL",
    top5HistoryTable: "nhl_top5_history",
    topSignalHistoryTable: "nhl_top_signal_history",
    markets: ["MONEYLINE", "PUCK LINE", "TOTALS"],
  },
  SOCCER: {
    sport: "SOCCER",
    top5HistoryTable: "soccer_top5_history",
    topSignalHistoryTable: "soccer_top_signal_history",
    markets: ["1X2", "DRAW NO BET", "ASIAN HANDICAP", "TOTALS", "BOTH TEAMS TO SCORE"],
  },
};

function periodStart(period: string) {
  const now = new Date();
  const start = new Date(now);
  if (period === "all-time") return null;
  if (period === "last-7-days") start.setDate(now.getDate() - 7);
  else if (period === "last-30-days") start.setDate(now.getDate() - 30);
  else if (period === "this-week") start.setDate(now.getDate() - now.getDay());
  else if (period === "this-month") start.setDate(1);
  else if (period === "season") start.setMonth(2, 1);
  else if (period === "year") start.setMonth(0, 1);
  else start.setDate(1);

  return start.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function normalizeMarket(value: unknown, pick: unknown, sport: SportKey) {
  const market = String(value ?? "").toUpperCase();
  const text = String(pick ?? "").toUpperCase();
  if (market === "H2H" || market === "ML" || text.endsWith(" ML")) return sport === "SOCCER" ? "1X2" : "MONEYLINE";
  if (market === "SPREADS" || market === "SPREAD" || text.includes("+") || text.includes("-1.5") || text.includes("+1.5")) {
    if (sport === "MLB") return "RUN LINE";
    if (sport === "NHL") return "PUCK LINE";
    if (sport === "SOCCER") return "ASIAN HANDICAP";
    return "SPREADS";
  }
  if (market === "TOTALS" || market === "TOTAL" || text.includes("UNDER") || text.includes("OVER")) return "TOTALS";
  return market || "UNKNOWN";
}

function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resultOf(row: any) {
  const value = String(row.result ?? row.status ?? "").toUpperCase();
  if (value === "WON" || value === "LOST" || value === "PUSH") return value;
  return null;
}

function isCanonical(row: any) {
  return row.canonical !== false && row.is_canonical !== false && row.noncanonical !== true;
}

function isOfficial(row: any) {
  const result = String(row.result ?? row.status ?? "").toUpperCase();
  if (!["WON", "LOST", "PUSH"].includes(result)) return false;
  if (["PENDING", "REMOVED", "VOID", "CANCELLED", "CANCELED"].includes(result)) return false;
  if (!isCanonical(row)) return false;
  const source = `${row.source ?? ""} ${row.product ?? ""} ${row.type ?? ""}`.toUpperCase();
  return !source.includes("TEST") && !source.includes("RESEARCH");
}

function americanProfit(odds: number | null) {
  if (odds === null || odds === 0) return null;
  return odds > 0 ? odds / 100 : 100 / Math.abs(odds);
}

function pickIdentity(sport: SportKey, row: any, market: string, product: ProductKey) {
  const gameId = String(row.game_id ?? row.gameId ?? `${row.date ?? ""}-${row.away_team ?? ""}-${row.home_team ?? ""}`);
  const selection = String(row.pick ?? row.selection ?? "");
  const date = String(row.date ?? "").slice(0, 10);
  return [sport, date, gameId, market, selection, product === "global" ? "" : product].join("|").toLowerCase();
}

function globalIdentity(pick: NormalizedPick) {
  return [pick.sport, pick.date ?? "", pick.gameId ?? "", pick.market, pick.selection].join("|").toLowerCase();
}

function sampleStatus(graded: number) {
  if (graded < 20) return "LOW SAMPLE";
  if (graded < 100) return "DEVELOPING";
  return "RELIABLE";
}

function aggregate(rows: NormalizedPick[]) {
  const won = rows.filter((row) => row.result === "WON").length;
  const lost = rows.filter((row) => row.result === "LOST").length;
  const push = rows.filter((row) => row.result === "PUSH").length;
  const graded = rows.length;
  const pricedRows = rows.filter((row) => row.odds !== null);
  const allPriced = pricedRows.length === rows.length && rows.length > 0;
  const units = allPriced
    ? rows.reduce((sum, row) => {
        if (row.result === "WON") return sum + (americanProfit(row.odds) ?? 0);
        if (row.result === "LOST") return sum - 1;
        return sum;
      }, 0)
    : null;
  const clvRows = rows.map((row) => row.clv).filter((value): value is number => value !== null);
  const oddsRows = rows.map((row) => row.odds).filter((value): value is number => value !== null);

  return {
    graded,
    won,
    lost,
    push,
    winRate: won + lost > 0 ? won / (won + lost) : null,
    units,
    roi: units !== null && graded > 0 ? units / graded : null,
    averageClv: clvRows.length ? clvRows.reduce((sum, value) => sum + value, 0) / clvRows.length : null,
    averageOdds: oddsRows.length ? Math.round(oddsRows.reduce((sum, value) => sum + value, 0) / oddsRows.length) : null,
    lastGraded: rows.map((row) => row.gradedAt).filter(Boolean).sort().at(-1) ?? null,
    sampleStatus: sampleStatus(graded),
  };
}

async function fetchProductRows(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  sport: SportKey;
  table?: string;
  product: Exclude<ProductKey, "global">;
  period: string;
}) {
  if (!params.table) return { rows: [] as NormalizedPick[], error: null as string | null, table: null as string | null };

  let query = params.supabase.from(params.table).select("*").limit(2000);
  const start = periodStart(params.period);
  if (start) query = query.gte("date", start);
  const { data, error } = await query;
  if (error) return { rows: [] as NormalizedPick[], error: error.message, table: params.table };

  const rows = (data ?? [])
    .filter(isOfficial)
    .map((row: any): NormalizedPick | null => {
      const result = resultOf(row);
      if (!result) return null;
      const market = normalizeMarket(row.market, row.pick, params.sport);
      const gameId = row.game_id ?? row.gameId ?? null;
      const selection = String(row.pick ?? row.selection ?? "");
      return {
        sport: params.sport,
        product: params.product,
        date: row.date ?? null,
        gameId,
        rank: numeric(row.rank),
        market,
        selection,
        result,
        odds: numeric(row.odds),
        clv: numeric(row.clv ?? row.clv_probability ?? row.average_clv),
        gradedAt: row.graded_at ?? row.updated_at ?? row.created_at ?? null,
        identity: pickIdentity(params.sport, row, market, params.product),
      };
    })
    .filter((row: NormalizedPick | null): row is NormalizedPick => Boolean(row));

  return { rows, error: null as string | null, table: params.table };
}

async function fetchMlbOfficialRows(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  period: string;
}) {
  let query = params.supabase
    .from("mlb_research_validation_history")
    .select("game_id,game_date,home_team,away_team,market,selection,result,published_price,market_price,clv_probability,official_rank,is_top_signal,official_published_at,graded_at,pregame_snapshot_at")
    .eq("record_type", "OFFICIAL")
    .eq("canonical", true)
    .in("result", ["WON", "LOST", "PUSH"])
    .limit(2000);
  const start = periodStart(params.period);
  if (start) query = query.gte("game_date", start);
  const { data, error } = await query;
  if (error) return { top5Rows: [] as NormalizedPick[], topSignalRows: [] as NormalizedPick[], error: error.message, table: "mlb_research_validation_history" };

  const rowsWithTopSignal = (data ?? []).map((row: any): MlbOfficialPerformancePick | null => {
    const result = resultOf(row);
    if (!result) return null;
    const market = normalizeMarket(row.market, row.selection, "MLB");
    const selection = String(row.selection ?? "");
    return {
      sport: "MLB",
      product: "top5",
      date: row.game_date ?? String(row.pregame_snapshot_at ?? "").slice(0, 10),
      gameId: row.game_id ?? null,
      rank: numeric(row.official_rank),
      market,
      selection,
      result,
      odds: numeric(row.published_price ?? row.market_price),
      clv: numeric(row.clv_probability),
      gradedAt: row.graded_at ?? row.official_published_at ?? row.pregame_snapshot_at ?? null,
      identity: pickIdentity("MLB", { ...row, rank: row.official_rank, date: row.game_date, pick: selection }, market, "top5"),
      isTopSignal: Boolean(row.is_top_signal),
    };
  }).filter((row: MlbOfficialPerformancePick | null): row is MlbOfficialPerformancePick => Boolean(row));
  const rows = rowsWithTopSignal.map(({ isTopSignal: _isTopSignal, ...row }: MlbOfficialPerformancePick) => row);

  return {
    top5Rows: rows,
    topSignalRows: rowsWithTopSignal
      .filter((row: MlbOfficialPerformancePick) => row.isTopSignal)
      .map(({ isTopSignal: _isTopSignal, ...row }: MlbOfficialPerformancePick) => row)
      .map((row: NormalizedPick) => ({ ...row, product: "topSignal" as const, identity: row.identity.replace("|top5", "|topSignal") })),
    error: null as string | null,
    table: "mlb_research_validation_history",
  };
}

function dedupe(rows: NormalizedPick[], identity: (row: NormalizedPick) => string) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = identity(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest) {
  const { user, isAdmin } = await getAdminSession();
  if (!user || !isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sport = (url.searchParams.get("sport")?.toUpperCase() || "MLB") as SportKey;
  const period = url.searchParams.get("period") || "this-month";
  const config = sportConfigs[sport] ?? sportConfigs.MLB;
  const supabase = getSupabaseAdmin();

  const mlbOfficial = config.sport === "MLB" ? await fetchMlbOfficialRows({ supabase, period }) : null;
  const [top5Result, topSignalResult] = mlbOfficial
    ? [
        { rows: mlbOfficial.top5Rows, error: mlbOfficial.error, table: mlbOfficial.table },
        { rows: mlbOfficial.topSignalRows, error: mlbOfficial.error, table: mlbOfficial.table },
      ]
    : await Promise.all([
        fetchProductRows({ supabase, sport: config.sport, table: config.top5HistoryTable, product: "top5", period }),
        fetchProductRows({ supabase, sport: config.sport, table: config.topSignalHistoryTable, product: "topSignal", period }),
      ]);

  const top5Rows = dedupe(top5Result.rows, (row) => row.identity);
  const topSignalRows = dedupe(topSignalResult.rows, (row) => row.identity);
  const globalRows = dedupe([...top5Rows, ...topSignalRows], globalIdentity);

  const marketRows = config.markets
    .map((market) => {
      const rows = globalRows.filter((row) => row.market === market);
      return { market, ...aggregate(rows) };
    })
    .filter((row) => row.graded > 0);

  const byProduct = {
    top5: config.markets
      .map((market) => ({ market, ...aggregate(top5Rows.filter((row) => row.market === market)) }))
      .filter((row) => row.graded > 0),
    topSignal: config.markets
      .map((market) => ({ market, ...aggregate(topSignalRows.filter((row) => row.market === market)) }))
      .filter((row) => row.graded > 0),
  };

  const rankBreakdown = [1, 2, 3, 4, 5].map((rank) => ({
    rank,
    ...aggregate(top5Rows.filter((row) => row.rank === rank)),
  }));

  return NextResponse.json({
    sport: config.sport,
    period,
    lastUpdated: new Date().toISOString(),
    tables: {
      top5History: top5Result.table,
      topSignalHistory: topSignalResult.table,
    },
    errors: [top5Result.error, topSignalResult.error].filter(Boolean),
    overview: aggregate(globalRows),
    topSignalHistory: aggregate(topSignalRows),
    top5Performance: {
      ...aggregate(top5Rows),
      byRank: rankBreakdown,
    },
    marketPerformance: {
      global: marketRows,
      byProduct,
      marketsConfigured: config.markets,
      futureMarkets: config.futureMarkets ?? [],
    },
    totals: {
      top5Graded: top5Rows.length,
      topSignalGraded: topSignalRows.length,
      globalGraded: globalRows.length,
    },
  });
}
