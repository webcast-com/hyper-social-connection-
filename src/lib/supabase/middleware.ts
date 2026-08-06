import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Refreshes the Supabase auth session on every request (Next 16 proxy).
 *
 * When the session is close to expiring this exchanges the refresh token
 * and writes the new cookies into the response. When Supabase is not
 * configured the request passes through untouched, preserving the
 * offline/demo mode.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser().
  // getUser() validates the session and triggers a token refresh when
  // needed. Failures (unreachable project / invalid tokens) must never
  // break the request, so the whole thing is best-effort.
  try {
    await supabase.auth.getUser();
  } catch (error) {
    console.warn("[proxy] Supabase session refresh skipped:", (error as Error)?.message);
  }

  return response;
}
