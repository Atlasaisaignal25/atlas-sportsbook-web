import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
      storage: {
        getItem(key) {
          return cookieStore.get(key)?.value ?? null;
        },
        setItem(key, value) {
          cookieStore.set(key, value, {
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
          });
        },
        removeItem(key) {
          cookieStore.delete(key);
        },
      },
    },
  });
}
