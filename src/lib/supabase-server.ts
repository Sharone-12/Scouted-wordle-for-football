import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS, so it must never reach the browser —
 * `server-only` makes importing it from a client component a build error
 * rather than a leaked key.
 */
export function serviceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env vars are missing");
  return createClient(url, key, { auth: { persistSession: false } });
}
