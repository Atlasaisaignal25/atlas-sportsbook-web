import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { buildCandidatePool } from "@/app/lib/candidate-pool/builder";
import { candidatePicksToPrecisionCandidates } from "@/app/lib/candidate-pool/adapters/precision";
import type { CandidateSport, RawCandidateInput } from "@/app/lib/candidate-pool/types";
import { buildPrecisionPreview } from "./scoring";
import { buildNoPlayTimeline } from "./timeline";
import type {
  PrecisionCandidate,
  PrecisionDecision,
  PrecisionNoPlayReason,
  PrecisionPreview,
  PrecisionSport,
} from "./types";

type PrecisionSource = {
  sport: Exclude<PrecisionSport, "NFL">;
  table: string;
};

export type PrecisionCandidateSource =
  | "legacy_public_signals"
  | "candidate_pool";

type PrecisionSnapshotProductType = "top_signal" | "top_play";

type PrecisionSnapshotDecision = {
  date: string;
  sport: PrecisionSport | "global";
  productType: PrecisionSnapshotProductType;
  decision: PrecisionDecision | null;
  candidates: PrecisionCandidate[];
};

export type PrecisionCandidateLoadResult = {
  date: string;
  candidateSource: PrecisionCandidateSource;
  candidates: PrecisionCandidate[];
  errors: string[];
};

export type PrecisionPersistablePreview = PrecisionCandidateLoadResult & {
  preview: PrecisionPreview;
};

export const precisionCandidateSources: PrecisionSource[] = [
  { sport: "MLB", table: "mlb_public_signals" },
  { sport: "NBA", table: "nba_public_signals" },
  { sport: "NHL", table: "nhl_public_signals" },
  { sport: "SOCCER", table: "soccer_public_signals" },
];

export const supportedPrecisionSports = precisionCandidateSources.map(
  (source) => source.sport
);

const candidatePoolSportMap: Record<Exclude<PrecisionSport, "NFL">, CandidateSport> = {
  MLB: "mlb",
  NBA: "nba",
  NHL: "nhl",
  SOCCER: "soccer",
};

function useCandidatePoolForPrecision() {
  return process.env.USE_CANDIDATE_POOL_FOR_PRECISION?.trim().toLowerCase() !== "false";
}

export function todayET() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

export function normalizePrecisionDate(value: string | null | undefined) {
  return value?.match(/^\d{4}-\d{2}-\d{2}$/) ? value : todayET();
}

function normalizeCandidate(
  row: any,
  sport: PrecisionSport,
  date: string
): PrecisionCandidate {
  return {
    id: row.id ?? null,
    sport,
    date: row.date ?? date,
    gameId: row.game_id ?? row.gameId ?? null,
    awayTeam: row.away_team ?? row.awayTeam ?? "",
    homeTeam: row.home_team ?? row.homeTeam ?? "",
    pick: row.pick ?? "",
    market: row.market ?? "",
    line: row.line ?? null,
    odds: row.odds ?? null,
    startTime: row.start_time ?? row.startTime ?? null,
    status: row.status ?? null,
    confidence: row.confidence ?? null,
    internalScore: row.internal_score ?? row.internalScore ?? null,
    edge: row.edge ?? null,
    analysisSummary: row.analysis_summary ?? row.analysisSummary ?? null,
    confidenceLabel: row.confidence_label ?? row.confidenceLabel ?? null,
    edgeLabel: row.edge_label ?? row.edgeLabel ?? null,
    riskNote: row.risk_note ?? row.riskNote ?? null,
    modelFactors: row.model_factors ?? row.modelFactors ?? null,
  };
}

function toRawCandidate(row: any, sport: CandidateSport): RawCandidateInput {
  return {
    id: row.id ?? null,
    sport,
    source: "public_signals_legacy",
    sourceGameId: row.game_id ?? null,
    gameId: row.game_id ?? row.id ?? null,
    start_time: row.start_time ?? row.commence_time ?? null,
    home_team: row.home_team ?? null,
    away_team: row.away_team ?? null,
    league: row.league ?? null,
    market: row.market ?? null,
    selection: row.selection ?? row.pick ?? null,
    pick: row.pick ?? null,
    line: row.line ?? null,
    odds: row.odds ?? null,
    bookmaker: row.bookmaker ?? row.best_book ?? null,
    book_count: row.book_count ?? row.bookCount ?? null,
    average_price: row.average_price ?? row.averagePrice ?? null,
    best_price: row.best_price ?? row.bestPrice ?? row.odds ?? null,
    price_spread: row.price_spread ?? row.priceSpread ?? null,
    tags: ["legacy-public-signal"],
    raw: row,
  };
}

function getNoPlayReason(candidates: PrecisionCandidate[]): PrecisionNoPlayReason {
  if (candidates.length === 0) return "no_candidates";

  const hasMissingData = candidates.every(
    (candidate) =>
      !candidate.pick ||
      !candidate.market ||
      candidate.odds === null ||
      candidate.odds === undefined ||
      !candidate.startTime
  );

  return hasMissingData ? "missing_data" : "below_threshold";
}

function normalizeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getSelection(candidate: PrecisionCandidate | null) {
  if (!candidate?.pick) return null;

  return candidate.pick
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+(ML|Moneyline|Spread|Total)$/i, "")
    .trim();
}

