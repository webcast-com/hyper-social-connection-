import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://pjzhjzqzmajbastavmkd.supabase.co";
// Public anon key for the pjzhjzqzmajbastavmkd project. It is safe to ship
// in the client bundle by design; override via SUPABASE_ANON_KEY in .env.local.
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqemhqenF6bWFqYmFzdGF2bWtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTc0OTEsImV4cCI6MjEwMDU3MzQ5MX0.iTGgXDcJZqlNRCv5hh9lyFWs5Q5SHZRg-v78ttI7frQ";

// Client-safe Supabase client (no `pg`/drizzle imports so it can be bundled
// into browser components). Server code can import the same client from '@/db'.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
