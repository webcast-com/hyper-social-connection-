import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the Base44 live-preview host to load dev resources like fonts and
  // HMR in development. BASE44_PUBLIC_HOST_SUFFIX is injected by the platform.
  allowedDevOrigins: [
    ...(process.env.BASE44_PUBLIC_HOST_SUFFIX
      ? [`3000-${process.env.BASE44_PUBLIC_HOST_SUFFIX}`]
      : []),
  ],
  experimental: {
    // Match the 250 MB video cap in /api/upload so large clips are not
    // rejected by the Next.js / proxy body limit (default 10 MB).
    proxyClientMaxBodySize: "250mb",
    serverActions: {
      bodySizeLimit: "250mb",
    },
  },
  // Files present in public/uploads are served statically first. Missing
  // names (Prisma bucket / S3 objects) fall through to /api/media, which
  // 302s to a short-lived presigned GET. Stored URLs stay `/uploads/…`.
  async rewrites() {
    return [{ source: "/uploads/:filename", destination: "/api/media/:filename" }];
  },
};

export default nextConfig;
