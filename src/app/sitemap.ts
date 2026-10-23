import type { MetadataRoute } from "next";
import { prisma, hasDatabase } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Sitemap generator — served at /sitemap.xml.
 *
 * Static routes are always included. When a database is configured, recent
 * post permalinks plus profile and group pages are added too. Regenerated on
 * every request so new users, groups and posts show up immediately.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/discover`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/groups`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sports`,
      changeFrequency: "hourly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sports/predictions`,
      changeFrequency: "hourly",
      priority: 0.6,
    },
    ...['/sports/nba', '/sports/nfl'].map((path) => ({ url: `${baseUrl}${path}`, changeFrequency: 'hourly' as const, priority: 0.7 })),
    ...['/about', '/privacy', '/login', '/signup', '/search'].map((path) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: 'monthly' as const,
      priority: path === '/about' ? 0.6 : 0.4,
    })),
  ];

  let profileRows: { id: number; createdAt: Date }[] = [];
  let groupRows: { id: number; createdAt: Date }[] = [];
  let postRows: { id: number; createdAt: Date }[] = [];
  if (hasDatabase) {
    try {
      profileRows = await prisma.user.findMany({
        where: { profileVisibility: "public" },
        take: 1000,
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });
      groupRows = await prisma.group.findMany({
        where: { privacy: "public" },
        take: 1000,
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });
      // Recent public posts get permalinks in the sitemap (capped).
      postRows = await prisma.post.findMany({
        where: {
          privacy: "public", user: { profileVisibility: "public" },
          AND: [
            { OR: [{ groupId: null }, { group: { privacy: "public" } }] },
            { OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
        take: 200,
      });
    } catch (err) {
      profileRows = []; groupRows = []; postRows = [];
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

  const postRoutes: MetadataRoute.Sitemap = postRows.map((p) => ({
    url: `${baseUrl}/post/${p.id}`,
    lastModified: p.createdAt,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  return [...staticRoutes, ...profileRoutes, ...groupRoutes, ...postRoutes];
}
