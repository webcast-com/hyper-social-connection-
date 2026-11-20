/**
 * The sponsored banners: paid placements that link out to an advertiser.
 *
 * The two lists below are the whole configuration. To change a banner, edit its
 * entry; to take a set down, empty its list (`SponsorBanners` then renders
 * nothing there). Each entry is the advertiser's own link and its own creative,
 * served from the advertiser's host: nothing here is uploaded to or stored by
 * this site.
 *
 * A creative is a video or a still image, and an entry names one or the other.
 * A video (`.mp4`) is drawn with a muted, looping `<video>`, not the `<img>` of
 * the advertiser's snippet: most browsers do not play a video given to an image
 * tag. A still (`.jpg`, `.png`, `.webp`, `.gif`) is drawn with an `<img>`.
 */
export type SponsorBanner = {
  /** A stable name for keys, tests and analytics. */
  id: string;
  /** Where a click goes. Opened in a new tab. */
  href: string;
  /** The creative when it is a video: an `https` address. */
  video?: string;
  /** The creative when it is a still image: an `https` address. */
  image?: string;
};

/**
 * The first set: the homepage (centre column, both sidebars, and under the
 * scores on smaller screens) and the live-stream screen.
 */
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
 * The second set: the sports scores page, the highlights page and a post's own
 * page. Kept apart from the first so that adding a banner here changes nothing
 * about where the first set is shown, and the other way round.
 */
export const SPONSOR_INLINE_BANNERS: readonly SponsorBanner[] = [
  {
    id: 'betting-c',
    href: 'https://r1wovcg.com/betting?open=register&p=xtz5',
    image: 'https://1w-aff.run/promo-files-uploads/548b5809b2bf4b0ad3070d8f9ea4f3d4e8dc70e6f8d394d4ea.jpg',
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

/**
 * The banners that can be shown: `https` on the link and on the creative, one
 * creative (a video or an image, not both and not neither), each id once.
 */
export function usableSponsorBanners(banners: readonly SponsorBanner[] = SPONSOR_BANNERS): SponsorBanner[] {
  const seen = new Set<string>();
  const usable: SponsorBanner[] = [];
  for (const banner of banners) {
    const href = https(banner.href);
    // An entry that names both is a mistake in the list, and guessing which one
    // was meant would show an advertiser the wrong creative.
    if (!banner.id || !href || seen.has(banner.id) || (banner.video !== undefined) === (banner.image !== undefined)) continue;
    const video = banner.video !== undefined ? https(banner.video) : null;
    const image = banner.image !== undefined ? https(banner.image) : null;
    if (!video && !image) continue;
    seen.add(banner.id);
    usable.push(video ? { id: banner.id, href, video } : { id: banner.id, href, image: image! });
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
 * (width ÷ height), which are known only once each creative has loaded:
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
