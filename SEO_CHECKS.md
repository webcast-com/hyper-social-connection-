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
- `robots.txt` advertises `https://hyper.co.ke/sitemap.xml` and the production host. Existing account/API crawl restrictions and page-level noindex are retained. Robots exclusions are not an authentication boundary and do not by themselves remove indexed URLs.
- Sitemap removes the already-noindex search page, adds the public odds page, and only queries public profiles/groups and published public posts outside private groups. Lists are bounded; database failure falls back to static routes. Static pages no longer claim a fabricated fresh modification date on every request.

## Verification

- `npm run test:seo`: **12 passed**. Includes real server metadata exports with controlled database/provider boundaries, public/private metadata, production and preview origins, legacy host migration, sitemap filters and preview headers.
- `npm run test:sports`: **89 passed**.
- `npm run test:sports-layout`: **56 passed** in Chromium.
- `npm run typecheck`, `npm run build`, changed-file ESLint and `git diff --check`: passed. ESLint reports only existing image-optimization warnings in the edited pages (14 warnings, no errors).
- HTTP smoke checks against the production build in offline mode: `/robots.txt`, `/sitemap.xml`, `/login` and `/post/invalid` returned 200 and the expected production-domain SEO data. Account/missing-post pages retained noindex. Existing social preview image is present at `/og-image.png`.

## Deployment checklist

1. Set **NEXT_PUBLIC_SITE_URL=https://hyper.co.ke** in the production hosting environment and rebuild/redeploy. The code also rejects the old Vercel canonical if that variable is stale.
2. Keep Vercel production deployments marked `VERCEL_ENV=production`; previews should remain `preview` so their noindex header is applied.
3. Confirm DNS and a valid HTTPS certificate for `hyper.co.ke`. Configure permanent HTTP-to-HTTPS and `www`-to-apex redirects at the hosting/domain layer. Canonical metadata does not implement network redirects.
4. Check the live site's canonical, social image, `robots.txt` and `sitemap.xml`, and ensure production does not send a preview noindex header.
5. Verify the domain in Google Search Console using your own account/token, then submit `https://hyper.co.ke/sitemap.xml`. No verification token was invented or requested here.

Live DNS/TLS/redirects, Search Console ownership and Google indexing/rankings were not verified: this workspace's outbound allowlist excludes hyper.co.ke. No hosting settings or Search Console account were changed. PR36 remains open/unmerged for review.
