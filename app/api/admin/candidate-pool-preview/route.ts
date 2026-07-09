import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import {
  buildCandidatePool,
  CANDIDATE_SPORTS,
  type CandidatePick,
  type CandidatePoolResult,
  type CandidateRejection,
  type CandidateSport,
  type RawCandidateInput,
} from "@/app/lib/candidate-pool";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

const publicSignalTables: Record<Exclude<CandidateSport, "nfl">, string> = {
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

function normalizePreviewDate(value: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayET();
}

function normalizePreviewSport(value: string | null): CandidateSport | "all" | null {
  const sport = String(value ?? "all").trim().toLowerCase();

  if (sport === "all") return "all";
  if ((CANDIDATE_SPORTS as readonly string[]).includes(sport)) {
    return sport as CandidateSport;
  }

  return null;
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
  };
}

function previewCandidate(candidate: CandidatePick) {
  const { raw, ...safeCandidate } = candidate;
  return safeCandidate;
}

function previewRejection(rejection: CandidateRejection) {
  return rejection;
}

async function buildSportPreview(params: {
  sport: CandidateSport;
  date: string;
}): Promise<{
  result: CandidatePoolResult;
  warnings: string[];
}> {
  if (params.sport === "nfl") {
    const warning = "NFL candidate source not available yet.";
    return {
      warnings: [warning],
      result: buildCandidatePool({
        sport: "nfl",
        date: params.date,
        sources: [
          {
            source: "public_signals_legacy",
            candidates: [],
            warnings: [warning],
          },
        ],
      }),
    };
  }

  const supabase = getSupabaseAdmin();
  const table = publicSignalTables[params.sport];
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("date", params.date)
    .order("start_time", { ascending: true });

  if (error) {
    const warning = `${params.sport.toUpperCase()} legacy source error: ${error.message}`;
    return {
      warnings: [warning],
      result: buildCandidatePool({
        sport: params.sport,
        date: params.date,
        sources: [
          {
            source: "public_signals_legacy",
            candidates: [],
            warnings: [warning],
          },
        ],
      }),
    };
  }

  const rows = (data ?? []).map((row: any) => toRawCandidate(row, params.sport));

  return {
    warnings: [],
    result: buildCandidatePool({
      sport: params.sport,
      date: params.date,
      sources: [
        {
          source: "public_signals_legacy",
          candidates: rows,
        },
      ],
    }),
  };
}

export async function GET(request: Request) {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = normalizePreviewDate(searchParams.get("date"));
  const sportParam = normalizePreviewSport(searchParams.get("sport"));

  if (!sportParam) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported sport. Use mlb, nba, nhl, soccer, nfl, or all.",
      },
      { status: 400 }
    );
  }

  const sports = sportParam === "all" ? [...CANDIDATE_SPORTS] : [sportParam];
  const sportPreviews = await Promise.all(
    sports.map((sport) =>
      buildSportPreview({
        sport,
        date,
      })
    )
  );

  const warnings = sportPreviews.flatMap((preview) => [
    ...preview.warnings,
    ...preview.result.warnings,
  ]);
  const results = sportPreviews.map(({ result }) => ({
    sport: result.sport,
    totalCandidates: result.totalCandidates,
    eligibleCandidates: result.eligibleCandidates,
    rejectedCandidates: result.rejectedCandidates,
    warnings: result.warnings,
    candidates: result.candidates.slice(0, 10).map(previewCandidate),
    rejections: result.rejections.slice(0, 10).map(previewRejection),
  }));

  const summary = {
    totalSports: sports.length,
    totalCandidates: sportPreviews.reduce(
      (total, preview) => total + preview.result.totalCandidates,
      0
    ),
    eligibleCandidates: sportPreviews.reduce(
      (total, preview) => total + preview.result.eligibleCandidates,
      0
    ),
    rejectedCandidates: sportPreviews.reduce(
      (total, preview) => total + preview.result.rejectedCandidates,
      0
    ),
    warningsCount: warnings.length,
  };

  return NextResponse.json({
    ok: true,
    date,
    sports,
    summary,
    results,
    warnings,
  });
}
