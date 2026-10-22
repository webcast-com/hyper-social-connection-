import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

/**
 * robots.txt — served at /robots.txt. Points crawlers at the sitemap and
 * avoids crawling account/API pages. Page-level noindex controls search results;
 * robots.txt is not an authentication or privacy boundary.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/settings", "/messages", "/notifications"],
    },
    host: getSiteUrl(),
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
