/**
 * The way from the header's profile menu to the Saved section of your profile.
 *
 * The link itself is plain: `/profile/{id}?tab=saved`, which the profile reads.
 * What a link cannot do on its own is put the section in front of the member —
 * on a phone the posts column sits below the About, Photos and Followers cards,
 * so arriving with Saved selected still shows none of it — or do anything at all
 * when the address already says `?tab=saved`.
 *
 * A `#profile-posts` fragment on the link looked like the answer and is not: the
 * router keeps the fragment in its record of the route and appends the link's
 * again on the next visit (`…#profile-posts#profile-posts`), and that second
 * visit does not scroll. So the menu says what was asked for instead, and the
 * section brings itself into view: at once if it is already on the page, or when
 * it next mounts if the member is on their way to it.
 *
 * A fragment written by hand still works on a fresh load, where the browser
 * handles it: `/profile/{id}?tab=saved#profile-posts`.
 */
import { profileHref } from './social-href';

export const SAVED_SECTION_ID = 'profile-posts';
export const SAVED_SECTION_EVENT = 'hyper:saved-section-requested';

/** Long enough for the profile to load; short enough that a visit much later is not scrolled. */
const REQUEST_LIFETIME_MS = 15_000;

let requestedAt: number | null = null;

/** The member's own page with the Saved tab selected; their name, when given, reads in front of the id. */
export const savedPostsHref = (userId: number | string, name?: string | null) => `${profileHref({ id: userId, name })}?tab=saved`;

/** The menu's Saved link was pressed. */
export function requestSavedSection(now = Date.now()) {
  requestedAt = now;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SAVED_SECTION_EVENT));
}

/** True once per request, and only while it is fresh. */
export function takeSavedSectionRequest(now = Date.now()) {
  const pending = requestedAt !== null && now - requestedAt <= REQUEST_LIFETIME_MS;
  requestedAt = null;
  return pending;
}
