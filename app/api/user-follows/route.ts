import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { createServerSupabaseClient } from "@/app/lib/supabase/server";

type FollowType = "sport" | "team";

function normalizeFollowType(value: unknown): FollowType | null {
  return value === "sport" || value === "team" ? value : null;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ success: false, follows: [] }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("user_follows")
    .select("id,follow_type,sport,team_key,team_name,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { success: false, error: "Unable to load follows" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, follows: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const followType = normalizeFollowType(body.followType);
  const sport = normalizeText(body.sport).toUpperCase();
  const teamKey = normalizeText(body.teamKey);
  const teamName = normalizeText(body.teamName);

  if (!followType || !sport) {
    return NextResponse.json(
      { success: false, error: "Invalid follow payload" },
      { status: 400 }
    );
  }

  if (followType === "team" && (!teamKey || !teamName)) {
    return NextResponse.json(
      { success: false, error: "Invalid team follow payload" },
      { status: 400 }
    );
  }

  const query = getSupabaseAdmin()
    .from("user_follows")
    .select("id")
    .eq("user_id", user.id)
    .eq("follow_type", followType)
    .eq("sport", sport);

  const existingQuery =
    followType === "team" ? query.eq("team_key", teamKey) : query.is("team_key", null);

  const { data: existing, error: existingError } = await existingQuery
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { success: false, error: "Unable to check follow" },
      { status: 500 }
    );
  }

  if (existing) {
    return NextResponse.json({ success: true, id: existing.id });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("user_follows")
    .insert({
      user_id: user.id,
      follow_type: followType,
      sport,
      team_key: followType === "team" ? teamKey : null,
      team_name: followType === "team" ? teamName : null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: "Unable to save follow" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, id: data.id });
}

export async function DELETE(req: Request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const followType = normalizeFollowType(body.followType);
  const sport = normalizeText(body.sport).toUpperCase();
  const teamKey = normalizeText(body.teamKey);

  if (!followType || (followType === "sport" && !sport)) {
    return NextResponse.json(
      { success: false, error: "Invalid follow payload" },
      { status: 400 }
    );
  }

  if (followType === "team" && !teamKey) {
    return NextResponse.json(
      { success: false, error: "Invalid team follow payload" },
      { status: 400 }
    );
  }

  const query = getSupabaseAdmin()
    .from("user_follows")
    .delete()
    .eq("user_id", user.id)
    .eq("follow_type", followType);

  const deleteQuery =
    followType === "team"
      ? query.eq("team_key", teamKey)
      : query.eq("sport", sport).is("team_key", null);

  const { error } = await deleteQuery;

  if (error) {
    return NextResponse.json(
      { success: false, error: "Unable to delete follow" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
