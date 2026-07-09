import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { randomUUID } from "crypto";

type Sport = "MLB" | "NBA" | "NHL" | "SOCCER";
type ValidationStatus = "CONFIRMED" | "DOWNGRADED" | "REMOVED";

type SportConfig = {
  sport: Sport;
  publicTable: string;
  liveTable: string;
  oddsKeys: string[];
};

type PublicSignalRow = {
  id: string;
  sport: Sport;
  game_id: string | null;
  date: string;
  away_team: string;
  home_team: string;
  pick: string;
  market: string;
  line: number | null;
  odds: number | null;
  start_time: string | null;
  status: string;
  analysis_summary?: string | null;
  confidence_label?: string | null;
  edge_label?: string | null;
  risk_note?: string | null;
  model_factors?: string[] | null;
};

type AtlasCandidate = PublicSignalRow & {
  modelScore: number;
};

const MIN_AUTOMATED_PICK_ODDS = -150;
const MAX_AUTOMATED_PICK_ODDS = 120;

export const automationSports: SportConfig[] = [
  {
    sport: "MLB",
    publicTable: "mlb_public_signals",
    liveTable: "mlb_top5_live",
    oddsKeys: ["baseball_mlb"],
  },
  {
    sport: "NBA",
    publicTable: "nba_public_signals",
    liveTable: "nba_top5_live",
    oddsKeys: ["basketball_nba"],
  },
  {
    sport: "NHL",
    publicTable: "nhl_public_signals",
    liveTable: "nhl_top5_live",
    oddsKeys: ["icehockey_nhl"],
  },
  {
    sport: "SOCCER",
    publicTable: "soccer_public_signals",
    liveTable: "soccer_top5_live",
    oddsKeys: [
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
  },
];

export function todayET() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export function currentHourET() {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
}

function normalizeName(value: string) {
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

function signalScore(row: any) {
  const score = Number(
    row.internal_score ??
      row.internalScore ??
      row.confidence ??
      row.edge ??
      row.score ??
      0
  );

  if (Number.isFinite(score) && score > 0) return score;

  const odds = Number(row.odds);
  if (!isSelectableAutomatedOdds(odds)) return 0;

  const impliedProbability =
    odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);

  const market = inferMarket(row);
  const marketBonus =
    market === "spreads" ? 260 : market === "totals" ? 220 : 180;
  const valueBonus = odds > 0 ? 180 : Math.max(0, odds + 150);

  return Math.round(impliedProbability * 10000) + marketBonus + valueBonus;
}

function isSelectableAutomatedOdds(value: unknown) {
  const odds = Number(value);

  return (
    Number.isFinite(odds) &&
    odds >= MIN_AUTOMATED_PICK_ODDS &&
    odds <= MAX_AUTOMATED_PICK_ODDS
  );
}

function inferMarket(row: any) {
  const market = String(row.market ?? "").trim();
  if (market) return market;

  const pick = String(row.pick ?? "").toLowerCase();
  if (/\bover\b|\bunder\b|\bo\s*\d|\bu\s*\d/.test(pick)) return "totals";
  if (/[+-]\d+(?:\.\d+)?/.test(pick)) return "spreads";
  return "h2h";
}

function publicSignalKey(row: any) {
  const gameId = row.game_id ?? row.gameId;
  if (gameId) return `game:${gameId}`;

  return [
    "teams",
    normalizeName(row.away_team ?? row.awayTeam ?? ""),
    normalizeName(row.home_team ?? row.homeTeam ?? ""),
    normalizeName(row.pick ?? ""),
  ].join(":");
}

function dedupePublicRows(rows: any[]) {
  const rowsByGame = new Map<string, any>();

  for (const row of rows) {
    const key = publicSignalKey(row);
    const existing = rowsByGame.get(key);

    if (!existing || signalScore(row) > signalScore(existing)) {
      rowsByGame.set(key, row);
    }
  }

  return Array.from(rowsByGame.values());
}

function normalizeTop5Row(row: any, sport: Sport, rank: number) {
  return {
    id: row.id ?? randomUUID(),
    date: row.date ?? todayET(),
    sport,
    rank,
    game_id: row.game_id ?? row.gameId ?? null,
    away_team: row.away_team ?? row.awayTeam ?? "",
    home_team: row.home_team ?? row.homeTeam ?? "",
    pick: row.pick ?? "",
    market: inferMarket(row),
    line: row.line ?? null,
    odds: row.odds ?? null,
    status: "PENDING",
    is_top_signal: rank === 1,
    confidence: row.confidence ?? null,
    internal_score: row.internal_score ?? row.internalScore ?? null,
    edge: row.edge ?? null,
    analysis_summary: row.analysis_summary ?? row.analysisSummary ?? null,
    confidence_label: row.confidence_label ?? row.confidenceLabel ?? null,
    edge_label: row.edge_label ?? row.edgeLabel ?? null,
    risk_note: row.risk_note ?? row.riskNote ?? null,
    model_factors: row.model_factors ?? row.modelFactors ?? null,
    start_time: row.start_time ?? row.startTime ?? row.commence_time ?? null,
  };
}

function formatLine(value: unknown) {
  const line = Number(value);
  if (!Number.isFinite(line)) return null;

  return line > 0 ? `+${line}` : `${line}`;
}

function formatTotalLine(value: unknown) {
  const line = Number(value);
  if (!Number.isFinite(line)) return null;

  return `${line}`;
}

function isHalfPointLine(value: unknown) {
  const line = Number(value);
  if (!Number.isFinite(line)) return false;

  return Math.abs(line % 1) === 0.5;
}

function isAllowedAtlasLine(sport: Sport, market: "h2h" | "spreads" | "totals", line: unknown) {
  if (market === "h2h") return true;

  if (market === "totals") {
    return isHalfPointLine(line);
  }

  if (sport === "SOCCER" && market === "spreads") {
    return isHalfPointLine(line);
  }

  return true;
}

function isSelectablePublicRow(row: any, sport: Sport) {
  return (
    isSelectableAutomatedOdds(row.odds) &&
    isAllowedAtlasLine(sport, inferMarket(row) as "h2h" | "spreads" | "totals", row.line)
  );
}

function marketOutcomeKey(marketKey: string, outcome: any) {
  const name = normalizeName(outcome.name ?? "");
  const point =
    outcome.point === null || outcome.point === undefined
      ? ""
      : String(Number(outcome.point));

  return `${marketKey}:${name}:${point}`;
}

function bestPricedOutcomes(game: any, marketKey: "h2h" | "spreads" | "totals") {
  const outcomesByKey = new Map<string, any>();
  const priceSamplesByKey = new Map<string, number[]>();
  const booksByKey = new Map<string, Set<string>>();

  for (const bookmaker of game.bookmakers ?? []) {
    const market = bookmaker.markets?.find((item: any) => item.key === marketKey);
    if (!market || !Array.isArray(market.outcomes)) continue;

    for (const outcome of market.outcomes) {
      const price = Number(outcome.price);
      if (!outcome.name || !isSelectableAutomatedOdds(price)) continue;
      if (marketKey === "h2h" && normalizeName(outcome.name) === "draw") continue;

      const key = marketOutcomeKey(marketKey, outcome);
      const existing = outcomesByKey.get(key);
      const samples = priceSamplesByKey.get(key) ?? [];
      samples.push(price);
      priceSamplesByKey.set(key, samples);

      const books = booksByKey.get(key) ?? new Set<string>();
      books.add(bookmaker.title ?? bookmaker.key ?? "Sportsbook");
      booksByKey.set(key, books);

      if (!existing || price > Number(existing.price)) {
        outcomesByKey.set(key, {
          ...outcome,
          price,
          bestBook: bookmaker.title ?? bookmaker.key ?? "Sportsbook",
        });
      }
    }
  }

  return Array.from(outcomesByKey.entries()).map(([key, outcome]) => {
    const prices = priceSamplesByKey.get(key) ?? [];
    const books = booksByKey.get(key) ?? new Set<string>();
    const bestPrice = Math.max(...prices);
    const worstPrice = Math.min(...prices);
    const averagePrice =
      prices.length > 0
        ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
        : Number(outcome.price);

    return {
      ...outcome,
      bookCount: books.size,
      averagePrice,
      priceSpread: Number.isFinite(bestPrice) && Number.isFinite(worstPrice)
        ? bestPrice - worstPrice
        : null,
    };
  });
}

function impliedScore(odds: number) {
  const impliedProbability =
    odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);

  return Math.round(impliedProbability * 10000);
}