function buildNoPlayDecisionTimeline(candidates: PrecisionCandidate[]) {
  const firstCandidateWithStart = candidates.find((candidate) => candidate.startTime);
  return buildNoPlayTimeline({
    commenceTime: firstCandidateWithStart?.startTime ?? null,
    reason: getNoPlayReason(candidates),
  });
}

function decisionToSnapshotRow({
  date,
  sport,
  productType,
  decision,
  candidates,
}: PrecisionSnapshotDecision) {
  const candidate = decision?.candidate ?? null;
  const timeline = decision?.timeline ?? buildNoPlayDecisionTimeline(candidates);

  return {
    date,
    sport: sport === "global" ? "global" : sport.toLowerCase(),
    product_type: productType,
    game_id: candidate?.gameId ?? null,
    start_time: candidate?.startTime ?? null,
    release_at: timeline.releaseAt,
    locked_at: timeline.lockedAt,
    lifecycle_status: timeline.status,
    pick_label: candidate?.pick ?? null,
    market: candidate?.market ?? null,
    selection: getSelection(candidate),
    line: normalizeNumber(candidate?.line),
    odds: normalizeNumber(candidate?.odds),
    confidence: normalizeNumber(candidate?.confidence ?? candidate?.internalScore),
    value_priority: normalizeNumber(candidate?.edge),
    precision_score: normalizeNumber(decision?.precisionScore),
    progress_percent: timeline.progressPercent,
    can_purchase: timeline.canPurchase,
    can_reveal_pick: timeline.canRevealPick,
    no_play_reason: timeline.noPlayReason ?? null,
    reasons: decision?.reasons ?? [],
    source_signal_id: candidate?.id ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function loadPrecisionCandidates(
  date: string
): Promise<PrecisionCandidateLoadResult> {
  if (useCandidatePoolForPrecision()) {
    return loadCandidatePoolPrecisionCandidates(date);
  }

  return loadLegacyPrecisionCandidates(date);
}

async function loadLegacyPrecisionCandidates(
  date: string
): Promise<PrecisionCandidateLoadResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];

  const sourceResults = await Promise.all(
    precisionCandidateSources.map(async (source) => {
      const { data, error } = await supabase
        .from(source.table)
        .select("*")
        .eq("date", date);

      if (error) {
        errors.push(`${source.sport}: ${error.message}`);
        return [];
      }

      return (data ?? []).map((row: any) =>
        normalizeCandidate(row, source.sport, date)
      );
    })
  );

  return {
    date,
    candidateSource: "legacy_public_signals",
    candidates: sourceResults.flat(),
    errors,
  };
}

async function loadCandidatePoolPrecisionCandidates(
  date: string
): Promise<PrecisionCandidateLoadResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];

  const sourceResults = await Promise.all(
    precisionCandidateSources.map(async (source) => {
      const candidateSport = candidatePoolSportMap[source.sport];
      const { data, error } = await supabase
        .from(source.table)
        .select("*")
        .eq("date", date);

      if (error) {
        errors.push(`${source.sport}: ${error.message}`);
        return [];
      }

      const pool = buildCandidatePool({
        sport: candidateSport,
        date,
        sources: [
          {
            source: "public_signals_legacy",
            candidates: (data ?? []).map((row: any) =>
              toRawCandidate(row, candidateSport)
            ),
          },
        ],
      });

      if (pool.warnings.length > 0) {
        errors.push(...pool.warnings.map((warning) => `${source.sport}: ${warning}`));
      }

      return candidatePicksToPrecisionCandidates(pool.candidates, date);
    })
  );

  return {
    date,
    candidateSource: "candidate_pool",
    candidates: sourceResults.flat(),
    errors,
  };
}

export async function buildPersistablePrecisionPreview(
  date: string
): Promise<PrecisionPersistablePreview> {
  const candidateResult = await loadPrecisionCandidates(date);

  return {
    ...candidateResult,
    preview: buildPrecisionPreview(candidateResult.candidates, date),
  };
}

export function buildPrecisionSnapshotRows({
  date,
  candidates,
  preview,
}: PrecisionPersistablePreview) {
  const topSignalRows = supportedPrecisionSports.map((sport) => {
    const sportCandidates = candidates.filter((candidate) => candidate.sport === sport);

    return decisionToSnapshotRow({
      date,
      sport,
      productType: "top_signal",
      decision: preview.topSignalsBySport[sport] ?? null,
      candidates: sportCandidates,
    });
  });

  const topPlayCandidates = candidates;
  const topPlayRow = decisionToSnapshotRow({
    date,
    sport: "global",
    productType: "top_play",
    decision: preview.topPlay,
    candidates: topPlayCandidates,
  });

  return [...topSignalRows, topPlayRow];
}

export async function syncPrecisionSnapshots(date: string) {
  const previewResult = await buildPersistablePrecisionPreview(date);
  const rows = buildPrecisionSnapshotRows(previewResult);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("precision_snapshots")
    .upsert(rows, {
      onConflict: "date,sport,product_type",
    })
    .select("*");

  if (error) {
    throw new Error(
      `Unable to sync precision_snapshots: ${error.message}. Run precision_engine_schema.sql before syncing Precision Engine snapshots.`
    );
  }

  return {
    ...previewResult,
    rows,
    snapshots: data ?? [],
  };
}
