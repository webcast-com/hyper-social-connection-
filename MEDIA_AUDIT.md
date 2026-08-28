# Media & Movies Audit

Hands-on functional check of file/image/video handling and the movies integration.

**How this was tested:** app run locally against a real Postgres (`scripts/dev-db.sh`),
authenticated as a seeded demo user, uploading real magic-byte-valid files of every
supported format through `/api/upload`, then serving them back through `/uploads/:file`.

**Environment caveat:** this sandbox has no outbound network, so the remote
`DATABASE_URL` and the Tigris/`t3.storage.dev` S3 bucket were unreachable. Everything
below was verified against **local-disk storage**. The S3 branch of `storage.ts` was
reviewed by reading, not executed — see "Not verified" at the end.

---

## Summary

| Area | Status |
| --- | --- |
| Image upload (png/jpg/gif/webp/avif) | ✅ Works |
| Video upload (mp4/mov/webm) | ✅ Works |
| Magic-byte sniffing / spoof rejection | ✅ Strong |
| Size limits (15 MB image / 250 MB video) | ✅ Enforced client + server |
| Video streaming, Range/seek, HEAD | ✅ Correct (200 / 206 / Content-Range) |
| Path traversal & filename validation | ✅ Blocked |
| Feed rendering of image + video posts | ✅ Renders |
| **MIME `application/octet-stream` uploads** | ❌ **Rejected — real-world failure** |
| **Movies integration** | ⚠️ **API only — no UI exists** |
| Orphaned file cleanup | ⚠️ Never deletes |
| Stories | ⚠️ Image-only by design |

---

## 1. HIGH — Valid videos rejected when the browser sends `octet-stream`

`mimeAgreesWithSniff()` (`src/lib/magic-bytes.ts`) returns `false` for any declared MIME
that isn't `image/*` or `video/*`. `application/octet-stream` therefore fails **even when
the magic bytes prove the file is a valid video**.

Measured, same identical valid MP4, only the declared type varies:

| Declared Content-Type | Result |
| --- | --- |
| `video/mp4` | ✅ 200 stored |
| *(empty string)* | ✅ 200 stored |
| `application/octet-stream` | ❌ **415** "File contents look like a video, but the upload was labelled…" |

This matters because browsers genuinely send `application/octet-stream` for files whose
extension the OS doesn't recognise — commonly `.mov`, `.webm`, and `.avif` on Windows
machines without the codec/handler registered, and for files dragged out of some apps.
The upload is sniffed and *known good*, then thrown away on a label the server has
already declared untrustworthy.

Note the inconsistency: an **empty** type is trusted (`if (!declaredMime) return true`)
but `octet-stream`, which means exactly the same thing ("unknown"), is not.

**Fix** — treat the generic binary type as "unknown" rather than as a conflict:

```ts
// src/lib/magic-bytes.ts
const GENERIC_MIMES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'application/binary',
]);

export function mimeAgreesWithSniff(declaredMime: string, sniffed: SniffedMedia) {
  const declared = declaredMime?.trim().toLowerCase();
  if (!declared || GENERIC_MIMES.has(declared)) return true; // unknown → trust the sniff
  const declaredKind = declared.startsWith('image/') ? 'image'
    : declared.startsWith('video/') ? 'video' : null;
  if (!declaredKind) return false;
  return declaredKind === sniffed.kind;
}
```

This loses no security: the sniffed bytes still decide the stored extension and MIME,
and a genuinely mismatched file (PNG bytes labelled `video/mp4`) is still rejected.

The same blind spot exists client-side in `clientRejectsFile()`
(`src/lib/media-limits.ts`): a file with `type: 'application/octet-stream'` hits
`'Only images and videos can be uploaded.'` and never reaches the server. Both layers
need the change.

Also in `CreatePost.tsx`, the story picker gates on
`file.type.startsWith('image/')`, so an `octet-stream` image can't be posted as a story
either.

## 2. Movies integration does not exist beyond the endpoint

`/api/movies` works well — pagination, capped `limit`, case-insensitive search across
title/overview/genres, sane defaults for junk input (`page=abc`, `limit=-5`, `limit=0`
all fall back correctly; `limit=1000` clamps to 50).

But it is **completely unwired**:

- `/movies` → **404**, no page exists
- No `Movie` component anywhere in `src/components/`
- No nav entry (Navbar links Home, Discover, Groups, Messages, Sports, Notifications — no Movies)
- Nothing in the feed references it