function impliedProbabilityPct(odds: number) {
  if (!Number.isFinite(odds)) return null;

  const impliedProbability =
    odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);

  return Number((impliedProbability * 100).toFixed(1));
}

function formatOddsText(odds: unknown) {
  const value = Number(odds);
  if (!Number.isFinite(value)) return "available";

  return value > 0 ? `+${value}` : `${value}`;
}

function candidateScore(candidate: PublicSignalRow) {
  const odds = Number(candidate.odds);
  if (!isSelectableAutomatedOdds(odds)) return 0;

  const marketBonus =
    candidate.market === "spreads"
      ? 260
      : candidate.market === "totals"
      ? 220
      : 180;
  const priceSafety = odds < 0 ? Math.abs(odds) : 100;
  const safetyBonus = Math.min(priceSafety, 150);
  const valueBonus = odds > 0 ? 180 : Math.max(0, odds + 150);

  return impliedScore(odds) + marketBonus + safetyBonus + valueBonus;
}

function confidenceLabel(score: number) {
  if (score >= 7000) return "High";
  if (score >= 6200) return "Strong";
  if (score >= 5400) return "Qualified";
  return "Monitored";
}

function edgeLabel(score: number) {
  if (score >= 7000) return "Premium edge";
  if (score >= 6200) return "Positive edge";
  if (score >= 5400) return "Model edge";
  return "Market watch";
}

