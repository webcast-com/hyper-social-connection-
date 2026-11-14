/**
 * Which accounts belong to the app rather than to a person.
 *
 * Two kinds. The sports desk authors the anchor posts that every highlight and
 * leaders card hangs off — it is a real, followable author, but it is not somebody
 * to suggest, list as a contact or put in front of a search engine as a member of
 * the community. And the seeded demo accounts are five people who do not exist:
 * generated avatars, and the same five bios in every installation of this app.
 *
 * Both decisions that depend on this — which profile URLs a sitemap submits, and
 * which profile pages ask to be indexed — live in different files, so the detection
 * lives here where neither can drift from the other.
 *
 * **The rule excludes only on positive evidence.** An account with no address, or
 * one at a domain this rule does not recognise, is a person as far as it is
 * concerned: hiding a real member from search is a worse mistake than leaving one
 * account that should have been hidden.
 */
import { SPORTS_DESK } from './sports-anchor';

/**
 * Reserved for documentation and testing by RFC 2606, and the domain both seeds in
 * this repository create their demo accounts under — with a password published in
 * the repo. Nobody's profile lives there.
 */
export const DEMO_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net'];

/**
 * Addresses that belong to the app.
 *
 * The schema marks the desk `accountType = 'broadcaster'`, but the committed Prisma
 * client predates that column and this repository does not regenerate it, so the
 * desk is recognised the way `discover/page.tsx` already recognises it: by the one
 * address it is created under, which `SPORTS_DESK` owns.
 */
export const APP_EMAILS = [SPORTS_DESK.email];

/** Whether an account is the app's own rather than a person's. */
export function isAppAccount(user: { email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  // No address to judge by, so no judgement: see the rule above.
  if (!email) return false;
  if (APP_EMAILS.some((address) => address.toLowerCase() === email)) return true;
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return DEMO_EMAIL_DOMAINS.includes(domain);
}
