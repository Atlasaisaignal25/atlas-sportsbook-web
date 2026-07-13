import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type { TeamImpactEvent, TeamImpactSport } from "@/types/teamImpact";

const TABLE = "team_impact_events";

type TeamImpactRow = {
  id?: string;
  sport: TeamImpactSport;
  event_id: string;
  home_team: string | null;
  away_team: string | null;
  player_name: string | null;
  event_type: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  why: string;
  impact: string;
  published_at: string;
  source: string;
  source_url: string | null;
  status: "ACTIVE" | "UPDATED" | "RESOLVED";
  created_at?: string;
  updated_at?: string;
};

function toRow(event: TeamImpactEvent): TeamImpactRow {
  return {
    sport: event.sport,
    event_id: event.eventId,
    home_team: event.homeTeam,
    away_team: event.awayTeam,
    player_name: event.playerName,
    event_type: event.eventType,
    confidence: event.confidence,
    why: event.why,
    impact: event.impact,
    published_at: event.publishedAt,
    source: event.source,
    source_url: event.sourceUrl,
    status: event.status,
  };
}

function fromRow(row: TeamImpactRow): TeamImpactEvent {
  return {
    id: row.id,
    sport: row.sport,
    eventId: row.event_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    playerName: row.player_name,
    eventType: row.event_type as TeamImpactEvent["eventType"],
    confidence: row.confidence,
    why: row.why,
    impact: row.impact,
    publishedAt: row.published_at,
    source: row.source,
    sourceUrl: row.source_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export async function listTodayTeamImpactEvents(input: {
  sport?: TeamImpactSport | "ALL";
  confidence?: "HIGH" | "MEDIUM" | "LOW" | "ALL";
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
  return (data ?? []).map((row: TeamImpactRow) => fromRow(row));
}

export async function upsertTeamImpactEvents(events: TeamImpactEvent[]) {
  if (events.length === 0) return { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] };

  const supabase = getSupabaseAdmin();
  const rows = events.map(toRow);
  const eventIds = rows.map((row) => row.event_id);
  const existingResult = await supabase
    .from(TABLE)
    .select("event_id,status")
    .in("event_id", eventIds);

  if (existingResult.error) {
    return { inserted: 0, updated: 0, skipped: 0, errors: [existingResult.error.message] };
  }

  const existing = new Map<string, { status: string }>(
    (existingResult.data ?? []).map((row: { event_id: string; status: string }) => [row.event_id, row]),
  );
  const inserts = rows.filter((row) => !existing.has(row.event_id));
  const updates = rows.filter((row) => {
    const current = existing.get(row.event_id);
    return current && current.status !== row.status;
  });
  const skipped = rows.length - inserts.length - updates.length;
  const errors: string[] = [];

  if (inserts.length > 0) {
    const { error } = await supabase.from(TABLE).insert(inserts);
    if (error) errors.push(error.message);
  }

  for (const row of updates) {
    const { error } = await supabase
      .from(TABLE)
      .update(row)
      .eq("event_id", row.event_id);
    if (error) errors.push(error.message);
  }

  return { inserted: errors.length === 0 ? inserts.length : 0, updated: errors.length === 0 ? updates.length : 0, skipped, errors };
}

export async function countTodayTeamImpactEvents() {
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
