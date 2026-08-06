import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Creates a Supabase client for Server Components, Server Actions and
 * Route Handlers. Session cookies are read and written through Next.js
 * `cookies()` so a signed-in user stays signed in across requests.
 *
 * Always create a fresh client per request (never cache it).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `cookies()` can't be written to from a Server Component render.
          // The proxy (src/proxy.ts) refreshes the tokens in that case.
        }
      },
    },
  });
}
