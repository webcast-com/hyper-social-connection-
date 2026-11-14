const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

/**
 * The member a `/profile/{id}` route names, or null when it names nobody.
 *
 * `parseInt(id) || 1` quietly turned `/profile/abc` into member 1, and
 * `/profile/12abc` into member 12 — a page whose URL names nobody rendering
 * somebody, at HTTP 200, while the page's own metadata parsed strictly and said
 * "Profile on Hyper" and noindexed it. The URL and the page disagreed about which
 * member was being shown.
 *
 * So there is one rule, and both the metadata and the page ask it: an id is a
 * positive integer written in full, or it is not an id. A truncated or padded one is
 * not guessed at, because a guess renders a real person under an address that does
 * not belong to them; and an id too large to be one of this database's own is
 * refused rather than wrapped.
 *
 * Null is not "no such member" — that is the database's answer. Null here is "this
 * is not a member id at all", which needs no database to know.
 */
export function profileIdFromRouteParam(id: string | null | undefined): number | null {
  if (typeof id !== 'string') return null;
  if (!/^[1-9][0-9]*$/.test(id)) return null;
  const value = Number(id);
  return Number.isSafeInteger(value) ? value : null;
}

export function sanitizeUsername(raw: string | null | undefined) {
  const value = (raw || '').trim().replace(/^@/, '');
  if (!value) return null;
  if (!USERNAME_RE.test(value)) {
    throw new Error('Username must be 3–24 letters, numbers, or underscores.');
  }
  return value.toLowerCase();
}

export function sanitizeWebsite(raw: string | null | undefined) {
  const value = (raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Website must be an http(s) URL.');
    }
    return url.toString();
  } catch {
    throw new Error('Please enter a valid website URL.');
  }
}

export function trimField(raw: string | null | undefined, max = 120) {
  const value = (raw || '').trim();
  if (!value) return null;
  return value.slice(0, max);
}

export const PROFILE_VISIBILITY = ['public', 'followers', 'private'] as const;
export const MESSAGE_PRIVACY = ['everyone', 'followers', 'nobody'] as const;
export const FOLLOW_PRIVACY = ['everyone', 'approval'] as const;
export const GROUP_PRIVACY = ['public', 'private'] as const;
export const GROUP_ROLES = ['admin', 'moderator', 'member'] as const;
export const GROUP_CATEGORIES = [
  'Travel',
  'Art',
  'Fitness',
  'Tech',
  'Music',
  'Education',
  'Food',
  'Gaming',
  'News',
  'Other',
] as const;

export function canViewProfileDetails(opts: {
  isSelf: boolean;
  isFollower: boolean;
  visibility?: string | null;
}) {
  if (opts.isSelf) return true;
  const vis = opts.visibility || 'public';
  if (vis === 'private') return false;
  if (vis === 'followers') return opts.isFollower;
  return true;
}

export type SharedProfileCardData = {
  id: number;
  name: string;
  username: string | null;
  avatar: string | null;
  bio: string | null;
  location: string | null;
};

/**
 * Trims a full user row down to what a shared-profile card may show.
 *
 * A profile card attached to a public post is visible to *every* feed viewer,
 * so it must not carry more than the profile page would show that viewer:
 * name, username and avatar are always fine, but bio/location only when the
 * viewer can view the profile's details (public, or a follower of a
 * followers-only profile, or the profile's own owner). This stops a
 * followers-only or private profile from leaking details through a shared
 * post, and also keeps the full user row (email, password, …) out of the
 * client payload.
 */
export function sharedProfileCardData(
  user: {
    id: number;
    name: string;
    username?: string | null;
    avatar?: string | null;
    bio?: string | null;
    location?: string | null;
    profileVisibility?: string | null;
  } | null | undefined,
  opts: { viewerId: number | null; isFollower: boolean },
): SharedProfileCardData | null {
  if (!user) return null;
  const canViewDetails = canViewProfileDetails({
    isSelf: opts.viewerId === user.id,
    isFollower: opts.isFollower,
    visibility: user.profileVisibility,
  });
  return {
    id: user.id,
    name: user.name,
    username: user.username ?? null,
    avatar: user.avatar ?? null,
    bio: canViewDetails ? user.bio ?? null : null,
    location: canViewDetails ? user.location ?? null : null,
  };
}

export function canMessageUser(opts: {
  isSelf: boolean;
  isFollower: boolean;
  followsYou: boolean;
  privacy?: string | null;
}) {
  if (opts.isSelf) return false;
  const privacy = opts.privacy || 'everyone';
  if (privacy === 'nobody') return false;
  if (privacy === 'followers') return opts.isFollower || opts.followsYou;
  return true;
}
