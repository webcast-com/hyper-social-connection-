import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CLIP_LIST_LIMIT, GROUPS_CRUMB, HOME_CRUMB, SPORTS_CRUMB, breadcrumbStructuredData, clipListStructuredData,
  isPublicPost, jsonLdText, organizationStructuredData, profilePageStructuredData, publicUrl,
  socialPostStructuredData, type PostFacts, type ProfileFacts,
} from '../../src/lib/structured-data';
import { clipHref } from '../../src/lib/highlight-clip';
import JsonLd from '../../src/components/JsonLd';

/**
 * Structured data for the social pages and the listing pages.
 *
 * Each rule is about not telling a search engine more than the page shows a
 * signed-out visitor, and not describing something that is not there.
 */
const SITE = 'https://hyper.co.ke';
const NOW = new Date('2026-11-20T12:00:00.000Z');

const post = (over: Partial<PostFacts> = {}): PostFacts => ({
  id: 41,
  content: 'Match day at Kikuyu grounds.\n\nWhat a finish!',
  imageUrl: '/uploads/goal.jpg',
  createdAt: new Date('2026-11-10T15:00:00.000Z'),
  updatedAt: null,
  author: { id: 7, name: 'Wanjiru Kamau', avatar: 'https://cdn.example.org/w.png' },
  likes: 12,
  comments: 3,
  ...over,
});

const profile = (over: Partial<ProfileFacts> = {}): ProfileFacts => ({
  id: 7, name: 'Wanjiru Kamau', username: 'wanjiru', bio: 'Midfielder at Kikuyu United.', avatar: '/uploads/w.png',
  createdAt: '2026-03-04T08:00:00.000Z', followers: 120, following: 45, ...over,
});

/* ── Which posts are public ─────────────────────────────────────────────── */

test('a post is public only when it, its author and its group all are, and it is out', () => {
  const open = { privacy: 'public', user: { profileVisibility: 'public' }, group: null, scheduledAt: null };
  assert.equal(isPublicPost(open, NOW), true);
  assert.equal(isPublicPost({ ...open, group: { privacy: 'public' } }, NOW), true);
  assert.equal(isPublicPost({ ...open, scheduledAt: new Date('2026-11-20T11:59:00.000Z') }, NOW), true, 'already published');
  for (const [why, row] of [
    ['friends only', { ...open, privacy: 'friends' }],
    ['a private profile', { ...open, user: { profileVisibility: 'private' } }],
    ['an author that was not loaded', { ...open, user: null }],
    ['a private group', { ...open, group: { privacy: 'private' } }],
    ['a group whose privacy is unknown', { ...open, group: {} }],
    ['scheduled for later', { ...open, scheduledAt: '2026-11-20T12:00:01.000Z' }],
  ] as const) assert.equal(isPublicPost(row, NOW), false, why);
  assert.equal(isPublicPost(null, NOW), false);
  assert.equal(isPublicPost(undefined, NOW), false);
});

/* ── Posts ──────────────────────────────────────────────────────────────── */

test('a public post is a SocialMediaPosting with what the page prints', () => {
  assert.deepEqual(socialPostStructuredData(post({ updatedAt: '2026-11-11T09:30:00.000Z' }), SITE), {
    '@context': 'https://schema.org',
    '@type': 'SocialMediaPosting',
    url: 'https://hyper.co.ke/post/match-day-at-kikuyu-grounds-41',
    mainEntityOfPage: 'https://hyper.co.ke/post/match-day-at-kikuyu-grounds-41',
    headline: 'Match day at Kikuyu grounds. What a finish!',
    text: 'Match day at Kikuyu grounds. What a finish!',
    image: 'https://hyper.co.ke/uploads/goal.jpg',
    datePublished: '2026-11-10T15:00:00.000Z',
    dateModified: '2026-11-11T09:30:00.000Z',
    author: { '@type': 'Person', name: 'Wanjiru Kamau', url: 'https://hyper.co.ke/profile/wanjiru-kamau-7', image: 'https://cdn.example.org/w.png' },
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: 12 },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: 3 },
    ],
  });
});

