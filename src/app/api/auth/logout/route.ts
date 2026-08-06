import { NextResponse } from 'next/server';
import { logoutUser } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  // Sign out of Supabase Auth (clears the Supabase session cookies).
  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[logout] Supabase signOut failed:', (err as Error)?.message);
    }
  }

  // Also clear the legacy JWT cookie (offline/demo sessions).
  await logoutUser();
  return NextResponse.json({ success: true });
}
