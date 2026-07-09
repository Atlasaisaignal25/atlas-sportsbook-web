import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

const validProducts = new Set([
  "top_play",
  "top_signal_mlb",
  "top_signal_nba",
  "top_signal_nhl",
  "top_signal_soccer",
  "top_signal_nfl",
]);

const validSports = new Set(["MLB", "NBA", "NHL", "SOCCER", "NFL"]);
const productBySport: Record<string, string> = {
  MLB: "top_signal_mlb",
  NBA: "top_signal_nba",
  NHL: "top_signal_nhl",
  SOCCER: "top_signal_soccer",
  NFL: "top_signal_nfl",
};

function normalizeDate(value: unknown) {
  const date = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function getNewYorkDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    productCode?: string;
    productType?: "top_play" | "top_signal";
    sport?: string;
    date?: string;
  };

  const productType = String(body.productType ?? "").trim();
  const sport = String(body.sport ?? "").trim().toUpperCase();
  const date = normalizeDate(body.date) ?? getNewYorkDate();
  let productCode = String(body.productCode ?? "").trim();

  if (!productCode && productType === "top_play") {
    productCode = "top_play";
  }

  if (!productCode && productType === "top_signal" && validSports.has(sport)) {
    productCode = productBySport[sport];
  }

  if (!validProducts.has(productCode)) {
    return NextResponse.json(
      { ok: false, error: "Invalid product" },
      { status: 400 }
    );
  }

  if (productCode !== "top_play" && !validSports.has(sport)) {
    return NextResponse.json(
      { ok: false, error: "Invalid sport" },
      { status: 400 }
    );
  }

  if (!date) {
    return NextResponse.json(
      { ok: false, error: "Invalid date" },
      { status: 400 }
    );
  }

  const row = {
    user_id: user.id,
    product_code: productCode,
    sport: productCode === "top_play" ? null : sport,
    notify_date: date,
    status: "requested",
    updated_at: new Date().toISOString(),
  };

  const { error } = await getSupabaseAdmin()
    .from("precision_notifications")
    .upsert(row, {
      onConflict: "user_id,product_code,notify_date",
      ignoreDuplicates: false,
    });

  if (error) {
    return NextResponse.json({
      ok: true,
      prepared: true,
      persisted: false,
      reason: "precision_notifications_table_pending",
    });
  }

  return NextResponse.json({ ok: true, prepared: true, persisted: true });
}