test('a post without an author, a date or anything posted is not described', () => {
  assert.equal(socialPostStructuredData(post({ author: null }), SITE), null);
  assert.equal(socialPostStructuredData(post({ author: { id: 7, name: '  ' } }), SITE), null);
  assert.equal(socialPostStructuredData(post({ createdAt: null }), SITE), null);
  assert.equal(socialPostStructuredData(post({ createdAt: 'not a date' }), SITE), null);
  // A repost with nothing added: no words and no picture.
  assert.equal(socialPostStructuredData(post({ content: '', imageUrl: null }), SITE), null);
  // A picture alone is a post; so are words alone.
  const picture = socialPostStructuredData(post({ content: ' ' }), SITE)!;
  assert.equal('text' in picture || 'headline' in picture, false);
  assert.equal(picture.image, 'https://hyper.co.ke/uploads/goal.jpg');
  const words = socialPostStructuredData(post({ imageUrl: null }), SITE)!;
  assert.equal('image' in words, false);
});

test('a long post keeps its whole text and a headline that fits', () => {
  const long = 'word '.repeat(60).trim();
  const data = socialPostStructuredData(post({ content: long }), SITE)!;
  assert.equal(data.text, long);
  assert.equal((data.headline as string).length, 110);
  assert.ok((data.headline as string).endsWith('…'));
});

test('a count the page could not make is left out, and an unedited post claims no edit', () => {
  const data = socialPostStructuredData(post({ likes: null, comments: undefined }), SITE)!;
  assert.equal('interactionStatistic' in data, false);
  assert.equal('dateModified' in data, false);
  // Nothing liked is still a count: the page prints 0.
  const none = socialPostStructuredData(post({ likes: 0, comments: 0 }), SITE)!;
  assert.deepEqual((none.interactionStatistic as { userInteractionCount: number }[]).map((entry) => entry.userInteractionCount), [0, 0]);
  // An "updated" stamp that is not after publication is not an edit.
  assert.equal('dateModified' in socialPostStructuredData(post({ updatedAt: '2026-11-10T15:00:00.000Z' }), SITE)!, false);
  assert.equal('dateModified' in socialPostStructuredData(post({ updatedAt: 'garbage' }), SITE)!, false);
  // A negative or non-numeric count is not a count.
  assert.equal('interactionStatistic' in socialPostStructuredData(post({ likes: -1, comments: Number.NaN }), SITE)!, false);
});

test('only what the post page prints is in a post: no comment text, no email, no private field', () => {
  const noisy = { ...post(), email: 'w@example.org', password: 'hash', privacy: 'public', commentsList: ['secret'] } as PostFacts;
  const noisyAuthor = { id: 7, name: 'Wanjiru Kamau', avatar: null, email: 'w@example.org', password: 'hash', location: 'Kikuyu' };
  const all = JSON.stringify(socialPostStructuredData({ ...noisy, author: noisyAuthor }, SITE));
  for (const leak of ['example.org', 'hash', 'secret', 'Kikuyu"', 'comment"']) assert.ok(!all.includes(leak), `${leak} is not in the markup`);
});

/* ── Addresses ──────────────────────────────────────────────────────────── */