function marketLabel(market: string) {
  if (market === "h2h") return "moneyline";
  if (market === "spreads") return "spread";
  if (market === "totals") return "total";
  return "market";
}

function buildSignalAnalysis(
  row: PublicSignalRow,
  score: number,
  context?: {
    bestBook?: string | null;
    bookCount?: number | null;
    averagePrice?: number | null;
    priceSpread?: number | null;
  }
): Pick<PublicSignalRow, "analysis_summary" | "confidence_label" | "edge_label" | "risk_note" | "model_factors"> {
  const market = marketLabel(row.market);
  const odds = Number(row.odds);
  const oddsText = formatOddsText(odds);
  const implied = impliedProbabilityPct(odds);
  const lineText =
    row.line === null || row.line === undefined || row.market === "h2h"
      ? ""
      : ` at ${row.line}`;
  const confidence = confidenceLabel(score);
  const edge = edgeLabel(score);
  const bestBook = context?.bestBook ? ` with the best observed price at ${context.bestBook}` : "";
  const bookCount = Number(context?.bookCount ?? 0);
  const averagePrice = Number(context?.averagePrice);
  const priceSpread = Number(context?.priceSpread);
  const marketDepth =
    bookCount > 1
      ? `Compared across ${bookCount} books; best price ${oddsText}${
          Number.isFinite(averagePrice) ? ` versus market average ${formatOddsText(averagePrice)}` : ""
        }.`
      : `Best available price was ${oddsText}.`;
  const priceSpreadText =
    Number.isFinite(priceSpread) && priceSpread > 0
      ? `Book spread showed ${priceSpread} cents of separation, which signals price shopping value.`
      : "Price passed Atlas value screening without requiring extra line adjustment.";
  const impliedText = implied !== null ? `implied probability near ${implied}%` : "qualified implied probability";

  const factors = [
    `Qualified inside Atlas odds range (${MIN_AUTOMATED_PICK_ODDS} to +${MAX_AUTOMATED_PICK_ODDS}).`,
    `${market.charAt(0).toUpperCase()}${market.slice(1)} profile ranked highest for this matchup at ${oddsText}.`,
    marketDepth,
    priceSpreadText,
    `Atlas score ${score} placed this pick above the available board for the game.`,
    row.market === "spreads" || row.market === "totals"
      ? "Line structure passed Atlas validation rules."
      : "Moneyline price passed Atlas safety and value filters.",
  ];

  return {
    analysis_summary: `Atlas selected ${row.pick} because the ${market}${lineText} offered the strongest blend of price safety, ${impliedText}, model confidence and market value for ${row.away_team} vs ${row.home_team}${bestBook}. It qualified at ${oddsText}, ranked as a ${confidence.toLowerCase()} confidence signal, and cleared Atlas filters before Top 5 sorting.`,
    confidence_label: confidence,
    edge_label: edge,
    risk_note: "Signals are model-driven probabilities, not guarantees. Line movement, lineup news and late market shifts can change risk before start time.",
    model_factors: factors,
  };
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

function buildCandidate(
  game: any,
  sport: Sport,
  market: "h2h" | "spreads" | "totals",
  outcome: any
): AtlasCandidate | null {
  const price = Number(outcome.price);
  if (!isSelectableAutomatedOdds(price)) return null;

  let pick = "";
  let line: number | null = null;

  if (market === "h2h") {
    pick = `${outcome.name} ML`;
  }

  if (market === "spreads") {
    if (!isAllowedAtlasLine(sport, market, outcome.point)) return null;

    const lineText = formatLine(outcome.point);
    if (!lineText) return null;

    line = Number(outcome.point);
    pick = `${outcome.name} (${lineText})`;
  }

  if (market === "totals") {
    if (!isAllowedAtlasLine(sport, market, outcome.point)) return null;

    const lineText = formatTotalLine(outcome.point);
    if (!lineText) return null;

    line = Number(outcome.point);
    pick = `${outcome.name} (${lineText})`;
  }

  const baseRow: PublicSignalRow = {
    id: randomUUID(),
    sport,
    date: todayET(),
    game_id: game.id ?? null,
    away_team: game.away_team ?? "",
    home_team: game.home_team ?? "",
    pick,
    market,
    line,
    odds: price,
    start_time: game.commence_time ?? null,
    status: "PENDING",
  };
  const modelScore = candidateScore(baseRow);

  return {
    ...baseRow,
    ...buildSignalAnalysis(baseRow, modelScore, {
      bestBook: outcome.bestBook,
      bookCount: outcome.bookCount,
      averagePrice: outcome.averagePrice,
      priceSpread: outcome.priceSpread,
    }),
    modelScore,
  };
}

function buildPublicSignalFromOddsGame(game: any, sport: Sport): PublicSignalRow | null {
  const candidates: AtlasCandidate[] = [];

  for (const market of ["h2h", "spreads", "totals"] as const) {
    for (const outcome of bestPricedOutcomes(game, market)) {
      const candidate = buildCandidate(game, sport, market, outcome);
      if (candidate) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null;

  const { modelScore: _modelScore, ...bestPick } = candidates.sort(
    (a, b) => b.modelScore - a.modelScore
  )[0];

  return bestPick;
}

async function buildAtlasPublicSignalRows(config: SportConfig) {
  const oddsGames = await fetchOdds(config.oddsKeys);

  return oddsGames
    .map((game) => buildPublicSignalFromOddsGame(game, config.sport))
    .filter((row): row is PublicSignalRow => Boolean(row))
    .filter((row: any) => {
      if (!row.start_time) return true;
      return (
        new Date(row.start_time).toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        }) === todayET()
      );
    });
}

export async function generatePublicSignalsForSport(config: SportConfig) {
  const supabase = getSupabaseAdmin();
  const date = todayET();
  const publicRows = await buildAtlasPublicSignalRows(config);

  if (!publicRows || publicRows.length === 0) {
    return { sport: config.sport, generated: 0, updated: 0, inserted: 0 };
  }

  let inserted = 0;
  let updated = 0;

  for (const row of publicRows) {
    let existingQuery = supabase
      .from(config.publicTable)
      .select("id")
      .eq("date", date)
      .limit(1);

    if (row.game_id) {
      existingQuery = existingQuery.eq("game_id", row.game_id);
    } else {
      existingQuery = existingQuery
        .eq("away_team", row.away_team)
        .eq("home_team", row.home_team);
    }

    const { data: existing, error: existingError } = await existingQuery;
    if (existingError) throw existingError;

    if (existing && existing.length > 0) {
      const { id: _id, ...updateRow } = row;
      const { error: updateError } = await supabase
        .from(config.publicTable)
        .update(updateRow)
        .eq("id", existing[0].id);

      if (updateError) {
        if (!isMissingAnalysisColumnError(updateError)) throw updateError;

        const { error: retryError } = await supabase
          .from(config.publicTable)
          .update(withoutAnalysisColumns(updateRow))
          .eq("id", existing[0].id);

        if (retryError) throw retryError;
      }
      updated += 1;
      continue;
    }

    const { error: insertError } = await supabase
      .from(config.publicTable)
      .insert([row]);

    if (insertError) {
      if (!isMissingAnalysisColumnError(insertError)) throw insertError;

      const { error: retryError } = await supabase
        .from(config.publicTable)
        .insert([withoutAnalysisColumns(row)]);

      if (retryError) throw retryError;
    }
    inserted += 1;
  }

  const { data: existingRows, error: existingRowsError } = await supabase
    .from(config.publicTable)
    .select("*")
    .eq("date", date)
    .or("status.is.null,status.eq.PENDING");

  if (existingRowsError) throw existingRowsError;

  const staleInvalidIds = (existingRows ?? [])
    .filter((row: any) => !isSelectablePublicRow(row, config.sport))
    .map((row: any) => row.id)
    .filter(Boolean);

  if (staleInvalidIds.length > 0) {
    const { error: deleteStaleError } = await supabase
      .from(config.publicTable)
      .delete()
      .in("id", staleInvalidIds);

    if (deleteStaleError) throw deleteStaleError;
  }

  return { sport: config.sport, generated: publicRows.length, updated, inserted };
}

export async function generateDailyTop5ForSport(config: SportConfig) {
  const supabase = getSupabaseAdmin();
  const date = todayET();

  const { data: savedPublicRows, error: publicError } = await supabase
    .from(config.publicTable)
    .select("*")
    .eq("date", date);

  if (publicError) throw publicError;

  const publicRows = savedPublicRows ?? [];

  if (!publicRows || publicRows.length === 0) {
    return { sport: config.sport, generated: 0, updated: 0, inserted: 0 };
  }

  const top5 = dedupePublicRows(publicRows)
    .filter((row) => isSelectablePublicRow(row, config.sport))
    .sort((a, b) => signalScore(b) - signalScore(a))
    .slice(0, 5)
    .map((row, index) => normalizeTop5Row(row, config.sport, index + 1));

  let inserted = 0;
  let updated = 0;

  for (const row of top5) {
    const { data: existing, error: existingError } = await supabase
      .from(config.liveTable)
      .select("id")
      .eq("date", date)
      .eq("rank", row.rank)
      .limit(1);

    if (existingError) throw existingError;

    if (existing && existing.length > 0) {
      const { id: _id, ...updateRow } = row;
      const { error: updateError } = await supabase
        .from(config.liveTable)
        .update(updateRow)
        .eq("id", existing[0].id);

      if (updateError) {
        if (!isMissingAnalysisColumnError(updateError)) throw updateError;

        const { error: retryError } = await supabase
          .from(config.liveTable)
          .update(withoutAnalysisColumns(updateRow))
          .eq("id", existing[0].id);

        if (retryError) throw retryError;
      }
      updated += 1;
      continue;
    }

    const { error: insertError } = await supabase.from(config.liveTable).insert([row]);
    if (insertError) {
      if (!isMissingAnalysisColumnError(insertError)) throw insertError;

      const { error: retryError } = await supabase
        .from(config.liveTable)
        .insert([withoutAnalysisColumns(row)]);

      if (retryError) throw retryError;
    }
    inserted += 1;
  }

  const { data: staleRows, error: staleRowsError } = await supabase
    .from(config.liveTable)
    .select("id,rank,status")
    .eq("date", date)
    .or("status.is.null,status.eq.PENDING")
    .gt("rank", top5.length);

  if (staleRowsError) throw staleRowsError;

  const staleIds = (staleRows ?? []).map((row: any) => row.id).filter(Boolean);

  if (staleIds.length > 0) {
    const { error: deleteStaleError } = await supabase
      .from(config.liveTable)
      .delete()
      .in("id", staleIds);

    if (deleteStaleError) throw deleteStaleError;
  }

  return { sport: config.sport, generated: top5.length, updated, inserted };
}

async function fetchOdds(oddsKeys: string[]) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("Missing ODDS_API_KEY");

  const responses = await Promise.all(
    oddsKeys.map(async (sportKey) => {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
        { cache: "no-store" }
      );

      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data)
        ? data.map((game) => ({ ...game, sport_key: sportKey }))
        : [];
    })
  );

  return responses.flat();
}

