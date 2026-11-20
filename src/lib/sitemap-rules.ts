/**
 * What this site asks crawlers to visit, and when it can honestly say a page
 * changed.
 *
 * A sitemap is a request, not an inventory. Everything in it costs crawl budget on
 * a domain this young, so a URL belongs here only when the page behind it carries
 * something a reader came for — and a `lastmod` belongs on it only when this site
 * can derive the date from its own data. A date invented to make a page look fresh
 * is a lie in the one file a crawler is told to trust, and crawlers stop believing
 * the rest of it.
 *
 * These rules are pure so they can be tested without a database: the sitemap route
 * only decides what to query, and asks here what to submit.
 */
import type { MetadataRoute } from 'next';
import { isAppAccount } from './app-accounts';
import { dashboardSitemapRoutes } from './dashboard-seo';

/**
 * Whether an account is worth asking a crawler to visit.
 *
 * The accounts that are not are the app's own — the sports desk and the five seeded
 * demo people — and `isAppAccount` in `src/lib/app-accounts.ts` is the single place
 * that decides which those are, because the profile page asks the same question when
 * it chooses whether to be indexed and the two must not disagree.
 *
 * There has to be an account to submit at all, so nothing to identify is nothing to
 * ask for; an account this rule cannot judge is submitted, because dropping a real
 * member's page from the sitemap is a worse mistake than listing one that should not
 * have been there.
 */
export function isSubmittableProfile(user: { email?: string | null } | null | undefined): boolean {
  return !!user && !isAppAccount(user);
}

/**
 * The newest thing each surface renders, so a page can be dated by its own content.
 *
 * Null means this site holds nothing to date the page by — and then the page is
 * submitted without a `lastmod` rather than with a made-up one.
 */
export type SitemapFreshness = {
  /** Newest public post: what the feed and Discover render. */
  newestPost: Date | null;
  /** Newest public group: what the groups index renders. */
  newestGroup: Date | null;
  /** Newest stored highlight clip: what the sports boards render. */
  newestClip: Date | null;
};

export const NO_FRESHNESS: SitemapFreshness = { newestPost: null, newestGroup: null, newestClip: null };

/**
 * The static routes, in the order they have always been submitted.
 *
 * Three pages that used to be here are not: `/login` and `/signup` are two forms
 * with no content, and they are the least worth a visit of anything on the site;
 * `/search` is a query surface, so submitting it invites a crawler into an
 * unbounded space of near-duplicate result pages it can never finish. They all
 * remain reachable and indexable — nothing here blocks them, it just stops asking
 * for them.
 *
 * `/about` and `/privacy` are submitted without a date: their copy changes when a
 * person edits it, which is not something this site can read from its own data, and
 * a constant that has to be remembered and bumped is a date that eventually lies.
 */
export function staticSitemapRoutes(
  baseUrl: string,
  freshness: SitemapFreshness = NO_FRESHNESS,
): MetadataRoute.Sitemap {
  const at = (path: string) => `${baseUrl}${path}`;
  const dated = (date: Date | null) => (date ? { lastModified: date } : {});
  return [
    // The feed renders the newest posts, so the homepage is as fresh as they are.
    { url: at('/'), ...dated(freshness.newestPost), changeFrequency: 'daily', priority: 1 },
    { url: at('/discover'), ...dated(freshness.newestPost), changeFrequency: 'weekly', priority: 0.8 },
    { url: at('/groups'), ...dated(freshness.newestGroup), changeFrequency: 'weekly', priority: 0.7 },
    { url: at('/sports'), ...dated(freshness.newestClip), changeFrequency: 'hourly', priority: 0.7 },
    // Odds for upcoming matches are read live and this site stores no timestamp for
    // them, so there is no date to report — only a promise that it changes hourly.
    { url: at('/sports/predictions'), changeFrequency: 'hourly', priority: 0.6 },
    { url: at('/sports/highlights'), ...dated(freshness.newestClip), changeFrequency: 'hourly', priority: 0.8 },
    // The live-stream screen server-renders the fixtures being streamed. They
    // are read live from the provider and nothing about them is stored here, so
    // as with the odds there is no date to report.
    { url: at('/sports/live'), changeFrequency: 'hourly', priority: 0.8 },
    // The Basketball & NFL dashboard's pages are submitted too, by
    // `dashboardSitemapEntries` below.
    { url: at('/about'), changeFrequency: 'monthly', priority: 0.6 },
    { url: at('/privacy'), changeFrequency: 'monthly', priority: 0.4 },
  ];
}

/**
 * The Basketball & NFL dashboard's pages: the two hubs, their upcoming, top
 * scorers and news sections, and every team page that loads from a live feed.
 *
 * These were left out while every dashboard address was one document with the
 * same body, and an unknown team answered 200. Each address now answers for
 * itself — its own title, headline, canonical and status — so the list here is
 * exactly the list of pages that are indexable and name themselves as canonical
 * (`dashboardSitemapRoutes`, which the page metadata is resolved from as well, so
 * the two cannot disagree). What that leaves out is left out on purpose: sample
 * fixtures, teams in a league with no feed, player pages with no profile to
 * load, the "coming soon" screens, and match pages, which come and go.
 *
 * No `lastmod`: the scores come from ESPN in the reader's browser, and this site
 * stores nothing that says when a team's page last changed.
 */
export function dashboardSitemapEntries(baseUrl: string): MetadataRoute.Sitemap {
  return dashboardSitemapRoutes().map((route) => ({
    url: `${baseUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
