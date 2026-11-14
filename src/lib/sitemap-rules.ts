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
import { SPORTS_DESK } from './sports-anchor';

/**
 * Reserved for documentation and testing by RFC 2606, and the domain both seeds in
 * this repository create their demo accounts under — with a password published in
 * the repo. Nobody's profile lives there.
 */
const DEMO_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];

/**
 * Addresses that belong to the app rather than to a person.
 *
 * The sports desk authors the anchor posts every highlight and leaders card hangs
 * off, and the schema marks it `accountType = 'broadcaster'` — but the committed
 * Prisma client predates that column and this repository does not regenerate it, so
 * the desk is recognised the way `discover/page.tsx` already recognises it: by the
 * one address it is created under, which `SPORTS_DESK` owns.
 */
const SYSTEM_EMAILS = [SPORTS_DESK.email];

/**
 * Whether an account is worth asking a crawler to visit.
 *
 * Two kinds are not. The sports desk is a system account, not a person: the site
 * already keeps it out of Discover, people suggestions and the homepage contacts
 * rail, and a sitemap is the same kind of list. And the seeded demo accounts are
 * five people who do not exist, whose avatars are generated and whose bios are the
 * same five lines in every installation of this app — submitting them asks a search
 * engine to index a site that looks like a template.
 *
 * **The rule excludes only on positive evidence.** An account with no address, or
 * one at a domain this rule does not recognise, is submitted: dropping a real
 * member's page from the sitemap is a worse mistake than listing one account that
 * should not have been there.
 */
export function isSubmittableProfile(user: { email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email) return true;
  if (SYSTEM_EMAILS.some((address) => address.toLowerCase() === email)) return false;
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return !DEMO_EMAIL_DOMAINS.includes(domain);
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
    // The dashboard's 96 hubs, teams and players are deliberately **not** listed.
    // They are one client-rendered document serving the vendor's bundled sample
    // dataset — the pages themselves say "Sample schedule" — so asking a crawler to
    // spend 96 of its visits on this site there left it little for pages that carry
    // something true. `dashboardSitemapRoutes()` stays for when they do.
    { url: at('/about'), changeFrequency: 'monthly', priority: 0.6 },
    { url: at('/privacy'), changeFrequency: 'monthly', priority: 0.4 },
  ];
}
