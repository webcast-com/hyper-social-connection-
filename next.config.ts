import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Supabase's URL and anon key are public values. Mirror the server-side
  // names into NEXT_PUBLIC_* at build time so client features (OAuth and
  // Realtime) use the same project as the server when only SUPABASE_* is set.
  // Never mirror SUPABASE_SERVICE_ROLE_KEY here.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
  },

  // Allow the Arena live-preview host (and other e2b.app subdomains) to load
  // dev resources like fonts and HMR in development.
  allowedDevOrigins: ["*.e2b.app", "3000-i160o1qa97nd824tz8cst.e2b.app"],
};

export default nextConfig;
