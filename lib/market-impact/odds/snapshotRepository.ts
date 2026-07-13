import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import type { OddsSnapshot } from "@/types/oddsMovement";

const TABLE_NAME = "market_odds_snapshots";

type SnapshotRow = {
  sport: string;
  event_id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmaker: string;
  bookmaker_key?: string | null;
  bookmaker_name?: string | null;
  market_key: string;
  outcome_name: string;
  point: number | null;
  price: number | null;
  captured_at: string;
};

function toRow(snapshot: OddsSnapshot): SnapshotRow {
  return {
    sport: snapshot.sport,
    event_id: snapshot.eventId,
    commence_time: snapshot.commenceTime,
    home_team: snapshot.homeTeam,
    away_team: snapshot.awayTeam,
    bookmaker: snapshot.bookmaker,
    bookmaker_key: snapshot.bookmakerKey ?? snapshot.bookmaker,
    bookmaker_name: snapshot.bookmakerName ?? snapshot.bookmaker,
    market_key: snapshot.marketKey,
    outcome_name: snapshot.outcomeName,
    point: snapshot.point ?? null,
    price: snapshot.price ?? null,
    captured_at: snapshot.capturedAt,
  };
}

function fromRow(row: SnapshotRow): OddsSnapshot {
  return {
    sport: "MLB",
    eventId: row.event_id,
    commenceTime: row.commence_time,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    bookmaker: row.bookmaker,
    bookmakerKey: row.bookmaker_key ?? row.bookmaker,
    bookmakerName: row.bookmaker_name ?? row.bookmaker,
    marketKey: row.market_key as OddsSnapshot["marketKey"],
    outcomeName: row.outcome_name,
    point: row.point ?? undefined,
    price: row.price ?? undefined,
    capturedAt: row.captured_at,
  };
}

function snapshotIdentity(snapshot: OddsSnapshot) {
  return [
    snapshot.sport,
    snapshot.eventId,
    snapshot.bookmaker,
    snapshot.marketKey,
    snapshot.outcomeName,
    snapshot.point ?? "",
    snapshot.price ?? "",
  ].join(":");
}

export async function getLatestSnapshotsForSport(sport: "MLB"): Promise<Map<string, OddsSnapshot>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("sport,event_id,commence_time,home_team,away_team,bookmaker,bookmaker_key,bookmaker_name,market_key,outcome_name,point,price,captured_at")
    .eq("sport", sport)
    .order("captured_at", { ascending: false })
    .limit(5000);

  if (error) throw error;

  const latest = new Map<string, OddsSnapshot>();
  (data ?? []).forEach((row: SnapshotRow) => {
    const snapshot = fromRow(row);
    const key = [
      snapshot.eventId,
      snapshot.bookmaker,
      snapshot.marketKey,
      snapshot.outcomeName,
    ].join(":");
    if (!latest.has(key)) latest.set(key, snapshot);
  });

  return latest;
}

export async function insertSnapshotsDeduped(snapshots: OddsSnapshot[]) {
  if (snapshots.length === 0) return { inserted: 0, skipped: 0 };

  const supabase = getSupabaseAdmin();
  const capturedAt = snapshots[0]?.capturedAt ?? new Date().toISOString();
  const windowStart = new Date(new Date(capturedAt).getTime() - 5 * 60000).toISOString();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("sport,event_id,commence_time,home_team,away_team,bookmaker,bookmaker_key,bookmaker_name,market_key,outcome_name,point,price,captured_at")
    .eq("sport", "MLB")
    .gte("captured_at", windowStart);

  if (error) throw error;

  const existing = new Set((data ?? []).map((row: SnapshotRow) => snapshotIdentity(fromRow(row))));
  const rows = snapshots.filter((snapshot) => !existing.has(snapshotIdentity(snapshot))).map(toRow);

  if (rows.length === 0) return { inserted: 0, skipped: snapshots.length };

  const { error: insertError } = await supabase.from(TABLE_NAME).insert(rows);
  if (insertError) throw insertError;

  return { inserted: rows.length, skipped: snapshots.length - rows.length };
}

export async function getRecentSnapshots(sport: "MLB", lookbackMinutes = 60): Promise<OddsSnapshot[]> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - lookbackMinutes * 60000).toISOString();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("sport,event_id,commence_time,home_team,away_team,bookmaker,bookmaker_key,bookmaker_name,market_key,outcome_name,point,price,captured_at")
    .eq("sport", sport)
    .gte("captured_at", since)
    .order("captured_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: SnapshotRow) => fromRow(row));
}

export async function getSnapshotStatus() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("captured_at,event_id")
    .eq("sport", "MLB")
    .order("captured_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  return {
    lastSnapshotTime: data?.[0]?.captured_at ?? null,
    gamesTracked: new Set((data ?? []).map((row: { event_id: string }) => row.event_id)).size,
    rowsChecked: data?.length ?? 0,
  };
}
