/**
 * The sponsored banners: paid placements that link out to an advertiser.
 *
 * This list is the whole configuration. To change a banner, edit its entry; to
 * take the banners down, empty the list (`SponsorBanners` then renders nothing).
 * Each entry is the advertiser's own link and its own creative, served from the
 * advertiser's host: nothing here is uploaded to or stored by this site.
 *
 * The creatives are videos (`.mp4`), so they are drawn with a muted, looping
 * `<video>`, not the `<img>` of the advertiser's snippet: most browsers do not
 * play a video given to an image tag.
 */
export type SponsorBanner = {
  /** A stable name for keys, tests and analytics. */
  id: string;
  /** Where a click goes. Opened in a new tab. */
  href: string;
  /** The creative: an `https` video address. */
  video: string;
};

export const SPONSOR_BANNERS: readonly SponsorBanner[] = [
  {
    id: 'betting-a',
    href: 'https://r1wovcg.com/betting?open=register&p=xtz5',
    video: 'https://1w-aff.run/promo-files-uploads/0a45daadc7366df1f4c3e4fda01294aa1dafb663f1ecd7a36e.mp4',
  },
  {
    id: 'betting-b',
    href: 'https://r1wovcg.com/betting?open=register&p=xtz5',
    video: 'https://1w-aff.run/promo-files-uploads/2b95b9df4b0f8070e078b4faf542d1b69d258cb6cce655374e.mp4',
  },
];

/**
 * How search engines and the opened page are told what this link is: paid
 * (`sponsored`), not an endorsement to follow (`nofollow`), and with no handle
 * on the tab that opened it (`noopener`). The referrer is left in place, since
 * an advertiser may use it to credit the visit.
 */
export const SPONSOR_REL = 'sponsored nofollow noopener';

const https = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
};

/** The banners that can be shown: `https` on both addresses, each id once. */
export function usableSponsorBanners(banners: readonly SponsorBanner[] = SPONSOR_BANNERS): SponsorBanner[] {
  const seen = new Set<string>();
  const usable: SponsorBanner[] = [];
  for (const banner of banners) {
    const href = https(banner.href);
    const video = https(banner.video);
    if (!banner.id || !href || !video || seen.has(banner.id)) continue;
    seen.add(banner.id);
    usable.push({ id: banner.id, href, video });
  }
  return usable;
}

/**
 * One banner for a narrow slot (a sidebar), as a list of one. Slots are numbered
 * so that neighbouring ones show different banners; with fewer banners than
 * slots they come round again, and with none the slot is empty.
 */
export function sponsorBannerFor(slot: number, banners: readonly SponsorBanner[] = SPONSOR_BANNERS): SponsorBanner[] {
  const usable = usableSponsorBanners(banners);
  if (usable.length === 0 || !Number.isInteger(slot) || slot < 0) return [];
  return [usable[slot % usable.length]];
}

/** A creative at least this many times wider than tall is a strip (728×90, 1200×200). */
export const WIDE_BANNER_RATIO = 2;

/**
 * How a set of banners sits in a column, from the creatives' own proportions
 * (width ÷ height), which are known only once each video has loaded:
 *
 *   stack  one above another at full width: a lone banner, or any strip, which
 *          would be unreadably small at half width
 *   pair   side by side: squares, rectangles and portraits
 */
export function sponsorLayout(ratios: readonly number[]): 'stack' | 'pair' {
  const known = ratios.filter((ratio) => Number.isFinite(ratio) && ratio > 0);
  if (known.length < 2) return 'stack';
  return known.some((ratio) => ratio >= WIDE_BANNER_RATIO) ? 'stack' : 'pair';
}
