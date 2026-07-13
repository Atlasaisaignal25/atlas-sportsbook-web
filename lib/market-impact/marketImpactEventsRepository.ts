import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type { MarketImpactEvent, MarketImpactSport } from "@/types/marketImpactEvent";

const TABLE = "market_impact_events";

type MarketImpactRow = {
  id?: string;
  sport: MarketImpactSport;
  event_id: string;
  home_team: string;
  away_team: string;
  market: MarketImpactEvent["market"];
  selection: string;
  movement_type: MarketImpactEvent["movementType"];
  old_line: number | null;
  new_line: number | null;
  old_odds: number | null;
  new_odds: number | null;
  direction: MarketImpactEvent["direction"];
  movement_size: number;
  confidence: MarketImpactEvent["confidence"];
  why: string;
  impact: string;
  published_at: string;
  books_observed?: number | null;
  books_moved?: number | null;
  consensus_percent?: number | null;
  consensus_level?: MarketImpactEvent["consensusLevel"] | null;
  sportsbook_keys_moved?: string[] | null;
  sportsbook_names_moved?: string[] | null;
  first_book_to_move?: string | null;
  first_move_at?: string | null;
  latest_book_to_move?: string | null;
  latest_move_at?: string | null;
  movement_window_minutes?: number | null;
  sportsbook_details?: MarketImpactEvent["sportsbookDetails"] | null;
  created_at?: string;
  updated_at?: string;
};

function nyDayBounds(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = formatter.format(date).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 4, 0, 0));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function toRow(event: MarketImpactEvent): MarketImpactRow {
  return {
    sport: event.sport,
    event_id: event.eventId,
    home_team: event.homeTeam,
    away_team: event.awayTeam,
    market: event.market,
    selection: event.selection,
    movement_type: event.movementType,
    old_line: event.oldLine,
    new_line: event.newLine,
    old_odds: event.oldOdds,
    new_odds: event.newOdds,
    direction: event.direction,
    movement_size: event.movementSize,
    confidence: event.confidence,
    why: event.why,
    impact: event.impact,
    published_at: event.publishedAt,
    books_observed: event.booksObserved,
    books_moved: event.booksMoved,
    consensus_percent: event.consensusPercent,
    consensus_level: event.consensusLevel,
    sportsbook_keys_moved: event.sportsbookKeysMoved,
    sportsbook_names_moved: event.sportsbookNamesMoved,
    first_book_to_move: event.firstBookToMove,
    first_move_at: event.firstMoveAt,
    latest_book_to_move: event.latestBookToMove,
    latest_move_at: event.latestMoveAt,
    movement_window_minutes: event.movementWindowMinutes,
    sportsbook_details: event.sportsbookDetails,
  };
}

function fromRow(row: MarketImpactRow): MarketImpactEvent {
  return {
    id: row.id,
    sport: row.sport,
    eventId: row.event_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    market: row.market,
    selection: row.selection,
    movementType: row.movement_type,
    oldLine: row.old_line,
    newLine: row.new_line,
    oldOdds: row.old_odds,
    newOdds: row.new_odds,
    direction: row.direction,
    movementSize: row.movement_size,
    confidence: row.confidence,
    why: row.why,
    impact: row.impact,
    publishedAt: row.published_at,
    booksObserved: row.books_observed ?? 1,
    booksMoved: row.books_moved ?? 1,
    consensusPercent: row.consensus_percent ?? 100,
    consensusLevel: row.consensus_level ?? "LOW CONSENSUS",
    sportsbookKeysMoved: row.sportsbook_keys_moved ?? [],
    sportsbookNamesMoved: row.sportsbook_names_moved ?? [],
    firstBookToMove: row.first_book_to_move ?? null,
    firstMoveAt: row.first_move_at ?? null,
    latestBookToMove: row.latest_book_to_move ?? null,
    latestMoveAt: row.latest_move_at ?? null,
    movementWindowMinutes: row.movement_window_minutes ?? null,
    sportsbookDetails: row.sportsbook_details ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertMarketImpactEventsDeduped(events: MarketImpactEvent[]) {
  if (events.length === 0) return { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] };

  const supabase = getSupabaseAdmin();
  const rows = events.map(toRow);
  const eventIds = rows.map((row) => row.event_id);
  const existingResult = await supabase
    .from(TABLE)
    .select("event_id,books_moved,latest_move_at")
    .in("event_id", eventIds);

  if (existingResult.error) {
    return { inserted: 0, updated: 0, skipped: 0, errors: [existingResult.error.message] };
  }

  const existing = new Map<string, { event_id: string; books_moved?: number | null; latest_move_at?: string | null }>(
    (existingResult.data ?? []).map((row: { event_id: string; books_moved?: number | null; latest_move_at?: string | null }) => [row.event_id, row]),
  );
  const inserts = rows.filter((row) => !existing.has(row.event_id));
  const updates = rows.filter((row) => {
    const current = existing.get(row.event_id);
    if (!current) return false;
    const currentBooksMoved = current.books_moved ?? 0;
    const rowBooksMoved = row.books_moved ?? 0;
    const currentLatest = new Date(current.latest_move_at ?? 0).getTime();
    const rowLatest = new Date(row.latest_move_at ?? 0).getTime();
    return rowBooksMoved > currentBooksMoved || rowLatest > currentLatest;
  });
  const skipped = rows.length - inserts.length - updates.length;

  if (inserts.length === 0 && updates.length === 0) return { inserted: 0, updated: 0, skipped, errors: [] as string[] };

  if (inserts.length > 0) {
    const { error } = await supabase.from(TABLE).insert(inserts);
    if (error) return { inserted: 0, updated: 0, skipped, errors: [error.message] };
  }

  for (const row of updates) {
    const { error } = await supabase.from(TABLE).update(row).eq("event_id", row.event_id);
    if (error) return { inserted: inserts.length, updated: 0, skipped, errors: [error.message] };
  }

  return { inserted: inserts.length, updated: updates.length, skipped, errors: [] as string[] };
}

export async function listTodayMarketImpactEvents(input: {
  sport?: MarketImpactSport | "ALL";
  confidence?: MarketImpactEvent["confidence"] | "ALL";
  limit?: number;
}) {
  const supabase = getSupabaseAdmin();
  const bounds = nyDayBounds();
  let query = supabase
    .from(TABLE)
    .select("*")
    .gte("published_at", bounds.start)
    .lt("published_at", bounds.end)
    .order("published_at", { ascending: false })
    .limit(input.limit ?? 50);

  if (input.sport && input.sport !== "ALL") query = query.eq("sport", input.sport);
  if (input.confidence && input.confidence !== "ALL") query = query.eq("confidence", input.confidence);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: MarketImpactRow) => fromRow(row));
}

export async function countTodayMarketImpactEvents() {
  const supabase = getSupabaseAdmin();
  const bounds = nyDayBounds();
  const { count, error } = await supabase
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .gte("published_at", bounds.start)
    .lt("published_at", bounds.end);

  if (error) throw error;
  return count ?? 0;
}
