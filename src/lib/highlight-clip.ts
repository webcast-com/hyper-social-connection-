/**
 * One highlight clip as a page of its own.
 *
 * The site stores every clip it has ever read, and until now all of them lived
 * behind one filterable list: unique, fresh, text-rich pages that a search engine
 * had no URL to crawl. This module is the half of that page which is a rule rather
 * than markup — the clip's URL, its player descriptor, its title and description,
 * and the structured data that makes it a video result — kept pure so every one of
 * those rules can be tested without a database or a render.
 *
 * The rule underneath all of them: nothing here invents a fact. A clip with no
 * thumbnail gets no `VideoObject` rather than one with a made-up image, and a clip
 * ESPN reported no description for gets a description assembled from the fixture
 * and competition it did report.
 */
import type { LinkMedia } from './link-media';
import type { SportsHighlightClip } from './espn-highlights';
import { highlightAnchorId } from './sports-anchor';

/** Where a clip's own page lives, under the list it came from. */
export const CLIP_PAGE_ROOT = '/sports/highlights';

/** The match state as a reader reads it, in one place for the card and the page. */
export const CLIP_STATUS_LABEL: Record<SportsHighlightClip['status'], string> = {
  live: 'Live',
  final: 'Full time',
  upcoming: 'Upcoming',
};

/**
 * The clip's own URL.
 *
 * Keyed by the same identity the clip's post anchor uses, so a card, its Like
 * button and its permalink cannot disagree about which clip they mean.
 */
export function clipHref(clip: Pick<SportsHighlightClip, 'id'>): string {
  return `${CLIP_PAGE_ROOT}/${highlightAnchorId(clip)}`;
}

/**
 * Where the fixture this clip belongs to lives on this site.
 *
 * Basketball and American football live in the dashboard the rest of the site
 * links to; every other competition has its board. Not the clip's own match page:
 * a stored event id is namespaced and may carry a competition suffix, so building
 * `/sports/matches/...` from it would be a guess, and a wrong link is worse than a
 * broader one. The match page finds its clips instead, which needs no guessing.
 */
export function clipFixtureHref(clip: SportsHighlightClip): string {
  if (clip.sport === 'basketball') return '/nfl-basketball/basketball';
  if (clip.sport === 'american-football') return '/nfl-basketball/nfl';
  return `/sports?league=${encodeURIComponent(clip.league)}`;
}

/** The clip as the play card's own media descriptor, or null with nothing to play. */
export function clipMedia(clip: SportsHighlightClip): LinkMedia | null {
  return clip.mp4
    ? {
        kind: 'video',
        src: clip.mp4,
        provider: 'ESPN',
        thumbnail: clip.thumbnail,
        aspect: 'video',
        originalUrl: clip.page ?? clip.mp4,
      }
    : null;
}

/**
 * A length as `VideoObject` wants it: 146 seconds is `PT2M26S`.
 *
 * Null rather than `PT0S` for a clip with no reported length or a length that is
 * not a positive whole number of seconds — a duration of zero is a claim about the
 * clip, and a wrong one is worse than an absent one.
 */
