/**
 * Official public product contract for Atlas.
 *
 * Sport engines can keep their own internal statuses, fields, scores, and
 * ranking models, but public product surfaces must consume AtlasProductSignal.
 * Internal lifecycle labels such as INTERNAL_CANDIDATE, CORE_PICK, RAW_SIGNAL,
 * ENGINE_READY, VALIDATED, or CONFIRMED are intentionally collapsed before data
 * reaches Home, My Atlas, Atlas Tracking, Membership, or public product feeds.
 */
export type AtlasPublicProductStatus =
  | "PENDING"
  | "LIVE"
  | "FINAL"
  | "WON"
  | "LOSS"
  | "PUSH"
  | "CANCELLED";

export type AtlasProductSignal = {
  signalId: string;
  sport: string;
  league: string;
  eventId: string | null;
  awayTeam: string;
  homeTeam: string;
  selection: string;
  market: string;
  line: number | string | null;
  odds: number | null;
  confidence: number | string | null;
  rank: number | null;
  status: AtlasPublicProductStatus;
  product: string;
  timestamp: string | null;
  isTopSignal: boolean;
  internalScore: number | string | null;
};

export function normalizeProductStatus(status: unknown): AtlasPublicProductStatus {
  const normalized = String(status ?? "PENDING").trim().toUpperCase();

  if (
    normalized === "INTERNAL_CANDIDATE" ||
    normalized === "UNDER_REVIEW" ||
    normalized === "RAW_SIGNAL" ||
    normalized === "ENGINE_READY" ||
    normalized === "CORE_PICK" ||
    normalized === "VALIDATED" ||
    normalized === "CONFIRMED"
  ) {
    return "PENDING";
  }

  if (normalized === "WIN" || normalized === "WON") return "WON";
  if (normalized === "LOST" || normalized === "LOSS") return "LOSS";
  if (normalized === "CANCELED" || normalized === "CANCELLED" || normalized === "REMOVED") return "CANCELLED";
  if (normalized === "LIVE") return "LIVE";
  if (normalized === "FINAL") return "FINAL";
  if (normalized === "PUSH") return "PUSH";

  return "PENDING";
}

function text(value: unknown, fallback = "") {
  return String(value ?? fallback);
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAtlasProductSignal(
  raw: Record<string, unknown>,
  fallback: { sport: string; product: string; index?: number },
): AtlasProductSignal {
  const rank = numberOrNull(raw.rank) ?? (fallback.index !== undefined ? fallback.index + 1 : null);
  const eventId = raw.gameId ?? raw.game_id ?? raw.eventId ?? raw.event_id ?? null;
  const timestamp = raw.startTime ?? raw.start_time ?? raw.commence_time ?? raw.timestamp ?? null;
  const signalId = text(raw.signalId ?? raw.signal_id ?? raw.id ?? eventId ?? `${fallback.product}-${fallback.sport}-${rank ?? "signal"}`);

  return {
    signalId,
    sport: text(raw.sport, fallback.sport).toUpperCase(),
    league: text(raw.league, fallback.sport).toUpperCase(),
    eventId: eventId === null || eventId === undefined ? null : String(eventId),
    awayTeam: text(raw.awayTeam ?? raw.away_team),
    homeTeam: text(raw.homeTeam ?? raw.home_team),
    selection: text(raw.selection ?? raw.pick),
    market: text(raw.market),
    line: (raw.line ?? null) as number | string | null,
    odds: numberOrNull(raw.odds),
    confidence: (raw.confidence ?? null) as number | string | null,
    rank,
    status: normalizeProductStatus(raw.status),
    product: fallback.product,
    timestamp: timestamp === null || timestamp === undefined ? null : String(timestamp),
    isTopSignal: Boolean(raw.isTopSignal ?? raw.is_top_signal) || rank === 1,
    internalScore: (raw.internalScore ?? raw.internal_score ?? raw.pick_ranking ?? null) as number | string | null,
  };
}