test('an address is absolute https without credentials, or it is left out', () => {
  assert.equal(publicUrl('/uploads/a.png', SITE), 'https://hyper.co.ke/uploads/a.png');
  assert.equal(publicUrl('uploads/a.png', 'https://hyper.co.ke/'), 'https://hyper.co.ke/uploads/a.png');
  assert.equal(publicUrl('https://cdn.example.org/a.png', SITE), 'https://cdn.example.org/a.png');
  for (const bad of ['http://cdn.example.org/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'https://user:pw@cdn.example.org/a.png', 'blob:https://hyper.co.ke/1', '', '   ', null, undefined]) {
    assert.equal(publicUrl(bad, SITE), null, String(bad));
  }
  // A picture that is not usable is dropped; the post is still described.
  const data = socialPostStructuredData(post({ imageUrl: 'data:image/png;base64,AAAA', author: { id: 7, name: 'W', avatar: 'javascript:alert(1)' } }), SITE)!;
  assert.equal('image' in data, false);
  assert.deepEqual(data.author, { '@type': 'Person', name: 'W', url: 'https://hyper.co.ke/profile/w-7' });
});

/* ── Profiles ───────────────────────────────────────────────────────────── */

test('a public profile is a ProfilePage about a Person, with what the header prints', () => {
  assert.deepEqual(profilePageStructuredData(profile(), SITE), {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: 'https://hyper.co.ke/profile/wanjiru-kamau-7',
    dateCreated: '2026-03-04T08:00:00.000Z',
    mainEntity: {
      '@type': 'Person',
      '@id': 'https://hyper.co.ke/profile/wanjiru-kamau-7#person',
      name: 'Wanjiru Kamau',
      alternateName: 'wanjiru',
      description: 'Midfielder at Kikuyu United.',
      image: 'https://hyper.co.ke/uploads/w.png',
      url: 'https://hyper.co.ke/profile/wanjiru-kamau-7',
      // Who follows them, then who they follow.
      interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: 120 },
      agentInteractionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: 45 },
    },
  });
});

test('a profile with only a name is still a profile; one without a name is not described', () => {
  assert.deepEqual(profilePageStructuredData({ id: 9, name: 'Otieno' }, SITE), {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: 'https://hyper.co.ke/profile/otieno-9',
    mainEntity: { '@type': 'Person', '@id': 'https://hyper.co.ke/profile/otieno-9#person', name: 'Otieno', url: 'https://hyper.co.ke/profile/otieno-9' },
  });
  assert.equal(profilePageStructuredData(profile({ name: '' }), SITE), null);
  assert.equal(profilePageStructuredData(profile({ name: null }), SITE), null);
});

test('a profile repeats the header and nothing else a member filled in', () => {
  const row = { ...profile(), email: 'w@example.org', password: 'hash', location: 'Kikuyu Town', work: 'Safaricom', education: 'UoN', website: 'https://w.example.net', pronouns: 'she/her', birthday: '1999-01-01' };
  const all = JSON.stringify(profilePageStructuredData(row, SITE));
  for (const leak of ['example.org', 'hash', 'Kikuyu Town', 'Safaricom', 'UoN', 'example.net', 'she/her', '1999']) assert.ok(!all.includes(leak), `${leak} is not in the markup`);
});

/* ── Breadcrumbs ────────────────────────────────────────────────────────── */

test('a trail starts at the homepage and its last crumb, the page itself, has no address', () => {
  assert.deepEqual(breadcrumbStructuredData([HOME_CRUMB, GROUPS_CRUMB, { name: 'Travel & Adventure', path: '/groups/3' }], SITE), {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://hyper.co.ke/' },
      { '@type': 'ListItem', position: 2, name: 'Groups', item: 'https://hyper.co.ke/groups' },
      { '@type': 'ListItem', position: 3, name: 'Travel & Adventure' },
    ],
  });
  const sports = breadcrumbStructuredData([HOME_CRUMB, SPORTS_CRUMB], 'https://hyper.co.ke/')!;
  assert.deepEqual(sports.itemListElement, [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://hyper.co.ke/' },
    { '@type': 'ListItem', position: 2, name: 'Sports' },
  ]);
});

test('a crumb with no name is dropped, and one crumb is not a trail', () => {
  const data = breadcrumbStructuredData([HOME_CRUMB, { name: '  ', path: '/groups/3' }, { name: 'Post', path: '/post/1' }], SITE)!;
  assert.deepEqual((data.itemListElement as { name: string; position: number }[]).map((item) => [item.position, item.name]), [[1, 'Home'], [2, 'Post']]);
  assert.equal(breadcrumbStructuredData([HOME_CRUMB], SITE), null);
  assert.equal(breadcrumbStructuredData([HOME_CRUMB, { name: '', path: '/x' }], SITE), null);
  assert.equal(breadcrumbStructuredData([], SITE), null);
});

