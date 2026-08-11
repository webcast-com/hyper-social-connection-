import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Arena live-preview host (and other e2b.app subdomains) to load
  // dev resources like fonts and HMR in development.
  allowedDevOrigins: ["*.e2b.app", "3000-i160o1qa97nd824tz8cst.e2b.app"],
};

export default nextConfig;
