# Hyper SEO — canonical domain update

Canonical production origin: **https://hyper.co.ke**.

## Changes

- Default canonical origin no longer falls back to localhost or `VERCEL_URL`. Explicit Hyper HTTP/www variants normalize to HTTPS apex. Invalid/credential-bearing configuration and stale Vercel/Arena preview URLs fall back safely to the public domain. Explicit non-preview HTTP(S) origins remain configurable for local development/self-hosting.
- `.env.example` and deployment documentation specify `NEXT_PUBLIC_SITE_URL=https://hyper.co.ke`. The existing tracked `.env` and `.env.local` public URL settings were also updated; no database/auth/storage credentials were changed.
- Root metadata uses the production origin for canonical resolution and sharing images, but no longer forces every child page to canonicalize to `/`. Homepage retains its explicit `/` canonical and avoids a duplicated `| Hyper` title suffix.
- Discover, communities, sports and odds pages now share complete per-page canonical/Open Graph/Twitter metadata. This avoids stale inherited Twitter titles/descriptions when Next replaces nested metadata objects.
- Posts and matches now have their own canonical and sharing URLs. Public post titles no longer repeat the brand suffix. Match titles use the reported teams and competition, sharing the existing bounded cache/in-flight summary request with the page. Unavailable match summaries are noindex.
- Private/followers-only profile bios, private group descriptions/covers and private/unpublished post contents are not emitted in search/share metadata. Those pages are noindex. These changes cover metadata and sitemap discovery, not page authorization or access control.
- Vercel preview/development deployments emit noindex metadata plus a global `X-Robots-Tag: noindex, nofollow` header, including routes that override their own metadata. Production does not receive that header.
- `robots.txt` advertises `https://hyper.co.ke/sitemap.xml` and the production host. Private account/API crawl restrictions and page-level noindex are retained; public login, signup and search pages allow indexing. Robots exclusions are not an authentication boundary and do not by themselves remove indexed URLs.
- Sitemap includes public search, login, signup, About, Privacy and odds pages, and only queries public profiles/groups and published public posts outside private groups. Lists are bounded; database failure falls back to static routes. Static pages no longer claim a fabricated fresh modification date on every request.

## Verification

- `npm run test:seo`: **15 passed**. Includes real server metadata exports with controlled database/provider boundaries, public/private metadata, production and preview origins, legacy host migration, sitemap filters and preview headers.
- `npm run test:sports`: **89 passed**.
- `npm run test:sports-layout`: **62 passed** in Chromium.
- `npm run typecheck`, `npm run build`, changed-file ESLint and `git diff --check`: passed. ESLint reports only existing image-optimization warnings in the edited pages (14 warnings, no errors).
- HTTP smoke checks against the production build in offline mode: `/robots.txt`, `/sitemap.xml`, `/login` and `/post/invalid` returned 200 and the expected production-domain SEO data. Login/signup/search now allow indexing; private account and missing-post pages retain noindex. Existing social preview image is present at `/og-image.png`.

## Deployment checklist

1. Set **NEXT_PUBLIC_SITE_URL=https://hyper.co.ke** in the production hosting environment and rebuild/redeploy. The code also rejects the old Vercel canonical if that variable is stale.
2. Keep Vercel production deployments marked `VERCEL_ENV=production`; previews should remain `preview` so their noindex header is applied.
3. Confirm DNS and a valid HTTPS certificate for `hyper.co.ke`. Configure permanent HTTP-to-HTTPS and `www`-to-apex redirects at the hosting/domain layer. Canonical metadata does not implement network redirects.
4. Check the live site's canonical, social image, `robots.txt` and `sitemap.xml`, and ensure production does not send a preview noindex header.
5. Verify the domain in Google Search Console using your own account/token, then submit `https://hyper.co.ke/sitemap.xml`. No verification token was invented or requested here.

Live DNS/TLS/redirects, Search Console ownership and Google indexing/rankings were not verified: this workspace's outbound allowlist excludes hyper.co.ke. No hosting settings or Search Console account were changed. PR36 remains open/unmerged for review.


## Public pages and indexing follow-up

- Added `/about` and `/privacy`, with complete canonical/Open Graph/Twitter metadata and index/follow on production. A shared footer links both pages on every route, for guests and signed-in users, with spacing above the mobile navigation.
- Public entry routes (`/login`, `/signup`, `/search`) now allow indexing, appear in the sitemap and are not blocked by robots. Search query variants canonicalize to `/search` rather than creating unlimited duplicate canonical URLs.
- Private messages, settings, notifications, private/unpublished content and Vercel previews remain excluded intentionally. Indexability does not grant public access or guarantee inclusion in search results.
- Privacy text reflects implemented data categories, cookies, visibility, service providers, calls, user choices and retention limitations. It does not invent a company address, legal certification, deletion deadline or working inbox. The operator should review the notice for their actual operations and applicable law before treating it as a finalized policy.
- Set `PRIVACY_CONTACT_EMAIL` to a monitored public privacy-request address. Without one, the page transparently states that a dedicated contact has not yet been published; no fake contact is substituted.
- Verified public HTTP 200, index/follow, canonical and footer links for About, Privacy, login, signup and search against the production build in offline mode. Also checked sitemap membership and public/private robots boundaries. New browser checks cover both information pages at 320/768/1440px, dark mode and guest access. Current totals: **15 SEO + 89 sports unit/API + 62 browser tests passed**; TypeScript, changed-file lint, whitespace checks and production build passed.


