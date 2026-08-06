import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Creates a browser-side Supabase client (safe to bundle into client
 * components). Uses @supabase/ssr so the session is stored in cookies —
 * this lets the proxy and route handlers (e.g. the OAuth callback) read
 * and refresh it.
 *
 * Call it from event handlers / effects (never at module scope, so the
 * module can also be imported during server-side rendering of client
 * components).
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
