import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

const publicSignalTables = {
  mlb: "mlb_public_signals",
  nba: "nba_public_signals",
  nhl: "nhl_public_signals",
  soccer: "soccer_public_signals",
} as const;

type PublicSignalSport = keyof typeof publicSignalTables;

function normalizeLimit(value: string | null) {
  const limit = Number(value ?? 20);
  if (!Number.isFinite(limit)) return 20;
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

async function getAvailableDatesForSport(sport: PublicSignalSport, limit: number) {
  const supabase = getSupabaseAdmin();
  const table = publicSignalTables[sport];
  const { data, error } = await supabase
    .from(table)
    .select("date")
    .not("date", "is", null)
    .order("date", { ascending: false })
    .limit(5000);

  if (error) {
    return {
      dates: [],
      warning: `${sport.toUpperCase()} legacy date lookup failed: ${error.message}`,
    };
  }

  const rowsByDate = new Map<string, number>();

  for (const row of data ?? []) {
    const date = String(row.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rowsByDate.set(date, (rowsByDate.get(date) ?? 0) + 1);
  }

  return {
    dates: Array.from(rowsByDate.entries())
      .map(([date, rows]) => ({ date, rows }))
      .slice(0, limit),
    warning: null,
  };
}

export async function GET(request: Request) {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = normalizeLimit(searchParams.get("limit"));
  const entries = await Promise.all(
    (Object.keys(publicSignalTables) as PublicSignalSport[]).map(async (sport) => {
      const result = await getAvailableDatesForSport(sport, limit);
      return [sport, result] as const;
    })
  );
  const sports = entries.reduce<Record<PublicSignalSport, Array<{ date: string; rows: number }>>>(
    (acc, [sport, result]) => {
      acc[sport] = result.dates;
      return acc;
    },
    {
      mlb: [],
      nba: [],
      nhl: [],
      soccer: [],
    }
  );
  const warnings = entries
    .map(([, result]) => result.warning)
    .filter((warning): warning is string => Boolean(warning));
  const allDates = new Set(
    Object.values(sports)
      .flat()
      .map((item) => item.date)
  );
  const totalRows = Object.values(sports)
    .flat()
    .reduce((total, item) => total + item.rows, 0);

  return NextResponse.json({
    ok: true,
    sports,
    summary: {
      totalDates: allDates.size,
      totalRows,
    },
    warnings,
  });
}
