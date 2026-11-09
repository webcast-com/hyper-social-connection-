# ScoreHub integration

The standalone ScoreHub demo is served at `/scorehub` (redirecting to
`/scorehub/index.htm`). The Sports page links to it without replacing Hyper's
existing sports experience. It is not embedded in the Hyper shell, so its own
layout and theme toggle remain unchanged.

`public/scorehub/` is a byte-for-byte copy of the `scorehub/` folder on main at
commit `d4ea5eefd7d0dd39ee41486af13ac8a8f16d547c`, placed in Next.js's public
assets directory so its relative CSS and JavaScript paths work in deployments.
It is a snapshot, not an automatically synchronized copy of the original folder.
When updating it from main, copy all four files together and update the checksums
in `tests/scorehub/integration.test.ts`.

The source describes its scores, news, standings, and other numbers as demo
content; it is not connected to live data. The Sports link labels it as a demo,
and ScoreHub responses send `X-Robots-Tag: noindex, nofollow` so the illustrative
claims are not intended for indexing. The source files themselves are unchanged.

Run `npm run test:scorehub` to check the snapshot and routing configuration.
