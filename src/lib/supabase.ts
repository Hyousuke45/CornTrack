import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * CornTrack Supabase client.
 *
 * Create a file named `.env` in the project root (see `.env.example`):
 *   VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-public-key
 *
 * Both values come from Supabase → Project Settings → API.
 * The anon key is safe to expose in the browser: every table is protected by
 * Row Level Security (see supabase/schema.sql).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("http") &&
    !supabaseUrl.includes("YOUR-PROJECT")
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Guard helper: throws a readable error if the client was never configured. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file."
    );
  }
  return supabase;
}

console.log("CornTrack Supabase Debug:", {
  configured: isSupabaseConfigured,
  urlExists: Boolean(supabaseUrl),
  keyExists: Boolean(supabaseAnonKey),
  url: supabaseUrl,
  keyPrefix: supabaseAnonKey?.slice(0, 12),
});