function findOddsGame(row: any, oddsGames: any[]) {
  return (
    oddsGames.find((game) => {
      if (row.game_id && String(game.id) === String(row.game_id)) return true;

      const awayMatch =
        normalizeName(game.away_team) === normalizeName(row.away_team);
      const homeMatch =
        normalizeName(game.home_team) === normalizeName(row.home_team);

      return awayMatch && homeMatch;
    }) ?? null
  );
}

function findOutcome(row: any, oddsGame: any) {
  const marketKey = inferMarket(row);
  const market = oddsGame.bookmakers
    ?.flatMap((bookmaker: any) => bookmaker.markets ?? [])
    ?.find((item: any) => item.key === marketKey);

  if (!market) return null;

  const pick = normalizeName(row.pick);
  const isTotal = marketKey === "totals";
  const isSpread = marketKey === "spreads";

  if (isTotal) {
    const totalSide = pick.includes("under") || /\bu\b/.test(pick) ? "Under" : "Over";
    return market.outcomes?.find((outcome: any) => outcome.name === totalSide) ?? null;
  }

  if (isSpread) {
    return (
      market.outcomes?.find((outcome: any) => {
        const outcomeName = normalizeName(outcome.name);
        return pick.includes(outcomeName) || outcomeName.includes(pick.split(" ")[0]);
      }) ?? null
    );
  }

  return (
    market.outcomes?.find((outcome: any) => {
      const outcomeName = normalizeName(outcome.name);
      return pick.includes(outcomeName) || outcomeName.includes(pick);
    }) ?? null
  );
}

