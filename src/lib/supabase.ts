import { createClient } from "@supabase/supabase-js";

/**
 * Read-only client for the browser.
 *
 * The anon key is public by design and every table's RLS policy grants SELECT
 * only, so the worst a player can do with it is read room state they are
 * already in. Scores are written by the route handlers.
 */
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public env vars are missing");
  return createClient(url, key, { auth: { persistSession: false } });
}