/* ── Organisation ───────────────────────────────────────────────────────── */

test('the organisation is a name, an address and a logo, and nothing invented', () => {
  assert.deepEqual(organizationStructuredData('https://hyper.co.ke/'), {
    '@context': 'https://schema.org', '@type': 'Organization', name: 'Hyper', url: 'https://hyper.co.ke/', logo: 'https://hyper.co.ke/icon-512.png',
  });
});

test('the logo the organisation names is a file this site serves', async () => {
  const { existsSync } = await import('node:fs');
  assert.ok(existsSync(new URL('../../public/icon-512.png', import.meta.url)));
});

/* ── Highlights list ────────────────────────────────────────────────────── */

test('the highlights page lists its clip pages by position and address only', () => {
  const clips = [{ id: '50476535' }, { id: '50476536' }];
  assert.deepEqual(clipListStructuredData(clips, SITE), {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Match highlights',
    url: 'https://hyper.co.ke/sports/highlights',
    numberOfItems: 2,
    itemListElement: [
      { '@type': 'ListItem', position: 1, url: `https://hyper.co.ke${clipHref(clips[0])}` },
      { '@type': 'ListItem', position: 2, url: `https://hyper.co.ke${clipHref(clips[1])}` },
    ],
  });
});

test('no clips is no list; a clip listed twice is named once; the list is bounded', () => {
  assert.equal(clipListStructuredData([], SITE), null);
  assert.equal(clipListStructuredData([{ id: '' }], SITE), null);
  assert.equal(clipListStructuredData([{ id: '1' }, { id: '1' }, { id: '2' }], SITE)!.numberOfItems, 2);
  const many = Array.from({ length: 120 }, (_, index) => ({ id: String(index + 1) }));
  const data = clipListStructuredData(many, SITE)!;
  assert.equal(data.numberOfItems, CLIP_LIST_LIMIT);
  assert.equal((data.itemListElement as unknown[]).length, CLIP_LIST_LIMIT);
  assert.equal(clipListStructuredData(many, SITE, 0), null);
});

/* ── Writing it into the page ───────────────────────────────────────────── */

test('words a member wrote cannot close the script they are written into', () => {
  const hostile = post({ content: '</script><script>alert(1)</script>', author: { id: 7, name: '</script><img src=x>' } });
  const written = jsonLdText(socialPostStructuredData(hostile, SITE));
  assert.ok(!written.includes('<'));
  assert.equal(JSON.parse(written).text, '</script><script>alert(1)</script>');
  const html = renderToStaticMarkup(createElement(JsonLd, { data: socialPostStructuredData(hostile, SITE) }));
  assert.equal(html.match(/<script/g)?.length, 1);
  assert.equal(html.match(/<\/script>/g)?.length, 1);
});

test('the script holds one object, or a list of several, and is absent when there is nothing to say', () => {
  const read = (data: Parameters<typeof JsonLd>[0]['data']) => {
    const html = renderToStaticMarkup(createElement(JsonLd, { data }));
    const found = html.match(/^<script type="application\/ld\+json">([\s\S]*)<\/script>$/);
    return found ? JSON.parse(found[1]) : html;
  };
  assert.equal(read(null), '');
  assert.equal(read([]), '');
  assert.equal(read([null, undefined]), '');
  assert.equal(read(organizationStructuredData(SITE))['@type'], 'Organization');
  assert.equal(read([null, organizationStructuredData(SITE)])['@type'], 'Organization');
  assert.deepEqual(read([organizationStructuredData(SITE), breadcrumbStructuredData([HOME_CRUMB, SPORTS_CRUMB], SITE)]).map((entry: { '@type': string }) => entry['@type']), ['Organization', 'BreadcrumbList']);
});
