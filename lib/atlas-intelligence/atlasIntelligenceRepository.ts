import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type { AtlasIntelligenceEvent, AtlasIntelligenceSport } from "@/types/atlasIntelligenceEvent";
import type { PulseImpact } from "@/types/marketImpact";

const TABLE = "atlas_intelligence_events";

type AtlasIntelligenceRow = {
  id?: string;
  sport: AtlasIntelligenceSport;
  event_id: string;
  related_team_event_id: string;
  related_market_event_id: string;
  insight_type: AtlasIntelligenceEvent["insightType"];
  confidence: PulseImpact;
  summary: string;
  details: AtlasIntelligenceEvent["details"];
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

function toRow(event: AtlasIntelligenceEvent): AtlasIntelligenceRow {
  return {
    sport: event.sport,
    event_id: event.eventId,
    related_team_event_id: event.relatedTeamEventId,
    related_market_event_id: event.relatedMarketEventId,
    insight_type: event.insightType,
    confidence: event.confidence,
    summary: event.summary,
    details: event.details,
    published_at: event.publishedAt,
  };
}

function fromRow(row: AtlasIntelligenceRow): AtlasIntelligenceEvent {
  return {
    id: row.id,
    sport: row.sport,
    eventId: row.event_id,
    relatedTeamEventId: row.related_team_event_id,
    relatedMarketEventId: row.related_market_event_id,
    insightType: row.insight_type,
    confidence: row.confidence,
    summary: row.summary,
    details: row.details,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertAtlasIntelligenceEventsDeduped(events: AtlasIntelligenceEvent[]) {
  if (events.length === 0) return { inserted: 0, skipped: 0, errors: [] as string[] };

  const supabase = getSupabaseAdmin();
  const rows = events.map(toRow);
  const eventIds = rows.map((row) => row.event_id);
  const existingResult = await supabase
    .from(TABLE)
    .select("event_id")
    .in("event_id", eventIds);

  if (existingResult.error) return { inserted: 0, skipped: 0, errors: [existingResult.error.message] };

  const existing = new Set((existingResult.data ?? []).map((row: { event_id: string }) => row.event_id));
  const inserts = rows.filter((row) => !existing.has(row.event_id));
  const skipped = rows.length - inserts.length;
  if (inserts.length === 0) return { inserted: 0, skipped, errors: [] as string[] };

  const { error } = await supabase.from(TABLE).insert(inserts);
  if (error) return { inserted: 0, skipped, errors: [error.message] };

  return { inserted: inserts.length, skipped, errors: [] as string[] };
}

export async function listTodayAtlasIntelligenceEvents(input: {
  sport?: AtlasIntelligenceSport | "ALL";
  confidence?: PulseImpact | "ALL";
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
  return (data ?? []).map((row: AtlasIntelligenceRow) => fromRow(row));
}

export async function countTodayAtlasIntelligenceEvents() {
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
