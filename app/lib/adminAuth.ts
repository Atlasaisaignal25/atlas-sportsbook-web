import { createServerSupabaseClient } from "@/app/lib/supabase/server";

export async function getAdminSession() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user?.email?.trim().toLowerCase();
  const isAdmin = Boolean(adminEmail && userEmail && adminEmail === userEmail);

  return {
    user,
    isAdmin,
  };
}