function validateStatus(row: any, oddsGame: any): ValidationStatus {
  if (!oddsGame) return "REMOVED";

  const outcome = findOutcome(row, oddsGame);
  if (!outcome) return "REMOVED";

  const currentLine = Number(outcome.point);
  const originalLine = Number(row.line);

  if (
    Number.isFinite(currentLine) &&
    Number.isFinite(originalLine) &&
    Math.abs(currentLine - originalLine) >= 1
  ) {
    return "DOWNGRADED";
  }

  const currentOdds = Number(outcome.price);
  const originalOdds = Number(row.odds);

  if (
    Number.isFinite(currentOdds) &&
    Number.isFinite(originalOdds) &&
    currentOdds - originalOdds <= -35
  ) {
    return "DOWNGRADED";
  }

  return "CONFIRMED";
}

export async function validatePregameTop5ForSport(config: SportConfig) {
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const latestStart = new Date(now + 30 * 60 * 1000).toISOString();

  const { data: rows, error: rowsError } = await supabase
    .from(config.liveTable)
    .select("*")
    .eq("date", todayET())
    .or("status.is.null,status.eq.PENDING")
    .lte("start_time", latestStart)
    .gte("start_time", new Date(now).toISOString());

  if (rowsError) throw rowsError;
  if (!rows || rows.length === 0) {
    return { sport: config.sport, checked: 0, updated: 0 };
  }

  const oddsGames = await fetchOdds(config.oddsKeys);
  let updated = 0;

  for (const row of rows) {
    const oddsGame = findOddsGame(row, oddsGames);
    const status = validateStatus(row, oddsGame);

    const { error: updateError } = await supabase
      .from(config.liveTable)
      .update({ status })
      .eq("id", row.id);

    if (!updateError) updated += 1;
  }

  return { sport: config.sport, checked: rows.length, updated };
}
