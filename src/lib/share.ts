/**
 * Share targets and link builders for profile sharing.
 *
 * Internal channels ("feed", "group", "message", "copy_link") are handled by
 * server actions; external channels open the network's own share/compose URL
 * in a new tab. Networks without a public web share endpoint (YouTube, TikTok,
 * Instagram) can't be posted to from a browser — for those we copy the link and
 * deep-link into their composer, which is the best a web app can do.
 */

export const INTERNAL_SHARE_CHANNELS = ['feed', 'group', 'message', 'copy_link'] as const;

export const EXTERNAL_SHARE_CHANNELS = [
  'facebook',
  'whatsapp',
  'x',
  'telegram',
  'linkedin',
  'reddit',
  'youtube',
  'tiktok',
  'email',
  'native',
] as const;

export type InternalShareChannel = (typeof INTERNAL_SHARE_CHANNELS)[number];
export type ExternalShareChannel = (typeof EXTERNAL_SHARE_CHANNELS)[number];
export type ShareChannel = InternalShareChannel | ExternalShareChannel;

export const SHARE_CHANNELS: readonly ShareChannel[] = [
  ...INTERNAL_SHARE_CHANNELS,
  ...EXTERNAL_SHARE_CHANNELS,
];

export function isShareChannel(value: string): value is ShareChannel {
  return (SHARE_CHANNELS as readonly string[]).includes(value);
}

export type ExternalNetwork = {
  id: ExternalShareChannel;
  label: string;
  /** Tailwind classes for the icon tile. */
  tint: string;
  /**
   * Builds the network's share URL. When it returns null the network has no
   * web share endpoint — the UI copies the link and opens the composer.
   */
  buildUrl: (url: string, text: string) => string | null;
  /** Where to send the user when there is no share endpoint. */
  fallbackUrl?: string;
  hint?: string;
};

const enc = encodeURIComponent;

export const EXTERNAL_NETWORKS: ExternalNetwork[] = [
  {
    id: 'facebook',
    label: 'Facebook',
    tint: 'bg-[#1877F2]/10 text-[#1877F2]',
    buildUrl: (url, text) =>
      `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    tint: 'bg-[#25D366]/10 text-[#128C7E]',
    buildUrl: (url, text) => `https://wa.me/?text=${enc(`${text} ${url}`)}`,
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    tint: 'bg-gray-900/10 text-gray-900 dark:text-gray-100',
    buildUrl: (url, text) =>
      `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(text)}`,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    tint: 'bg-[#229ED9]/10 text-[#229ED9]',
    buildUrl: (url, text) => `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    tint: 'bg-[#0A66C2]/10 text-[#0A66C2]',
    buildUrl: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    tint: 'bg-[#FF4500]/10 text-[#FF4500]',
    buildUrl: (url, text) => `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}`,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    tint: 'bg-[#FF0000]/10 text-[#FF0000]',
    // YouTube has no web share endpoint: copy the link, open the upload page
    // so it can be pasted into a video description or community post.
    buildUrl: () => null,
    fallbackUrl: 'https://studio.youtube.com/',
    hint: 'Link copied — paste it into your description or community post.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    tint: 'bg-gray-900/10 text-gray-900 dark:text-gray-100',
    buildUrl: () => null,
    fallbackUrl: 'https://www.tiktok.com/upload',
    hint: 'Link copied — paste it into your caption or bio.',
  },
  {
    id: 'email',
    label: 'Email',
    tint: 'bg-amber-500/10 text-amber-600',
    buildUrl: (url, text) => `mailto:?subject=${enc(text)}&body=${enc(`${text}\n\n${url}`)}`,
  },
];

/** Absolute, shareable URL for a profile. */
export function buildProfileUrl(origin: string, profileId: number, username?: string | null) {
  const base = origin.replace(/\/+$/, '');
  return `${base}/profile/${profileId}${username ? `?u=${enc(username)}` : ''}`;
}

/** Absolute, shareable URL for a group (used by group invites). */
export function buildGroupUrl(origin: string, groupId: number) {
  return `${origin.replace(/\/+$/, '')}/groups/${groupId}`;
}

export function defaultShareText(name: string) {
  return `Check out ${name} on Hyper`;
}
