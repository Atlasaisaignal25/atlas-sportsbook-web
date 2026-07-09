import { createServerSupabaseClient } from "@/app/lib/supabase/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { normalizePrecisionDate, todayET } from "./persistence";
import type { PrecisionLifecycleStatus, PrecisionNoPlayReason } from "./types";

type PrecisionProductType = "top_signal" | "top_play";
type PublicPrecisionSport = "mlb" | "nba" | "nhl" | "soccer" | "nfl" | "global";

type PrecisionSnapshotRow = {
  date: string;
  sport: string;
  product_type: PrecisionProductType;
  game_id: string | null;
  source_signal_id: string | null;
  matchup: string | null;
  start_time: string | null;
  release_at: string | null;
  locked_at: string | null;
  lifecycle_status: PrecisionLifecycleStatus;
  pick_label: string | null;
  market: string | null;
  selection: string | null;
  line: number | null;
  odds: number | null;
  progress_percent: number | null;
  can_purchase: boolean | null;
  can_reveal_pick: boolean | null;
  no_play_reason: PrecisionNoPlayReason | null;
};

type PrecisionAccessContext = {
  userId: string | null;
  admin: boolean;
  purchased: boolean;
};

type PrecisionPublicResponseParams = {
  productType: PrecisionProductType;
  sport: PublicPrecisionSport;
  date: string;
  snapshot: PrecisionSnapshotRow | null;
  access: PrecisionAccessContext;
};

const validTopSignalSports = ["mlb", "nba", "nhl", "soccer", "nfl"] as const;
const publicSignalTables: Record<Exclude<PublicPrecisionSport, "global">, string | null> = {
  mlb: "mlb_public_signals",
  nba: "nba_public_signals",
  nhl: "nhl_public_signals",
  soccer: "soccer_public_signals",
  nfl: null,
};

function minutesBetween(target: string | null, now: Date) {
  if (!target) return null;
  const targetTime = new Date(target).getTime();
  if (!Number.isFinite(targetTime)) return null;

  return Math.ceil((targetTime - now.getTime()) / 60000);
}

function formatCountdown(minutes: number | null) {
  if (minutes === null) return null;
  if (minutes <= 0) return "Available now";

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours <= 0) return `Available in ${remainingMinutes}m`;

  return `Available in ${String(hours).padStart(2, "0")}h ${String(
    remainingMinutes
  ).padStart(2, "0")}m`;
}

function titleFor(productType: PrecisionProductType, sport: PublicPrecisionSport) {
  if (productType === "top_play") return "Top Play";
  return `${sport.toUpperCase()} Top Signal`;
}

function productCodeFor(productType: PrecisionProductType, sport: PublicPrecisionSport) {
  if (productType === "top_play") return "top_play";
  return `top_signal_${sport}`;
}

function getEffectiveStatus(
  snapshot: PrecisionSnapshotRow,
  now: Date
): PrecisionLifecycleStatus {
  if (snapshot.lifecycle_status === "no_play") return "no_play";

  const lockedAt = snapshot.locked_at ? new Date(snapshot.locked_at).getTime() : null;
  const releaseAt = snapshot.release_at ? new Date(snapshot.release_at).getTime() : null;
  const nowTime = now.getTime();

  if (lockedAt && Number.isFinite(lockedAt) && nowTime >= lockedAt) return "locked";
  if (releaseAt && Number.isFinite(releaseAt) && nowTime >= releaseAt) {
    return "available_now";
  }

  return snapshot.lifecycle_status;
}

function previewMessage(params: {
  productType: PrecisionProductType;
  status: PrecisionLifecycleStatus;
  minutesToRelease: number | null;
  noPlayReason: PrecisionNoPlayReason | null;
}) {
  if (params.status === "no_play") {
    return params.productType === "top_play" ? "No Top Play Today" : "No Top Signal Today";
  }

  if (params.status === "available_now") return "Available now";
  if (params.status === "locked") return "Market locked";

  return formatCountdown(params.minutesToRelease) ?? "Atlas is scanning the market";
}

function previewSubtitle(status: PrecisionLifecycleStatus) {
  if (status === "scanning") return "Atlas is scanning the market";
  if (status === "validating") return "Atlas is validating market signals";
  if (status === "strong_candidate") return "Strong candidate identified";
  if (status === "final_review") return "Final review in progress";
  if (status === "available_now") return "Ready to unlock";
  if (status === "locked") return "This selection is locked";
  return "No qualified play today";
}

function buildLockedPick(snapshot: PrecisionSnapshotRow | null) {
  if (!snapshot?.pick_label) return null;

  return {
    gameId: snapshot.game_id,
    matchup: snapshot.matchup,
    startTime: snapshot.start_time,
    pickLabel: snapshot.pick_label,
    market: snapshot.market,
    selection: snapshot.selection,
    line: snapshot.line,
    odds: snapshot.odds,
  };
}

export function normalizePrecisionSport(value: string | null | undefined) {
  const sport = String(value ?? "").trim().toLowerCase();
  return validTopSignalSports.includes(sport as (typeof validTopSignalSports)[number])
    ? (sport as Exclude<PublicPrecisionSport, "global">)
    : null;
}