## Live streams (`/sports/live`)

- Indexable: title "Live Football Streams | Hyper", a description, a canonical
  of `/sports/live`, `index, follow`, Open Graph and Twitter cards
  (`getPageMetadata` in `src/app/sports/live/page.tsx`).
- The fixtures are server-rendered, so a crawler that runs no script still
  reads the matches being streamed. The player itself is a third-party frame
  that is only requested when play is pressed; nothing in it is this page's
  content.
- `/sports/live?match=<id>` (the homepage card's link) is the same page opened
  on one match. Its canonical is `/sports/live`, so it is not a second URL to
  index.
- Linked from the homepage rail, the `/sports` board and the homepage's
  floating card.
- **Submitted in the sitemap since 2026-11-20.** It was left out when the page
  shipped, so until then a crawler could only find it by following links. It
  carries no `lastmod`: the fixtures are read live and nothing about them is
  stored here.
- **Structured data** (`src/lib/stream-seo.ts`, tests `stream-broadcasts.test.ts`):
  an `ItemList` of up to 30 `BroadcastEvent`s, each `isLiveBroadcast` with a
  `broadcastOfEvent` `SportsEvent` (the two sides with their crests, the sport,
  the kick-off). Only fixtures in play or still to come are listed, live first;
  `url` is `/sports/live?match=<id>`. Emitted from the same board the page
  renders, and not at all when nothing is live or to come.
  - Nobody is named as the broadcaster (no `publisher` or `provider`): the
    player is a third party's embed.
  - There is no `VideoObject`, so this does not qualify for Google's LIVE badge.
    That needs a thumbnail and a video address of the stream itself, which this
    site does not have; inventing them would be the kind of markup Google
    penalises.
- Whether a search engine has indexed it is not something the site can report:
  check the URL in Google Search Console (URL inspection), and request indexing
  there to speed it up.

## Structured data on the social and listing pages (2026-11-20)

Builders in `src/lib/structured-data.ts`, written into the page by
`src/components/JsonLd.tsx` (server-rendered; `<` escaped). Tests:
`tests/seo/structured-data.test.ts`.

| Page | What is emitted | When |
|---|---|---|
| `/` | `WebSite` and `Organization` (name, address, `/icon-512.png` logo) | always |
| `/post/<id>` | `SocialMediaPosting` and `BreadcrumbList` | the post is public (`isPublicPost`): the rule that sets `index` |
| `/profile/<id>` | `ProfilePage` about a `Person` | a public profile of a person, read from the database: the rule that sets `index` |
| `/groups/<id>` | `BreadcrumbList` | a public group that was looked up |
| `/sports`, `/sports/predictions` | `BreadcrumbList` | always |
| `/sports/highlights` | `BreadcrumbList`, and an `ItemList` of up to 50 clip pages | the list only on the plain page, not on a filtered or paged view |

- Every value is one the page prints to a signed-out visitor. A post carries
  its words, picture, author, dates and the like and comment counts; comments
  are counted, never quoted. A profile carries the name, handle, bio, picture,
  join date and the two follow counts; location, work, education and the
  member's website are not repeated.
- A value that is missing is left out. A post with no words and no picture (a
  bare repost) gets a breadcrumb and no posting. An address that is not `https`
  is dropped.
- The organisation has no address, phone number or social accounts: none is
  published, so none is stated.
- `/login`, `/signup` and `/search` are now `noindex, follow` (they were
  indexable, and already out of the sitemap). Robots still allows them, so the
  tag can be read. This supersedes the "Public entry routes ... now allow
  indexing" note above. A search for "Hyper login" will now land on the
  homepage rather than the form.
- Checked in a browser-less fetch of the running app with scratch rows (since
  removed): a public post, a group post, a bare repost, a friends-only post, a
  post by a private profile, a post in a private group, a scheduled post, a
  public member, a private member, a demo account, a public and a private
  group, and two stored clips. Non-public rows emitted no structured data.
- Validate after deploy with Google's Rich Results Test on one post and one
  profile address.

## Basketball & NFL dashboard pages (`/nfl-basketball/**`)

The dashboard is a client-rendered app: one built document for every address.
What each address *is* now lives in one place, `vendor/nfl-nba/src/seo/routeMeta.js`,
and is used twice — by the server when it answers the request
(`src/lib/dashboard-seo.ts`, `src/lib/dashboard-document.ts`) and by the app on
every client-side navigation (`vendor/nfl-nba/src/seo/RouteMetaProvider.jsx`).

| Address | Status | Indexing |
| --- | --- | --- |
| `/nfl-basketball` | 308 to `/nfl-basketball/basketball` | — |
| Hubs (`/basketball`, `/nfl`) and sections (`/upcoming`, `/top-scorers`, `/news`) | 200 | index |
| `team/:key` in a league with an ESPN feed | 200 | index |
| `team/:code` (`BOS`) | 200 | canonical is the `team/:key` address |
| `team/:key` in a league with no feed (BAL, ACB) | 200 | noindex: the page is sample data |
| `player/:key` | 200 | noindex until the player has an ESPN profile to load |
| `match/:espnEventId` | 200 | index; `?competition=` is kept in the canonical only when it selects another feed (college) |
| `match/1`…`15` (bundled sample fixtures) | 200 | noindex: the scores are invented |
| `cricket`, `badminton`, `hockey` (coming soon) | 200 | noindex |
| Unknown team, player, match id or path | **404** | noindex, no canonical |
| A missing file (`assets/…`, anything with an extension) | 404, plain text | noindex |

- **Head.** Title (with `| Hyper`), description (70–170 characters), up to 12
  page-specific keywords, canonical on the public origin, `og:*` including the
  1200×630 image, Twitter card, and JSON-LD: `CollectionPage` + `ItemList` of team
  pages on a hub, `SportsTeam` on a team page, `BreadcrumbList` everywhere. A match
  publishes no `SportsEvent`: the server knows neither its date nor its teams.
- **Body.** The root element is served holding the page's breadcrumb, `<h1>`,
  description and onward links (a hub links to every team). The app replaces it on
  first render with the same headline. No score is ever written by the server.
- **After navigation.** The app rewrites title, description, canonical, `og:url`,
  sharing titles and the robots tag, and removes structured data that described
  the page that was left. A match page is renamed after its two teams once ESPN
  answers, and marked noindex if ESPN has no such game.
- **Not found.** An address with no screen used to be answered 200 with the
  basketball hub's metadata, and the app redirected to the hub. It is now a 404
  and the app shows a "Page not found" screen.
- **Loading.** Web fonts moved from an `@import` in the stylesheet to `<link>`s
  in the document with `preconnect`, so they no longer wait for the stylesheet.
- **Sitemap.** `/sitemap.xml` now lists the 90 indexable dashboard pages: the two
  hubs, six sections and 82 team pages (`dashboardSitemapEntries` in
  `src/lib/sitemap-rules.ts`). They carry no `lastmod`, since nothing stored says
  when a scores page changed. Sample-only teams and fixtures, player pages, match
  pages, the coming-soon screens and the redirecting entry URL are not listed.
- Preview deployments stay `noindex, nofollow` on every dashboard page.

Checks: `npm run test:seo` (82), `npm --prefix vendor/nfl-nba test` (182),
`npm run test:nfl-basketball` (3). Not verified here: how Google or Bing render
and rank these pages, and live ESPN responses (the sandbox cannot reach ESPN).

## Named addresses for matches and highlights (2026-11)

A match and a highlight clip are now addressed by name, with the id kept at the
end:

| Page | Before | Now |
| --- | --- | --- |
| Match | `/sports/matches/epl/740123` | `/sports/matches/epl/arsenal-vs-chelsea-740123` |
| Highlight | `/sports/highlights/50476535` | `/sports/highlights/saka-opens-the-scoring-50476535` |

- **The id decides the page; the name is checked afterwards.** The page reads the
  digits after the last dash (`matchEventId`, `clipIdCandidates`) and looks the
  record up by those alone. The words are built by `slugWords` in
  `src/lib/seo-slug.ts`: lower case, accents folded, "&" spoken, at most 80
  characters, cut at a word.
- **One address per page.** A clip page answers only at `clipHref(clip)`. Every
  other spelling — the id alone, an old title, different capitals, made-up words —
  gets a **308** to it. A match page does the same when stored clips name the
  fixture, and carries the query string (`returnTo`) across.
- **A match with no stored clips is not corrected.** The server has no name to
  check against, so it answers wherever it was asked (boards link by name from
  live data, and a redirect on every click would be wrong). It was already
  `noindex`, and its canonical is the plain id.
- **Old links keep working.** Links in posts, messages, the ScoreHub page and the
  team page still use the id alone and are redirected.
- **Sitemap.** Clip and match entries are written in the named form, from the
  same title and fixture name the page uses, so the sitemap does not submit an
  address that only redirects. The two clip stores (database and folder) return
  the same names: `HIGHLIGHTS_COMPARE=1` run of
  `tests/sports/highlights-folder-vs-database.test.ts`, 3 of 3.
- **No name, no words.** A title with no Latin letters or digits, a clip whose id
  is not a number (sample cards), and a fixture missing one side keep the id-only
  address.
- **Not changed:** `/api/sports/matches/**` (id only), profiles, groups and posts,
  the `/nfl-basketball/**` dashboard's own match pages.

Checks: `npm run test:seo` (117, of which `tests/seo/named-addresses.test.ts` is
7), `npm run test:sports` (695). Over HTTP against a local server with two
stored scratch clips: id-only, stale-name and wrong-case addresses → 308 to the
named address; named address → 200 with the named canonical, `embedUrl` and
`SportsEvent.url`; unknown ids and addresses not ending in an id → 404; in-app
navigation to an old address lands on the named one without a full page load.
Not verified here: how search engines treat the change, and the live site's data.
