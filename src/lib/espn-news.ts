/**
 * ESPN league news, normalised into article cards.
 *
 * A league's news feed (`…/site/v2/sports/{sport}/{league}/news`) is the same
 * feed the video-news reader asks, read here for what it is: a list of articles
 * with a headline, a description, a picture and a page on espn.com. This reader
 * shares only the repository's generic helpers and neither reads nor writes the
 * video-news board.
 *
 * The rules:
 *
 *   1. **Nothing invented.** An article without a headline, or without a page
 *      on espn.com to open, is dropped. A missing description, picture or date
 *      stays null.
 *   2. **Only ESPN's own pages are linked.** `espn.com.evil.test` is not ESPN.
 *   3. **Bounded.** A few competitions per request, a few articles from each.
 */
import { safeProviderImage } from './espn-image';
import type { EspnEndpointDetails } from './espn-endpoints';
import { ESPN_LEAGUES, type EspnLeague } from './sports-catalog';

/** Raised for a bad `leagues` value, so the route can answer 400/404 instead of 500. */
export class NewsInputError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
    this.name = 'NewsInputError';
  }
}

export type SportsNewsArticle = {
  /** Stable across refreshes: the competition and ESPN's own article id. */
  id: string;
  headline: string;
  description: string | null;
  /** ISO time ESPN published it, or null when not reported. */
  published: string | null;
  image: string | null;
  /** The article's page on espn.com. */
  url: string;
  league: string;
  leagueName: string;
};

export type SportsNewsSource = EspnEndpointDetails & { league: string; ok: boolean; error?: string };

export type SportsNewsBoard = {
  /** `empty`: ESPN answered and listed nothing. `unavailable`: no competition answered. */
  status: 'ready' | 'empty' | 'unavailable';
  articles: SportsNewsArticle[];
  leagues: { slug: string; name: string }[];
  fetchedAt: string;
  sources: SportsNewsSource[];
};

/** Asked for when the caller names no competition. */
export const DEFAULT_NEWS_LEAGUES = ['epl', 'ucl', 'laliga'] as const;
export const MAX_NEWS_LEAGUES = 4;
export const NEWS_PER_LEAGUE = 8;
export const MAX_NEWS_ARTICLES = 12;

/** The competitions a `leagues` value names: catalog slugs, comma-separated, bounded. */
export function resolveNewsLeagues(raw: string | null | undefined): EspnLeague[] {
  const slugs = raw === null || raw === undefined || raw === '' ? [...DEFAULT_NEWS_LEAGUES] : raw.split(',');
  if (slugs.length > MAX_NEWS_LEAGUES) throw new NewsInputError(`At most ${MAX_NEWS_LEAGUES} competitions can be asked for at once`, 400);
  const leagues: EspnLeague[] = [];
  for (const slug of slugs) {
    if (!/^[a-z0-9-]{1,40}$/.test(slug)) throw new NewsInputError('Invalid competition', 400);
    const league = ESPN_LEAGUES.find((entry) => entry.slug === slug);
    if (!league) throw new NewsInputError('Unknown competition', 404);
    if (!leagues.includes(league)) leagues.push(league);
  }
  return leagues;
}

export const newsUrl = (league: Pick<EspnLeague, 'sport' | 'league'>): string =>
  `https://site.api.espn.com/apis/site/v2/sports/${league.sport}/${league.league}/news?limit=${NEWS_PER_LEAGUE}`;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max = 400): string | null => {
  const raw = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  return raw ? raw.slice(0, max) : null;
};

/** An article's page: https, on espn.com or a subdomain of it, no credentials. */
export function espnArticleUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.hostname === 'espn.com' || url.hostname.endsWith('.espn.com') ? url.href : null;
  } catch { return null; }
}

/** One competition's news response → the articles in it, in ESPN's order. */
export function parseNews(payload: unknown, league: Pick<EspnLeague, 'slug' | 'name'>, limit = NEWS_PER_LEAGUE): SportsNewsArticle[] {
  const articles: SportsNewsArticle[] = [];
  const seen = new Set<string>();
  for (const entry of list(record(payload)?.articles)) {
    if (articles.length >= limit) break;
    const article = record(entry);
    if (!article) continue;
    const links = record(article.links);
    const url = espnArticleUrl(record(links?.web)?.href) ?? espnArticleUrl(record(links?.mobile)?.href);
    const headline = text(article.headline, 200) ?? text(article.title, 200);
    if (!url || !headline) continue;
    // ESPN's own id when it gave one; otherwise the page is the identity.
    const rawId = text(article.id, 40) ?? text(article.dataSourceIdentifier, 40);
    const key = rawId && /^[A-Za-z0-9_-]{1,40}$/.test(rawId) ? rawId : url;
    if (seen.has(key) || seen.has(url)) continue;
    seen.add(key); seen.add(url);

    const description = text(article.description);
    const date = text(article.published, 40) ?? text(article.lastModified, 40);
    const time = date ? Date.parse(date) : NaN;
    const image = list(article.images).map((item) => safeProviderImage(record(item)?.url)).find((href): href is string => !!href) ?? null;
    articles.push({
      id: `espn-news-${league.slug}-${key === url ? articles.length : key}`,
      headline,
      // A description that only repeats the headline adds nothing to a card.
      description: description && description.toLowerCase() !== headline.toLowerCase() ? description : null,
      published: Number.isFinite(time) ? new Date(time).toISOString() : null,
      image,
      url,
      league: league.slug,
      leagueName: league.name,
    });
  }
  return articles;
}

/**
 * Several competitions' articles as one list: newest first, an article that two
 * competitions both carry kept once, and an undated one after the dated ones.
 */
export function combineNews(lists: SportsNewsArticle[][], limit = MAX_NEWS_ARTICLES): SportsNewsArticle[] {
  const seen = new Set<string>();
  const all: SportsNewsArticle[] = [];
  for (const articles of lists) for (const article of articles) {
    if (seen.has(article.url)) continue;
    seen.add(article.url);
    all.push(article);
  }
  const time = (article: SportsNewsArticle) => (article.published ? Date.parse(article.published) : -Infinity);
  // A stable sort: articles of equal age keep ESPN's order.
  return all.map((article, index) => ({ article, index }))
    .sort((a, b) => (time(b.article) - time(a.article)) || (a.index - b.index))
    .slice(0, limit).map((entry) => entry.article);
}