export function iso8601Duration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const total = Math.trunc(seconds);
  if (total <= 0) return null;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${rest || !hours && !minutes ? `${rest}S` : ''}`;
}

/** A length as a reader reads it: `2:26`, `0:17`, `1:02:05`. */
export function clockDuration(seconds: number | null | undefined): string | null {
  const iso = iso8601Duration(seconds);
  if (!iso || typeof seconds !== 'number') return null;
  const total = Math.trunc(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/**
 * The page's title.
 *
 * ESPN's own clip title first, because that is what a reader would search for, and
 * the fixture after it only when the title does not already name it — "Saka opens
 * the scoring" needs "Arsenal vs Chelsea" beside it, while a title that already
 * says "Arsenal vs Chelsea highlights" would only repeat itself.
 *
 * Naming is checked on each side's own last word as well as its full name, because
 * ESPN writes titles the way a commentator does — "Canucks hold off Rangers" — and
 * appending the whole fixture to that would push the clip's own words past the
 * length a search result shows.
 */
export function clipPageTitle(clip: SportsHighlightClip): string {
  const reported = clip.title?.trim();
  const fixture = clip.eventName?.trim();
  // A clip ESPN gave no title for is still a clip of a fixture, and the fixture is
  // a better heading than a placeholder — "Match highlight — X vs Y highlights"
  // would say "highlights" twice and name nothing.
  if (!reported) return fixture ? `${fixture} highlights` : 'Match highlight';
  const title = reported;
  if (!fixture) return title;
  const said = title.toLowerCase();
  const sides = fixture.toLowerCase().split(/\s+vs\.?\s+/i).map((side) => side.trim()).filter(Boolean);
  const named = said.includes(fixture.toLowerCase())
    || (sides.length > 0 && sides.every((side) => {
      const words = side.split(/\s+/).filter(Boolean);
      const last = words[words.length - 1] ?? '';
      return said.includes(side) || (last.length >= 3 && said.includes(last));
    }));
  return named ? title : `${title} — ${fixture} highlights`;
}

/**
 * The page's description.
 *
 * ESPN's own when it reported one that says something beyond the title. Otherwise
 * one assembled from the facts it did report — the fixture, the competition, the
 * state of the match and the length — which is a real description of this clip
 * rather than a sentence invented for it.
 */
export function clipPageDescription(clip: SportsHighlightClip): string {
  const description = clip.description?.trim() ?? '';
  if (description && description.toLowerCase() !== (clip.title ?? '').trim().toLowerCase()) return description;
  const length = clockDuration(clip.duration);
  const facts = [
    clip.eventName?.trim() || null,
    clip.leagueName?.trim() || null,
    CLIP_STATUS_LABEL[clip.status] ?? null,
    length ? `${length} clip` : null,
  ].filter((fact): fact is string => !!fact);
  return facts.length
    ? `${facts.join(' · ')} — highlight video stored on Hyper.`
    : 'Highlight video stored on Hyper.';
}

/**
 * This clip as a `VideoObject`.
 *
 * `null` unless every field Google requires is one ESPN actually reported: a name,
 * a description, a thumbnail and an upload date. A clip with no thumbnail is a real
 * clip and still gets a page, but it does not get structured data claiming an image
 * that does not exist — an invalid rich result is worse than no rich result.
 */
export function videoObjectFor(clip: SportsHighlightClip, origin: string): Record<string, unknown> | null {
  const name = clip.title?.trim();
  const thumbnailUrl = clip.thumbnail?.trim();
  const uploadDate = clip.startAt?.trim();
  if (!name || !thumbnailUrl || !uploadDate) return null;
  const object: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description: clipPageDescription(clip),
    thumbnailUrl,
    uploadDate,
    // This page, so the result a reader clicks is the one on this site.
    embedUrl: new URL(clipHref(clip), origin).toString(),
    publisher: { '@type': 'Organization', name: 'Hyper', url: `${origin}/` },
  };
  // The file itself, when ESPN reported one: this is what makes the clip playable
  // from a search result rather than only reachable.
  if (clip.mp4) object.contentUrl = clip.mp4;
  const duration = iso8601Duration(clip.duration);
  if (duration) object.duration = duration;
  return object;
}

/** The trail to this clip, as a `BreadcrumbList`. */
export function clipBreadcrumbFor(clip: SportsHighlightClip, origin: string): Record<string, unknown> {
  const at = (path: string) => new URL(path, origin).toString();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: at('/') },
      { '@type': 'ListItem', position: 2, name: 'Sports', item: at('/sports') },
      { '@type': 'ListItem', position: 3, name: 'Match highlights', item: at(CLIP_PAGE_ROOT) },
      // The last crumb is this page, and schema.org wants it without an item.
      { '@type': 'ListItem', position: 4, name: clipPageTitle(clip) },
    ],
  };
}
