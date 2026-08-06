import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/client';

/**
 * Starts a Supabase OAuth sign-in (Google / GitHub).
 *
 * Uses the @supabase/ssr browser client so the PKCE code verifier lands in a
 * cookie, which the server-side callback route (src/app/api/auth/callback)
 * can exchange. Only available when Supabase Auth is configured.
 */
export async function signInWithOAuth(provider: 'google' | 'github') {
  if (!isSupabaseConfigured || typeof window === 'undefined') {
    throw new Error(
      'Supabase Auth is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env.local to enable Google / GitHub sign-in.',
    );
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/api/auth/callback`,
    },
  });
  if (error) throw error;
  return data;
}
