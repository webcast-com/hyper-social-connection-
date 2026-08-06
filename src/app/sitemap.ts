import type { MetadataRoute } from "next";
import { db, hasDatabase } from "@/db";
import { users, groups } from "@/db/schema";
import { desc } from "drizzle-orm";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Sitemap generator — served at /sitemap.xml.
 *
 * Static routes are always included. When a database is configured, profile
 * and group pages are added too. Regenerated on every request so new users
 * and groups show up immediately.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/discover`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/groups`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  let profileRows: { id: number; createdAt: Date }[] = [];
  let groupRows: { id: number; createdAt: Date }[] = [];
  if (hasDatabase) {
    try {
      profileRows = await db.select().from(users).orderBy(desc(users.createdAt));
      groupRows = await db.select().from(groups).orderBy(desc(groups.createdAt));
    } catch (err) {
      // DB unreachable — fall back to the static routes only.
      console.warn("[sitemap] DB query failed:", (err as Error)?.message);
    }
  }

  const profileRoutes: MetadataRoute.Sitemap = profileRows.map((u) => ({
    url: `${baseUrl}/profile/${u.id}`,
    lastModified: u.createdAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const groupRoutes: MetadataRoute.Sitemap = groupRows.map((g) => ({
    url: `${baseUrl}/groups/${g.id}`,
    lastModified: g.createdAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...profileRoutes, ...groupRoutes];
}
