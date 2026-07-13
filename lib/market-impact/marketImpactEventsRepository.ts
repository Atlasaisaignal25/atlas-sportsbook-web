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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertMarketImpactEventsDeduped(events: MarketImpactEvent[]) {
  if (events.length === 0) return { inserted: 0, skipped: 0, errors: [] as string[] };

  const supabase = getSupabaseAdmin();
  const rows = events.map(toRow);
  const eventIds = rows.map((row) => row.event_id);
  const existingResult = await supabase
    .from(TABLE)
    .select("event_id")
    .in("event_id", eventIds);

  if (existingResult.error) {
    return { inserted: 0, skipped: 0, errors: [existingResult.error.message] };
  }

  const existing = new Set((existingResult.data ?? []).map((row: { event_id: string }) => row.event_id));
  const inserts = rows.filter((row) => !existing.has(row.event_id));
  const skipped = rows.length - inserts.length;

  if (inserts.length === 0) return { inserted: 0, skipped, errors: [] as string[] };

  const { error } = await supabase.from(TABLE).insert(inserts);
  if (error) return { inserted: 0, skipped, errors: [error.message] };

  return { inserted: inserts.length, skipped, errors: [] as string[] };
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
