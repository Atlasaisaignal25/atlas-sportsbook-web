import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import {
  buildCandidatePool,
  candidatePicksToPrecisionCandidates,
  type CandidatePoolResult,
  type CandidateSport,
  type RawCandidateInput,
} from "@/app/lib/candidate-pool";
import {
  buildPersistablePrecisionPreview,
  buildPrecisionPreview,
  normalizePrecisionDate,
  scorePrecisionCandidate,
  type PrecisionCandidate,
  type PrecisionDecision,
  type PrecisionNoPlayReason,
  type PrecisionPreview,
  type PrecisionSport,
} from "@/app/lib/precision-engine";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ComparableSport = Exclude<CandidateSport, "nfl">;

type CompareDecision = {
  product: "top_signal" | "top_play";
  sport: PrecisionSport | "global";
  gameId: string | null;
  pickLabel: string | null;
  market: string | null;
  selection: string | null;
  line: number | null;
  odds: number | null;
  precisionScore: number | null;
  lifecycleStatus: string;
  noPlayReason: PrecisionNoPlayReason | null;
};

type SportCompareResult = {
  legacy: CompareDecision;
  candidatePool: CompareDecision;
  samePick: boolean;
  notes: string[];
};

const comparableSports = ["mlb", "nba", "nhl", "soccer"] as const satisfies readonly ComparableSport[];

const publicSignalTables: Record<ComparableSport, string> = {
  mlb: "mlb_public_signals",
  nba: "nba_public_signals",
  nhl: "nhl_public_signals",
  soccer: "soccer_public_signals",
};

const precisionSportByCandidateSport: Record<ComparableSport, PrecisionSport> = {
  mlb: "MLB",
  nba: "NBA",
  nhl: "NHL",
  soccer: "SOCCER",
};

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
    raw: row,
  };
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
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

function summarizeDecision(params: {
  product: "top_signal" | "top_play";
  sport: PrecisionSport | "global";
  decision: PrecisionDecision | null;
  candidates: PrecisionCandidate[];
}): CompareDecision {
  const candidate = params.decision?.candidate ?? null;

  return {
    product: params.product,
    sport: params.sport,
    gameId: candidate?.gameId ?? null,
    pickLabel: candidate?.pick ?? null,
    market: candidate?.market ? String(candidate.market) : null,
    selection: getSelection(candidate),
    line: normalizeNumber(candidate?.line),
    odds: normalizeNumber(candidate?.odds),
    precisionScore: normalizeNumber(
      params.decision?.precisionScore ??
        (candidate ? scorePrecisionCandidate(candidate) : null)
    ),
    lifecycleStatus: params.decision?.timeline?.status ?? "no_play",
    noPlayReason: params.decision
      ? params.decision.timeline?.noPlayReason ?? null
      : getNoPlayReason(params.candidates),
  };
}

function comparableValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function samePick(left: CompareDecision, right: CompareDecision) {
  if (!left.gameId || !right.gameId || !left.pickLabel || !right.pickLabel) return false;

  return (
    comparableValue(left.gameId) === comparableValue(right.gameId) &&
    comparableValue(left.pickLabel) === comparableValue(right.pickLabel) &&
    comparableValue(left.market) === comparableValue(right.market) &&
    comparableValue(left.line) === comparableValue(right.line) &&
    comparableValue(left.odds) === comparableValue(right.odds)
  );
}

function collectNotes(params: {
  sport: ComparableSport;
  pool: CandidatePoolResult;
  legacyCandidates: PrecisionCandidate[];
  poolCandidates: PrecisionCandidate[];
  legacy: CompareDecision;
  candidatePool: CompareDecision;
}) {
  const notes: string[] = [];

  if (params.pool.rejections.length > 0) {
    notes.push(
      `${params.pool.rejections.length} candidate(s) rejected by Candidate Pool normalization.`
    );
  }

  if (params.pool.warnings.length > 0) {
    notes.push(...params.pool.warnings.map((warning) => `${params.sport}: ${warning}`));
  }

  if (params.legacy.noPlayReason && !params.legacy.gameId) {
    notes.push(`Legacy Precision returned no_play: ${params.legacy.noPlayReason}.`);
  }

  if (params.candidatePool.noPlayReason && !params.candidatePool.gameId) {
    notes.push(`Candidate Pool Precision returned no_play: ${params.candidatePool.noPlayReason}.`);
  }

  if (params.legacyCandidates.length !== params.poolCandidates.length) {
    notes.push(
      `Legacy candidates: ${params.legacyCandidates.length}; Candidate Pool eligible candidates: ${params.poolCandidates.length}.`
    );
  }

  return notes;
}

