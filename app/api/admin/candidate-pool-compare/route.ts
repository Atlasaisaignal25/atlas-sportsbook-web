import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import {
  buildCandidatePool,
  type CandidatePick,
  type CandidateRejection,
  type CandidateRiskFlag,
  type CandidateSport,
  type RawCandidateInput,
} from "@/app/lib/candidate-pool";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ComparableSport = Exclude<CandidateSport, "nfl">;

type CandidateMismatchKind =
  | "missing_from_pool"
  | "rejected_candidate"
  | "duplicate_candidate"
  | "invalid_market"
  | "invalid_odds"
  | "invalid_time"
  | "unknown";

type CandidateMismatch = {
  type: CandidateMismatchKind;
  legacyId?: string | null;
  candidateId?: string | null;
  gameId?: string | null;
  reason?: CandidateRiskFlag | string | null;
  details?: string | Record<string, unknown> | null;
};

const comparableSports = ["mlb", "nba", "nhl", "soccer"] as const satisfies readonly ComparableSport[];

const publicSignalTables: Record<ComparableSport, string> = {
  mlb: "mlb_public_signals",
  nba: "nba_public_signals",
  nhl: "nhl_public_signals",
  soccer: "soccer_public_signals",
};

function todayET() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeCompareDate(value: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayET();
}

function normalizeCompareSport(value: string | null): ComparableSport | "all" | null {
  const sport = String(value ?? "all").trim().toLowerCase();

  if (sport === "all") return "all";
  if ((comparableSports as readonly string[]).includes(sport)) {
    return sport as ComparableSport;
  }

  return null;
}

function toRawCandidate(row: any, sport: ComparableSport): RawCandidateInput {
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
  };
}

function previewCandidate(candidate: CandidatePick) {
  const { raw, ...safeCandidate } = candidate;
  return safeCandidate;
}

function rejectionToMismatch(rejection: CandidateRejection): CandidateMismatch {
  if (rejection.reason === "duplicate_candidate") {
    return {
      type: "duplicate_candidate",
      candidateId: rejection.candidateId ?? null,
      gameId: rejection.gameId ?? null,
      reason: rejection.reason,
      details: rejection.details ?? null,
    };
  }

  if (rejection.reason === "unsupported_market") {
    return {
      type: "invalid_market",
      candidateId: rejection.candidateId ?? null,
      gameId: rejection.gameId ?? null,
      reason: rejection.reason,
      details: rejection.details ?? null,
    };
  }

  if (rejection.reason === "missing_odds" || rejection.reason === "bad_price") {
    return {
      type: "invalid_odds",
      candidateId: rejection.candidateId ?? null,
      gameId: rejection.gameId ?? null,
      reason: rejection.reason,
      details: rejection.details ?? null,
    };
  }

  if (rejection.reason === "invalid_time" || rejection.reason === "game_started") {
    return {
      type: "invalid_time",
      candidateId: rejection.candidateId ?? null,
      gameId: rejection.gameId ?? null,
      reason: rejection.reason,
      details: rejection.details ?? null,
    };
  }

  return {
    type: "rejected_candidate",
    candidateId: rejection.candidateId ?? null,
    gameId: rejection.gameId ?? null,
    reason: rejection.reason,
    details: rejection.details ?? null,
  };
}

function countRejections(rejections: CandidateRejection[], reason: CandidateRiskFlag) {
  return rejections.filter((rejection) => rejection.reason === reason).length;
}

