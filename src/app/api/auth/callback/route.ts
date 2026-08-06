import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth (Google / GitHub) callback for the PKCE flow.
 *
 * The browser client stores the code verifier in a cookie, so the exchange
 * works with the cookie-aware server client on this route. On failure the
 * user is bounced back to /login with an error flag.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.warn('[auth/callback] OAuth exchange failed:', error.message);
  } else {
    console.warn('[auth/callback] Missing code in OAuth callback');
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
