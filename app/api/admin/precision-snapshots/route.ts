import { NextResponse } from "next/server";
import { getAdminSession } from "@/app/lib/adminAuth";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { normalizePrecisionDate } from "@/app/lib/precision-engine";

export const dynamic = "force-dynamic";

function snapshotTableError(error: { message?: string }) {
  return NextResponse.json(
    {
      success: false,
      error:
        error.message ??
        "Unable to read precision_snapshots. Run precision_engine_schema.sql first.",
      sqlFile: "precision_engine_schema.sql",
    },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  const { user, isAdmin } = await getAdminSession();

  if (!user || !isAdmin) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get("date");
  const date = requestedDate ? normalizePrecisionDate(requestedDate) : null;
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("precision_snapshots")
    .select("*")
    .order("product_type", { ascending: true })
    .order("sport", { ascending: true });

  if (date) {
    query = query.eq("date", date);
  }

  const { data, error } = await query;

  if (error) {
    return snapshotTableError(error);
  }

  return NextResponse.json({
    success: true,
    date,
    snapshots: data ?? [],
  });
}