async function compareSport(params: { sport: ComparableSport; date: string }) {
  const supabase = getSupabaseAdmin();
  const table = publicSignalTables[params.sport];
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("date", params.date)
    .order("start_time", { ascending: true });

  if (error) {
    const warning = `${params.sport.toUpperCase()} legacy source error: ${error.message}`;
    const result = buildCandidatePool({
      sport: params.sport,
      date: params.date,
      sources: [
        {
          source: "public_signals_legacy",
          candidates: [],
          warnings: [warning],
        },
      ],
    });

    return {
      sport: params.sport,
      legacyRows: 0,
      poolCandidates: result.totalCandidates,
      eligible: result.eligibleCandidates,
      rejected: result.rejectedCandidates,
      duplicateCandidates: 0,
      supportedMarkets: {},
      rejectedMarkets: {},
      validOdds: 0,
      invalidOdds: 0,
      gamesStartedFiltered: 0,
      missingTeams: 0,
      missingCommenceTime: 0,
      unsupportedMarket: 0,
      candidateIds: [],
      warnings: [warning],
      mismatches: [
        {
          type: "unknown" as const,
          reason: "legacy_source_error",
          details: warning,
        },
      ],
      eligiblePreview: [],
      rejectedPreview: [],
      mismatchPreview: [],
    };
  }

  const legacyRows = data ?? [];
  const result = buildCandidatePool({
    sport: params.sport,
    date: params.date,
    sources: [
      {
        source: "public_signals_legacy",
        candidates: legacyRows.map((row: any) => toRawCandidate(row, params.sport)),
      },
    ],
  });
  const poolCandidateIds = new Set(result.candidates.map((candidate) => candidate.id));
  const rejectionCandidateIds = new Set(
    result.rejections.map((rejection) => rejection.candidateId).filter(Boolean)
  );
  const missingFromPool = legacyRows
    .map((row: any, index: number) => {
      const raw = toRawCandidate(row, params.sport);
      const candidateResult = buildCandidatePool({
        sport: params.sport,
        date: params.date,
        sources: [
          {
            source: "public_signals_legacy",
            candidates: [raw],
          },
        ],
      });
      const candidateId =
        candidateResult.candidates[0]?.id ??
        candidateResult.rejections[0]?.candidateId ??
        String(row.id ?? `${params.sport}-${index}`);

      if (poolCandidateIds.has(candidateId) || rejectionCandidateIds.has(candidateId)) {
        return null;
      }

      return {
        type: "missing_from_pool" as const,
        legacyId: row.id ?? null,
        candidateId,
        gameId: row.game_id ?? null,
        reason: "not_found_after_normalization",
      };
    })
    .filter(Boolean) as CandidateMismatch[];
  const rejectionMismatches = result.rejections.map(rejectionToMismatch);
  const mismatches = [...rejectionMismatches, ...missingFromPool];
  const supportedMarkets = result.candidates.reduce<Record<string, number>>(
    (acc, candidate) => {
      acc[candidate.market] = (acc[candidate.market] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const rejectedMarkets = result.rejections.reduce<Record<string, number>>(
    (acc, rejection) => {
      if (rejection.reason !== "unsupported_market") return acc;
      const market =
        typeof rejection.details === "object" && rejection.details && "market" in rejection.details
          ? String(rejection.details.market)
          : "unknown";
      acc[market] = (acc[market] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return {
    sport: params.sport,
    legacyRows: legacyRows.length,
    poolCandidates: result.totalCandidates,
    eligible: result.eligibleCandidates,
    rejected: result.rejectedCandidates,
    duplicateCandidates: countRejections(result.rejections, "duplicate_candidate"),
    supportedMarkets,
    rejectedMarkets,
    validOdds: result.candidates.filter((candidate) => candidate.odds !== null).length,
    invalidOdds:
      countRejections(result.rejections, "missing_odds") +
      countRejections(result.rejections, "bad_price"),
    gamesStartedFiltered: countRejections(result.rejections, "game_started"),
    missingTeams: countRejections(result.rejections, "missing_team"),
    missingCommenceTime: countRejections(result.rejections, "invalid_time"),
    unsupportedMarket: countRejections(result.rejections, "unsupported_market"),
    candidateIds: result.candidates.map((candidate) => candidate.id),
    warnings: result.warnings,
    mismatches,
    eligiblePreview: result.candidates.slice(0, 10).map(previewCandidate),
    rejectedPreview: result.rejections.slice(0, 10),
    mismatchPreview: mismatches.slice(0, 10),
  };
}

export async function GET(request: Request) {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = normalizeCompareDate(searchParams.get("date"));
  const sportParam = normalizeCompareSport(searchParams.get("sport"));

  if (!sportParam) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported sport. Use mlb, nba, nhl, soccer, or all.",
      },
      { status: 400 }
    );
  }

  const sports = sportParam === "all" ? [...comparableSports] : [sportParam];
  const sportReports = await Promise.all(
    sports.map((sport) =>
      compareSport({
        sport,
        date,
      })
    )
  );
  const totalWarnings = sportReports.reduce(
    (total, report) => total + report.warnings.length,
    0
  );
  const mismatchCount = sportReports.reduce(
    (total, report) => total + report.mismatches.length,
    0
  );

  return NextResponse.json({
    ok: true,
    date,
    summary: {
      totalLegacyRows: sportReports.reduce((total, report) => total + report.legacyRows, 0),
      totalPoolCandidates: sportReports.reduce(
        (total, report) => total + report.poolCandidates,
        0
      ),
      totalEligible: sportReports.reduce((total, report) => total + report.eligible, 0),
      totalRejected: sportReports.reduce((total, report) => total + report.rejected, 0),
      totalWarnings,
      mismatchCount,
    },
    sports: sportReports.map((report) => ({
      sport: report.sport,
      legacyRows: report.legacyRows,
      poolCandidates: report.poolCandidates,
      eligible: report.eligible,
      rejected: report.rejected,
      duplicateCandidates: report.duplicateCandidates,
      supportedMarkets: report.supportedMarkets,
      rejectedMarkets: report.rejectedMarkets,
      validOdds: report.validOdds,
      invalidOdds: report.invalidOdds,
      gamesStartedFiltered: report.gamesStartedFiltered,
      missingTeams: report.missingTeams,
      missingCommenceTime: report.missingCommenceTime,
      unsupportedMarket: report.unsupportedMarket,
      candidateIds: report.candidateIds.slice(0, 10),
      warnings: report.warnings,
      mismatches: report.mismatchPreview,
      eligiblePreview: report.eligiblePreview,
      rejectedPreview: report.rejectedPreview,
    })),
  });
}