export async function getPrecisionSnapshot(params: {
  productType: PrecisionProductType;
  sport: PublicPrecisionSport;
  date: string;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("precision_snapshots")
    .select(
      "date,sport,product_type,game_id,source_signal_id,start_time,release_at,locked_at,lifecycle_status,pick_label,market,selection,line,odds,progress_percent,can_purchase,can_reveal_pick,no_play_reason"
    )
    .eq("date", params.date)
    .eq("sport", params.sport)
    .eq("product_type", params.productType)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const snapshot = data as Omit<PrecisionSnapshotRow, "matchup">;
  const matchup = await getSnapshotMatchup({
    date: params.date,
    sport: params.sport,
    gameId: snapshot.game_id,
    sourceSignalId: snapshot.source_signal_id,
  });

  return {
    ...snapshot,
    matchup,
  } as PrecisionSnapshotRow;
}

async function getSnapshotMatchup(params: {
  date: string;
  sport: PublicPrecisionSport;
  gameId: string | null;
  sourceSignalId: string | null;
}) {
  const tableEntries =
    params.sport === "global"
      ? Object.entries(publicSignalTables)
      : ([[params.sport, publicSignalTables[params.sport]]] as Array<
          [Exclude<PublicPrecisionSport, "global">, string | null]
        >);

  for (const [, table] of tableEntries) {
    if (!table) continue;

    const matchup = await findMatchupInTable({
      table,
      date: params.date,
      gameId: params.gameId,
      sourceSignalId: params.sourceSignalId,
    });

    if (matchup) return matchup;
  }

  return null;
}

async function findMatchupInTable(params: {
  table: string;
  date: string;
  gameId: string | null;
  sourceSignalId: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const select = "id,game_id,away_team,home_team";

  if (params.sourceSignalId) {
    const { data } = await supabase
      .from(params.table)
      .select(select)
      .eq("id", params.sourceSignalId)
      .maybeSingle();

    const matchup = formatMatchup(data);
    if (matchup) return matchup;
  }

  if (params.gameId) {
    const { data } = await supabase
      .from(params.table)
      .select(select)
      .eq("date", params.date)
      .eq("game_id", params.gameId)
      .limit(1);

    const matchup = formatMatchup(data?.[0]);
    if (matchup) return matchup;
  }

  return null;
}

function formatMatchup(row: any) {
  const awayTeam = String(row?.away_team ?? "").trim();
  const homeTeam = String(row?.home_team ?? "").trim();

  if (!awayTeam || !homeTeam) return null;
  return `${awayTeam} vs ${homeTeam}`;
}

export async function getPrecisionUserContext(params: {
  productType: PrecisionProductType;
  sport: PublicPrecisionSport;
  date: string;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user?.email?.trim().toLowerCase();
  const admin = Boolean(adminEmail && userEmail && adminEmail === userEmail);

  if (!user) {
    return { userId: null, admin: false, purchased: false };
  }

  const purchased = await getPrecisionPurchaseAccess({
    userId: user.id,
    productType: params.productType,
    sport: params.sport,
    date: params.date,
  });

  return { userId: user.id, admin, purchased };
}

export async function getPrecisionPurchaseAccess(params: {
  userId: string;
  productType: PrecisionProductType;
  sport: PublicPrecisionSport;
  date: string;
}) {
  const productCode = productCodeFor(params.productType, params.sport);
  let query = getSupabaseAdmin()
    .from("product_purchases")
    .select("id")
    .eq("user_id", params.userId)
    .eq("product_code", productCode)
    .eq("access_date", params.date)
    .eq("status", "paid")
    .limit(1);

  if (params.productType === "top_signal") {
    query = query.eq("sport", params.sport.toUpperCase());
  }

  const { data, error } = await query;

  if (error) return false;
  return Boolean(data?.length);
}

export function canPurchasePrecisionProduct(params: {
  status: PrecisionLifecycleStatus;
  snapshot: PrecisionSnapshotRow | null;
}) {
  return Boolean(params.snapshot?.pick_label && params.status === "available_now");
}

export function canRevealPrecisionPick(params: {
  status: PrecisionLifecycleStatus;
  purchased: boolean;
  admin: boolean;
}) {
  if (params.admin) return true;
  if (!params.purchased) return false;

  return params.status === "available_now" || params.status === "locked";
}

export function buildPrecisionPublicResponse({
  productType,
  sport,
  date,
  snapshot,
  access,
}: PrecisionPublicResponseParams) {
  const now = new Date();
  const status = snapshot ? getEffectiveStatus(snapshot, now) : "scanning";
  const minutesToRelease = snapshot ? minutesBetween(snapshot.release_at, now) : null;
  const minutesToKickoff = snapshot ? minutesBetween(snapshot.locked_at, now) : null;
  const availableForPurchase = canPurchasePrecisionProduct({ status, snapshot });
  const canRevealPick = canRevealPrecisionPick({
    status,
    purchased: access.purchased,
    admin: access.admin,
  });
  const noPlayReason =
    status === "no_play" ? snapshot?.no_play_reason ?? "below_threshold" : null;

  return {
    ok: true,
    productType,
    sport,
    date,
    status,
    releaseAt: snapshot?.release_at ?? null,
    lockedAt: snapshot?.locked_at ?? null,
    progressPercent: snapshot?.progress_percent ?? 10,
    minutesToRelease,
    minutesToKickoff,
    canPurchase: availableForPurchase,
    canRevealPick,
    purchased: access.purchased,
    admin: access.admin,
    availableForPurchase,
    noPlayReason,
    preview: {
      title: titleFor(productType, sport),
      subtitle: previewSubtitle(status),
      message: previewMessage({
        productType,
        status,
        minutesToRelease,
        noPlayReason,
      }),
    },
    pick: canRevealPick ? buildLockedPick(snapshot) : null,
  };
}

export function getPrecisionRequestDate(request: Request) {
  const { searchParams } = new URL(request.url);
  return normalizePrecisionDate(searchParams.get("date") ?? todayET());
}
