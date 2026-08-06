import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

// Public anon key for the project. It is safe to ship in the client bundle
// by design; override via SUPABASE_URL / SUPABASE_ANON_KEY in .env.local.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const supabaseConfig = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
};
