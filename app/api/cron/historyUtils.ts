import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import {
  getSportsDataIoScores,
  isSportsDataIoSport,
} from "@/app/lib/sportsdataio";

type Sport = "MLB" | "NBA" | "NHL" | "SOCCER";
type GradeResult = "WON" | "LOST" | "PUSH" | "PENDING";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const oddsApiKey = process.env.ODDS_API_KEY!;

export const scoreKeysBySport: Record<Sport, string[]> = {
  MLB: ["baseball_mlb"],
  NBA: ["basketball_nba"],
  NHL: ["icehockey_nhl"],
  SOCCER: [
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_italy_serie_a",
    "soccer_germany_bundesliga",
    "soccer_france_ligue_one",
    "soccer_portugal_primeira_liga",
    "soccer_netherlands_eredivisie",
    "soccer_england_championship",
    "soccer_fifa_world_cup",
    "soccer_usa_mls",
    "soccer_mexico_ligamx",
    "soccer_uefa_champs_league",
    "soccer_uefa_europa_league",
    "soccer_uefa_europa_conference_league",
  ],
};

export function todayET() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

function getRelativeDateET(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  return date.toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export function normalizeName(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/&/g, "and")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getLastWord(value: string) {
  const parts = normalizeName(value).split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function inferMarket(pick: string, fallback?: string | null) {
  const raw = String(fallback ?? "").trim();
  if (raw) return raw;

  const value = String(pick ?? "").toLowerCase();
  if (/\bover\b|\bunder\b|\bo\s*\d|\bu\s*\d/.test(value)) return "totals";
  if (/[+-]\d+(?:\.\d+)?/.test(value)) return "spreads";
  return "h2h";
}

function historyDate(row: any) {
  if (row.date) return row.date;
  if (row.start_time) {
    return new Date(row.start_time).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
  }

  return todayET();
}

function withoutAnalysisColumns<T extends Record<string, any>>(row: T) {
  const {
    analysis_summary: _analysisSummary,
    confidence_label: _confidenceLabel,
    edge_label: _edgeLabel,
    risk_note: _riskNote,
    model_factors: _modelFactors,
    ...rest
  } = row;

  return rest;
}

function isMissingAnalysisColumnError(error: any) {
  const message = String(error?.message ?? "");

  return (
    message.includes("analysis_summary") ||
    message.includes("confidence_label") ||
    message.includes("edge_label") ||
    message.includes("risk_note") ||
    message.includes("model_factors")
  );
}

export function gradePickFromScore(
  pickRaw: string,
  awayTeam: string,
  homeTeam: string,
  awayScore: number,
  homeScore: number
): GradeResult {
  if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) {
    return "PENDING";
  }

  const pick = String(pickRaw ?? "").trim().toLowerCase();
  const pickNorm = normalizeName(pickRaw);
  const totalScore = awayScore + homeScore;

  const awayName = normalizeName(awayTeam);
  const homeName = normalizeName(homeTeam);
  const awayLast = getLastWord(awayTeam);
  const homeLast = getLastWord(homeTeam);

  if (
    pickNorm === "draw" ||
    pickNorm === "tie" ||
    pickNorm === "empate" ||
    pickNorm.includes("draw")
  ) {
    if (awayScore === homeScore) return "WON";
    return "LOST";
  }

  const totalMatch =
    pick.match(/\bover\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bunder\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bo\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i) ||
    pick.match(/\bu\b\s*\(?\s*([0-9]+(?:\.[0-9]+)?)\s*\)?/i);

  if (totalMatch) {
    const line = Number(totalMatch[1]);
    if (!Number.isFinite(line)) return "PENDING";

    const isOver = /\bover\b|\bo\b/i.test(pick);
    const isUnder = /\bunder\b|\bu\b/i.test(pick);

    if (isOver) {
      if (totalScore > line) return "WON";
      if (totalScore < line) return "LOST";
      return "PUSH";
    }

    if (isUnder) {
      if (totalScore < line) return "WON";
      if (totalScore > line) return "LOST";
      return "PUSH";
    }
  }

  const spreadMatch = pickRaw.match(
    /^(.*?)(?:\s*[\(\s])([+-]\d+(?:\.\d+)?)(?:\))?$/
  );

  if (spreadMatch) {
    const teamPartRaw = spreadMatch[1].trim();
    const teamPart = normalizeName(teamPartRaw);
    const teamLast = getLastWord(teamPartRaw);
    const line = Number(spreadMatch[2]);

    if (!Number.isFinite(line)) return "PENDING";

    const isAwayTeam =
      teamPart.includes(awayName) ||
      awayName.includes(teamPart) ||
      (teamLast && teamLast === awayLast);

    const isHomeTeam =
      teamPart.includes(homeName) ||
      homeName.includes(teamPart) ||
      (teamLast && teamLast === homeLast);

    if (isAwayTeam) {
      const adjusted = awayScore + line;
      if (adjusted > homeScore) return "WON";
      if (adjusted < homeScore) return "LOST";
      return "PUSH";
    }

    if (isHomeTeam) {
      const adjusted = homeScore + line;
      if (adjusted > awayScore) return "WON";
      if (adjusted < awayScore) return "LOST";
      return "PUSH";
    }
  }

  const looksLikeAwayML =
    pickNorm.includes(awayName) ||
    awayName.includes(pickNorm) ||
    (awayLast && pickNorm.includes(awayLast));

  const looksLikeHomeML =
    pickNorm.includes(homeName) ||
    homeName.includes(pickNorm) ||
    (homeLast && pickNorm.includes(homeLast));

  if (looksLikeAwayML && !looksLikeHomeML) {
    if (awayScore > homeScore) return "WON";
    if (awayScore < homeScore) return "LOST";
    return "PUSH";
  }

  if (looksLikeHomeML && !looksLikeAwayML) {
    if (homeScore > awayScore) return "WON";
    if (homeScore < awayScore) return "LOST";
    return "PUSH";
  }

  return "PENDING";
}

async function fetchOddsApiCompletedScores(scoreKeys: string[]) {
  const responses = await Promise.all(
    scoreKeys.map(async (scoreKey) => {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/${scoreKey}/scores?daysFrom=3&apiKey=${oddsApiKey}`,
        { cache: "no-store" }
      );

      if (!res.ok) return [];

      const data = await res.json();
      return Array.isArray(data) ? data : [];
    })
  );

  return responses.flat();
}

async function fetchSportsDataIoCompletedScores(sport: Sport, dates: string[]) {
  if (!isSportsDataIoSport(sport)) return [];

  const uniqueDates = [...new Set(dates.filter(Boolean))];
  const responses = await Promise.all(
    uniqueDates.map((date) =>
      getSportsDataIoScores(sport, date).catch(() => [])
    )
  );

  return responses.flat();
}

async function fetchCompletedScores(params: {
  sport?: Sport;
  scoreKeys: string[];
  dates: string[];
}) {
  const [sportsDataScores, oddsScores] = await Promise.all([
    params.sport
      ? fetchSportsDataIoCompletedScores(params.sport, params.dates)
      : Promise.resolve([]),
    fetchOddsApiCompletedScores(params.scoreKeys),
  ]);

  const merged = new Map<string, any>();

  [...oddsScores, ...sportsDataScores].forEach((game: any) => {
    if (game?.completed !== true) return;

    const key = [
      normalizeName(game.away_team),
      normalizeName(game.home_team),
      historyDate({ start_time: game.commence_time }),
    ].join("|");

    merged.set(key, game);
  });

  return Array.from(merged.values());
}

function findCompletedGame(row: any, scoreGames: any[]) {
  const rowDate = historyDate(row);

  return (
    scoreGames.find((game: any) => {
      const gameDate = historyDate({ start_time: game.commence_time });
      if (rowDate !== gameDate) return false;

      const awayMatch =
        normalizeName(game.away_team) === normalizeName(row.away_team);
      const homeMatch =
        normalizeName(game.home_team) === normalizeName(row.home_team);

      return awayMatch && homeMatch && game.completed === true;
    }) ?? null
  );
}

function readScore(game: any, teamName: string) {
  return Number(
    game.scores?.find(
      (score: any) => normalizeName(score.name) === normalizeName(teamName)
    )?.score ?? NaN
  );
}

export async function snapshotTopSignal(params: {
  sport: Sport;
  liveTable: string;
  historyTable: string;
}) {
  const { data: liveRows, error: liveError } = await supabase
    .from(params.liveTable)
    .select("*")
    .eq("date", todayET())
    .order("rank", { ascending: true });

  if (liveError) throw liveError;

  const topSignal =
    liveRows?.find((row: any) => row.is_top_signal) ?? liveRows?.[0] ?? null;

  if (!topSignal) return 0;

  const date = historyDate(topSignal);

  const historyRow = {
    date,
    sport: params.sport,
    game_id: topSignal.game_id ?? null,
    away_team: topSignal.away_team ?? "",
    home_team: topSignal.home_team ?? "",
    pick: topSignal.pick ?? "",
    market: inferMarket(topSignal.pick, topSignal.market),
    line: topSignal.line ?? null,
    odds: topSignal.odds ?? null,
    result: "PENDING",
    graded_at: null,
    home_score: null,
    away_score: null,
    is_top_signal: true,
    analysis_summary: topSignal.analysis_summary ?? null,
    confidence_label: topSignal.confidence_label ?? null,
    edge_label: topSignal.edge_label ?? null,
    risk_note: topSignal.risk_note ?? null,
    model_factors: topSignal.model_factors ?? null,
    start_time: topSignal.start_time ?? null,
  };

  const { data: existing, error: findError } = await supabase
    .from(params.historyTable)
    .select("id,result")
    .eq("date", date)
    .order("created_at", { ascending: true });

  if (findError) throw findError;
  if (existing && existing.length > 0) {
    const primaryRow = existing[0];

    if (primaryRow.result === "PENDING") {
      const { error: updateError } = await supabase
        .from(params.historyTable)
        .update(historyRow)
        .eq("id", primaryRow.id);

      if (updateError) {
        if (!isMissingAnalysisColumnError(updateError)) throw updateError;

        const { error: retryError } = await supabase
          .from(params.historyTable)
          .update(withoutAnalysisColumns(historyRow))
          .eq("id", primaryRow.id);

        if (retryError) throw retryError;
      }
    }

    const duplicatePendingIds = existing
      .slice(1)
      .filter((row: any) => row.result === "PENDING")
      .map((row: any) => row.id)
      .filter(Boolean);

    if (duplicatePendingIds.length > 0) {
      const { error: deleteDuplicateError } = await supabase
        .from(params.historyTable)
        .delete()
        .in("id", duplicatePendingIds);

      if (deleteDuplicateError) throw deleteDuplicateError;
    }

    return 0;
  }

  const { error: insertError } = await supabase.from(params.historyTable).insert([
    {
      id: randomUUID(),
      ...historyRow,
    },
  ]);

  if (insertError) {
    if (!isMissingAnalysisColumnError(insertError)) throw insertError;

    const { error: retryError } = await supabase.from(params.historyTable).insert([
      {
        id: randomUUID(),
        ...withoutAnalysisColumns(historyRow),
      },
    ]);

    if (retryError) throw retryError;
  }
  return 1;
}

export async function snapshotTop5(params: {
  sport: Sport;
  liveTable: string;
  historyTable: string;
}) {
  const { data: liveRows, error: liveError } = await supabase
    .from(params.liveTable)
    .select("*")
    .eq("date", todayET())
    .order("rank", { ascending: true });

  if (liveError) throw liveError;
  if (!liveRows || liveRows.length === 0) return 0;

  let inserted = 0;

  for (let i = 0; i < liveRows.length; i += 1) {
    const row = liveRows[i];
    const rank = Number(row.rank ?? i + 1);
    const date = historyDate(row);

    const { data: existing, error: findError } = await supabase
      .from(params.historyTable)
      .select("id,result")
      .eq("date", date)
      .eq("rank", rank)
      .limit(1);

    if (findError) throw findError;

    const historyRow = {
      date,
      sport: params.sport,
      rank,
      away_team: row.away_team ?? "",
      home_team: row.home_team ?? "",
      pick: row.pick ?? "",
      market: inferMarket(row.pick, row.market),
      line: row.line ?? null,
      odds: row.odds ?? null,
      result: "PENDING",
      graded_at: null,
      home_score: null,
      away_score: null,
      analysis_summary: row.analysis_summary ?? null,
      confidence_label: row.confidence_label ?? null,
      edge_label: row.edge_label ?? null,
      risk_note: row.risk_note ?? null,
      model_factors: row.model_factors ?? null,
      start_time: row.start_time ?? null,
    };

    if (existing && existing.length > 0) {
      if (existing[0].result === "PENDING") {
        const { error: updateError } = await supabase
          .from(params.historyTable)
          .update(historyRow)
          .eq("id", existing[0].id);

        if (updateError) {
          if (!isMissingAnalysisColumnError(updateError)) throw updateError;

          const { error: retryError } = await supabase
            .from(params.historyTable)
            .update(withoutAnalysisColumns(historyRow))
            .eq("id", existing[0].id);

          if (retryError) throw retryError;
        }
      }

      continue;
    }

    const { error: insertError } = await supabase
      .from(params.historyTable)
      .insert([historyRow]);

    if (insertError) {
      if (!isMissingAnalysisColumnError(insertError)) throw insertError;

      const { error: retryError } = await supabase
        .from(params.historyTable)
        .insert([withoutAnalysisColumns(historyRow)]);

      if (retryError) throw retryError;
    }
    inserted += 1;
  }

  const { data: staleRows, error: staleRowsError } = await supabase
    .from(params.historyTable)
    .select("id,rank,result")
    .eq("date", todayET())
    .eq("result", "PENDING")
    .gt("rank", liveRows.length);

  if (staleRowsError) throw staleRowsError;

  const staleIds = (staleRows ?? []).map((row: any) => row.id).filter(Boolean);

  if (staleIds.length > 0) {
    const { error: deleteStaleError } = await supabase
      .from(params.historyTable)
      .delete()
      .in("id", staleIds);

    if (deleteStaleError) throw deleteStaleError;
  }

  return inserted;
}

export async function gradePendingHistory(params: {
  historyTable: string;
  liveTable?: string;
  scoreKeys: string[];
  sport?: Sport;
  regradeRecentDays?: number;
}) {
  const cutoffDate = getRelativeDateET(-(params.regradeRecentDays ?? 3));
  const { data: pendingRows, error: fetchError } = await supabase
    .from(params.historyTable)
    .select("*")
    .gte("date", cutoffDate);

  if (fetchError) throw fetchError;
  if (!pendingRows || pendingRows.length === 0) return 0;

  let confirmedLiveRows: any[] | null = null;

  if (params.liveTable) {
    const rowDates = [...new Set(pendingRows.map((row: any) => historyDate(row)))];
    const { data: liveRows, error: liveError } = await supabase
      .from(params.liveTable)
      .select("*")
      .in("date", rowDates)
      .eq("status", "CONFIRMED");

    if (liveError) throw liveError;
    confirmedLiveRows = liveRows ?? [];
  }

  const scoreGames = await fetchCompletedScores({
    sport: params.sport,
    scoreKeys: params.scoreKeys,
    dates: pendingRows.map((row: any) => historyDate(row)),
  });
  let updated = 0;

  for (const row of pendingRows) {
    if (
      row.result !== "PENDING" &&
      row.result !== "WON" &&
      row.result !== "LOST" &&
      row.result !== "PUSH"
    ) {
      continue;
    }

    if (confirmedLiveRows && !isConfirmedHistoryRow(row, confirmedLiveRows)) {
      continue;
    }

    const match = findCompletedGame(row, scoreGames);
    if (!match) continue;

    const awayScore = readScore(match, match.away_team);
    const homeScore = readScore(match, match.home_team);
    const result = gradePickFromScore(
      row.pick,
      row.away_team,
      row.home_team,
      awayScore,
      homeScore
    );

    if (result === "PENDING") continue;
    if (
      row.result === result &&
      Number(row.away_score) === awayScore &&
      Number(row.home_score) === homeScore
    ) {
      continue;
    }

    const { error: updateError } = await supabase
      .from(params.historyTable)
      .update({
        result,
        graded_at: new Date().toISOString(),
        away_score: awayScore,
        home_score: homeScore,
      })
      .eq("id", row.id);

    if (!updateError) updated += 1;
  }

  return updated;
}

function isConfirmedHistoryRow(row: any, confirmedLiveRows: any[]) {
  return confirmedLiveRows.some((liveRow) => {
    const sameDate = String(liveRow.date ?? "") === String(row.date ?? "");
    if (!sameDate) return false;

    if (
      row.rank !== null &&
      row.rank !== undefined &&
      liveRow.rank !== null &&
      liveRow.rank !== undefined
    ) {
      return Number(liveRow.rank) === Number(row.rank);
    }

    const sameGameId =
      row.game_id &&
      liveRow.game_id &&
      String(row.game_id) === String(liveRow.game_id);

    const sameTeams =
      normalizeName(liveRow.away_team ?? "") === normalizeName(row.away_team ?? "") &&
      normalizeName(liveRow.home_team ?? "") === normalizeName(row.home_team ?? "");

    const samePick =
      normalizeName(liveRow.pick ?? "") === normalizeName(row.pick ?? "");

    return (sameGameId || sameTeams) && samePick;
  });
}
