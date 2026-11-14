import type { MetadataRoute } from "next";
import { prisma, hasDatabase } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";
import { readRecentClipRefs, type ClipRef } from "@/lib/highlights-index";
import { clipHref } from "@/lib/highlight-clip";

/**
 * How many stored highlight clips get a URL of their own here.
 *
 * A sitemap may hold fifty thousand, so this is not a limit on what the site is
 * willing to publish; it bounds one query and keeps the newest clips — the ones a
 * reader would search for — at the front of the list.
 */
const SITEMAP_CLIPS = 1000;

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
    {
      url: `${baseUrl}/sports/highlights`,
      changeFrequency: "hourly",
      priority: 0.8,
    },
    // The dashboard's 96 hubs, teams and players are deliberately **not** listed.
    // They are one client-rendered document serving the vendor's bundled sample
    // dataset — the pages themselves say "Sample schedule" — so asking a crawler to
    // spend 96 of its visits on this site there left it little for pages that carry
    // something true. `dashboardSitemapRoutes()` stays for when they do.
    ...['/about', '/privacy', '/login', '/signup', '/search'].map((path) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: 'monthly' as const,
      priority: path === '/about' ? 0.6 : 0.4,
    })),
  ];

  let profileRows: { id: number; createdAt: Date }[] = [];
  let groupRows: { id: number; createdAt: Date }[] = [];
  let postRows: { id: number; createdAt: Date }[] = [];
  let clipRefs: ClipRef[] = [];
  if (hasDatabase) {
    try {
      // Stored highlight clips: each one is a page of its own now, so each one is
      // a URL. This is the freshest unique content the site has.
      clipRefs = (await readRecentClipRefs(SITEMAP_CLIPS)).refs;
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
      profileRows = []; groupRows = []; postRows = []; clipRefs = [];
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

  // Newest clip first, and no `lastModified` for one whose time was never
  // reported: a date this site made up would be a lie in a file crawlers trust.
  const clipRoutes: MetadataRoute.Sitemap = clipRefs.map((ref) => ({
    url: `${baseUrl}${clipHref({ id: ref.id })}`,
    ...(ref.at ? { lastModified: ref.at } : {}),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...clipRoutes, ...profileRoutes, ...groupRoutes, ...postRoutes];
}
