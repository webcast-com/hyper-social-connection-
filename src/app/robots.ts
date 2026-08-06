import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

/**
 * robots.txt — served at /robots.txt. Points crawlers at the sitemap and
 * keeps private/account pages out of search results.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/login", "/signup", "/settings", "/messages", "/notifications"],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
