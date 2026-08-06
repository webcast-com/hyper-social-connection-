import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://pjzhjzqzmajbastavmkd.supabase.co";
// Placeholder so the app can boot before SUPABASE_ANON_KEY is set in .env.local.
// Replace it with your real anon key (Supabase → Project Settings → API).
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "key";

// Client-safe Supabase client (no `pg`/drizzle imports so it can be bundled
// into browser components). Server code can import the same client from '@/db'.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
