import { createClient } from "@supabase/supabase-js";

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

async function fetchCompletedScores(scoreKeys: string[]) {
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

function findCompletedGame(row: any, scoreGames: any[]) {
  return (
    scoreGames.find((game: any) => {
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

  const { data: existing, error: findError } = await supabase
    .from(params.historyTable)
    .select("id")
    .eq("date", date)
    .eq("away_team", topSignal.away_team ?? "")
    .eq("home_team", topSignal.home_team ?? "")
    .eq("pick", topSignal.pick ?? "")
    .limit(1);

  if (findError) throw findError;
  if (existing && existing.length > 0) return 0;

  const { error: insertError } = await supabase.from(params.historyTable).insert([
    {
      date,
      sport: params.sport,
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
      start_time: topSignal.start_time ?? null,
    },
  ]);

  if (insertError) throw insertError;
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
      .select("id")
      .eq("date", date)
      .eq("rank", rank)
      .limit(1);

    if (findError) throw findError;
    if (existing && existing.length > 0) continue;

    const { error: insertError } = await supabase.from(params.historyTable).insert([
      {
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
        start_time: row.start_time ?? null,
      },
    ]);

    if (insertError) throw insertError;
    inserted += 1;
  }

  return inserted;
}

export async function gradePendingHistory(params: {
  historyTable: string;
  scoreKeys: string[];
}) {
  const { data: pendingRows, error: fetchError } = await supabase
    .from(params.historyTable)
    .select("*")
    .eq("result", "PENDING");

  if (fetchError) throw fetchError;
  if (!pendingRows || pendingRows.length === 0) return 0;

  const scoreGames = await fetchCompletedScores(params.scoreKeys);
  let updated = 0;

  for (const row of pendingRows) {
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