async function loadPoolForSport(params: { sport: ComparableSport; date: string }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(publicSignalTables[params.sport])
    .select("*")
    .eq("date", params.date)
    .order("start_time", { ascending: true });

  if (error) {
    return buildCandidatePool({
      sport: params.sport,
      date: params.date,
      sources: [
        {
          source: "public_signals_legacy",
          candidates: [],
          warnings: [`${params.sport.toUpperCase()} legacy source error: ${error.message}`],
        },
      ],
    });
  }

  return buildCandidatePool({
    sport: params.sport,
    date: params.date,
    sources: [
      {
        source: "public_signals_legacy",
        candidates: (data ?? []).map((row: any) => toRawCandidate(row, params.sport)),
      },
    ],
  });
}

function compareSport(params: {
  sport: ComparableSport;
  legacyPreview: PrecisionPreview;
  legacyCandidates: PrecisionCandidate[];
  poolPreview: PrecisionPreview;
  pool: CandidatePoolResult;
  poolCandidates: PrecisionCandidate[];
}) {
  const precisionSport = precisionSportByCandidateSport[params.sport];
  const legacy = summarizeDecision({
    product: "top_signal",
    sport: precisionSport,
    decision: params.legacyPreview.topSignalsBySport[precisionSport] ?? null,
    candidates: params.legacyCandidates,
  });
  const candidatePool = summarizeDecision({
    product: "top_signal",
    sport: precisionSport,
    decision: params.poolPreview.topSignalsBySport[precisionSport] ?? null,
    candidates: params.poolCandidates,
  });

  return {
    legacy,
    candidatePool,
    samePick: samePick(legacy, candidatePool),
    notes: collectNotes({
      sport: params.sport,
      pool: params.pool,
      legacyCandidates: params.legacyCandidates,
      poolCandidates: params.poolCandidates,
      legacy,
      candidatePool,
    }),
  } satisfies SportCompareResult;
}

function compareTopPlay(params: {
  legacyPreview: PrecisionPreview;
  legacyCandidates: PrecisionCandidate[];
  poolPreview: PrecisionPreview;
  poolCandidates: PrecisionCandidate[];
}) {
  const legacy = summarizeDecision({
    product: "top_play",
    sport: "global",
    decision: params.legacyPreview.topPlay,
    candidates: params.legacyCandidates,
  });
  const candidatePool = summarizeDecision({
    product: "top_play",
    sport: "global",
    decision: params.poolPreview.topPlay,
    candidates: params.poolCandidates,
  });

  return {
    legacy,
    candidatePool,
    samePick: samePick(legacy, candidatePool),
  };
}

export async function GET(request: Request) {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = normalizePrecisionDate(searchParams.get("date"));
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
  const precisionSports = sports.map((sport) => precisionSportByCandidateSport[sport]);
  const legacyResult = await buildPersistablePrecisionPreview(date);
  const legacyCandidates = legacyResult.candidates.filter((candidate) =>
    precisionSports.includes(candidate.sport)
  );
  const legacyPreview = buildPrecisionPreview(legacyCandidates, date);
  const poolResults = await Promise.all(
    sports.map(async (sport) => ({
      sport,
      pool: await loadPoolForSport({ sport, date }),
    }))
  );
  const poolCandidatesBySport = Object.fromEntries(
    poolResults.map(({ sport, pool }) => [
      sport,
      candidatePicksToPrecisionCandidates(pool.candidates, date),
    ])
  ) as Record<ComparableSport, PrecisionCandidate[]>;
  const poolCandidates = sports.flatMap((sport) => poolCandidatesBySport[sport]);
  const poolPreview = buildPrecisionPreview(poolCandidates, date);
  const sportsReport = Object.fromEntries(
    poolResults.map(({ sport, pool }) => {
      const precisionSport = precisionSportByCandidateSport[sport];
      const report = compareSport({
        sport,
        legacyPreview,
        legacyCandidates: legacyCandidates.filter((candidate) => candidate.sport === precisionSport),
        poolPreview,
        pool,
        poolCandidates: poolCandidatesBySport[sport],
      });

      return [sport, report];
    })
  ) as Partial<Record<ComparableSport, SportCompareResult>>;
  const topPlay = compareTopPlay({
    legacyPreview,
    legacyCandidates,
    poolPreview,
    poolCandidates,
  });
  const warnings = [
    ...legacyResult.errors.map((error) => `legacy: ${error}`),
    ...poolResults.flatMap(({ sport, pool }) =>
      pool.warnings.map((warning) => `${sport}: ${warning}`)
    ),
  ];
  const sportReports = Object.values(sportsReport);

  return NextResponse.json({
    ok: true,
    date,
    sports: sportsReport,
    topPlay,
    summary: {
      sportsCompared: sportReports.length,
      sameSportPicks: sportReports.filter((report) => report.samePick).length,
      differentSportPicks: sportReports.filter(
        (report) =>
          !report.samePick &&
          Boolean(report.legacy.gameId || report.candidatePool.gameId)
      ).length,
      legacyNoPlayCount: sportReports.filter((report) => !report.legacy.gameId).length,
      poolNoPlayCount: sportReports.filter((report) => !report.candidatePool.gameId).length,
      warnings,
    },
  });
}
