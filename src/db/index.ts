import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://xyz.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