`FEED_INTEGRATION_GUIDE.md` states this is deliberate ("intentionally not inserted into
the social feed yet") and recommends Approach 1, highlight banners. So it's a known gap
rather than a regression — but as it stands, **no user can reach movie data**. Sports, by
contrast, is fully built out (`/sports` page + `SportsBoard` + widget), which is what the
movies side would need to match.

Data-shape gaps if you build the UI: no `GET /api/movies/:id`, no genre/year filter, no
sort. Posters are hot-linked to Unsplash, so a CSP or `next/image` `remotePatterns` entry
is needed.

## 3. MEDIUM — Uploaded files are never deleted

`deleteMediaObject()` in `src/lib/storage.ts` is exported but **has zero callers**.

- `deletePost()` removes the row, leaving the image/video in the bucket forever.
- Replacing an avatar, cover photo, or group cover orphans the previous file.
- Expired stories (`expiresAt`) leave their images behind.
- Uploading media then abandoning the composer orphans it immediately — the file is
  stored at upload time, before the post is ever submitted.

On a paid object store this is unbounded cost growth. Wire `deleteMediaObject` into
`deletePost` / avatar & cover replacement, and add a sweep for expired stories and for
objects with no referencing row.

## 4. LOW — Local-disk fallback is unsafe on the deployment target

`getStorageDriver()` silently returns `'local'` whenever S3 env vars are absent, writing
to `public/uploads`. The repo deploys to Netlify (`netlify.toml`,
`@netlify/plugin-nextjs`), where the filesystem is ephemeral — uploads would appear to
succeed and then vanish. `putMediaObject`'s comment says it "does not silently fall
back", but that only applies once a bucket is configured; a *missing* config falls back
silently. Consider failing loudly when `NODE_ENV === 'production'` and no bucket is set.

## 5. LOW — Cache headers don't apply to local files

`/api/media/[filename]` sets `Cache-Control: public, max-age=31536000, immutable`, but
for files that exist on disk the `next.config.ts` rewrite never fires — Next's static
handler serves them first. Observed response: `Cache-Control: public, max-age=0`.
Correct content, no long-lived caching. Only affects local mode.

## 6. Minor observations

- **Video has no lightbox.** Images open in `ImageLightbox`; `post.videoUrl` renders a
  bare `<video>` with no expand affordance. `ImageLightbox` only contains an `<img>`.
- **"Paste image/video URL" doesn't validate kind.** `CreatePost` uses `prompt()` and
  trusts the user's choice, so an image URL pasted under "video URL" renders a broken
  `<video>`. `isSafeMediaUrl` checks the protocol only. `prompt()` is also blocked in
  some embedded/sandboxed contexts.
- **Stories are image-only** — `Story.imageUrl` is non-null with no video column, and
  both the picker and `StoryViewer` are image-only. Consistent, just a product limit.
- **`EditPostModal` can't change or remove media** — `editPost()` only writes `content`.
  Existing media is preserved (not wiped), but there's no way to detach it.
- **`UploadImage.tsx` is a dead stub** — renders a bare unwired `<input type="file">`.
- **MKV is rejected deliberately** (`magic-bytes.ts` returns null on `matroska`), so
  `accept="image/*,video/*"` lets a user pick a `.mkv` the server will refuse.

---

## Verified working

- All 8 formats stored with a UUID name + sniffed extension; DB stores only `/uploads/…`.
- Spoofing blocked: PNG-bytes-labelled-`video/mp4` → 415; `.mkv` → 415; PDF → 415;
  empty file → 400; missing field → 400; unauthenticated → 401.
- Oversized 16 MB JPEG → 413 `"Max 15 MB for images."`
- Range requests: `Range: bytes=0-15` → `206` + `Content-Range: bytes 0-15/64`;
  `Accept-Ranges: bytes` present; HEAD returns headers with no body. Video seeking works.
- Traversal blocked: `/uploads/../../package.json` → 404,
  `/api/media/..%2f..%2fpackage.json` → 400, non-UUID names → 400.
- Feed rendering confirmed via real rows: video post emits
  `<video src="/uploads/….mp4" controls playsInline preload="metadata">`, image post
  emits the `<img src="/uploads/….png">`.
- `npx tsc --noEmit` passes clean.

## Not verified

- **The S3/bucket path was never executed** (no outbound network). Untested in practice:
  `PutObjectCommand` writes, the presigned-GET 302 redirect, and `HeadObjectCommand`
   404 handling. Note that in S3 mode `statLocalMedia()` is still checked on every
  request before the bucket, so a local file would shadow a bucket object of the same
  name — harmless given UUID naming, but it's a stat syscall per media request.
- Real-device browser upload (actual `File.type` values from Safari/iOS, Chrome/Windows)
  — the `octet-stream` finding above was reproduced at the HTTP layer.
