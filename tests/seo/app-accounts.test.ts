/**
 * The one place that decides which accounts belong to the app rather than to a
 * person. Both the sitemap and the profile page ask it, so it is tested on its own:
 * a drift here would mean a page is submitted but not indexed, or the reverse.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPORTS_DESK } from '../../src/lib/sports-anchor';
import { APP_EMAILS, DEMO_EMAIL_DOMAINS, isAppAccount } from '../../src/lib/app-accounts';
import { isSubmittableProfile } from '../../src/lib/sitemap-rules';

test('the sports desk is the app, not a person', () => {
  assert.equal(isAppAccount({ email: SPORTS_DESK.email }), true);
  // Uppercase or padded, it is the same account.
  assert.equal(isAppAccount({ email: `  ${SPORTS_DESK.email.toUpperCase()} ` }), true);
  assert.deepEqual(APP_EMAILS, [SPORTS_DESK.email], 'the desk address is the single source of truth');
});

test('the seeded demo accounts are the app too', () => {
  for (const email of ['alex@example.com', 'maya@example.com', 'jordan@EXAMPLE.COM', 'someone@example.org', 'someone@example.net']) {
    assert.equal(isAppAccount({ email }), true, email);
  }
  assert.deepEqual(DEMO_EMAIL_DOMAINS, ['example.com', 'example.org', 'example.net'], 'RFC 2606 reserved domains only');
  // A lookalike is not a reserved domain.
  assert.equal(isAppAccount({ email: 'someone@notexample.com' }), false);
  assert.equal(isAppAccount({ email: 'someone@example.com.evil.test' }), false);
});

test('a member is a person, and so is an account this rule cannot judge', () => {
  assert.equal(isAppAccount({ email: 'wanjiru@gmail.com' }), false);
  assert.equal(isAppAccount({ email: 'desk@hyper.co.ke' }), false, 'only the desk address itself is the app');
  // Exclusion needs positive evidence: hiding a real member from search is a worse
  // mistake than leaving one account that should have been hidden.
  assert.equal(isAppAccount({ email: null }), false);
  assert.equal(isAppAccount({ email: '' }), false);
  assert.equal(isAppAccount({}), false);
  assert.equal(isAppAccount(null), false);
  assert.equal(isAppAccount(undefined), false);
});

test('the two decisions agree, and differ only where they should', () => {
  for (const email of [SPORTS_DESK.email, 'alex@example.com', 'wanjiru@gmail.com', null, '']) {
    const user = { email };
    // A profile is submitted exactly when it belongs to a person.
    assert.equal(isSubmittableProfile(user), !isAppAccount(user), String(email));
  }
  // ...except that there has to be an account to submit at all: no row, no URL.
  assert.equal(isSubmittableProfile(null), false);
  assert.equal(isAppAccount(null), false, 'and no row is still not an accusation');
});
