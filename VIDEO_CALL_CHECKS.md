# Video call functionality check

Checked on **2026-09-04**, with the full suite rechecked on **2026-09-05** after the [participant-card layout fixes](VIDEO_CALL_LAYOUT_CHECKS.md). Scope: the native group video/audio calls opened from a group’s **Start Call** button.

## Findings and fixes

| Issue | Fix |
| --- | --- |
| Starting a call crashed with `Cannot read properties of undefined (reading 'id')`. The creation response lacked `creator`. | Creation and listing now return the creator and call type the room needs. |
| Audio-only calls lost `callType` when listed through the base Prisma model, so joiners could request a camera. | The lobby reads the complete call record, including the raw-SQL call-state extensions. |
| Peer connections and offers could be created while camera/microphone permission was still pending. | Acquire media first, then register the participant, then start negotiation and polling. Failed permissions/registration release media instead of creating empty peers. |
| ICE processing passed a candidate string to `addIceCandidate`, losing the required candidate object and media identifiers. | Relay the full `RTCIceCandidateInit`. Transient outgoing signaling failures are retried. |
| Rejoining could replay old SDP/ICE and retain mute/share state from the previous connection. | Reset participant state, return a fresh signal cursor, remove that user’s previous signaling, and recreate peers when their join timestamp changes. |
| Camera toggles replaced the video element, detaching its stream and interrupting remote audio. | Keep one video element mounted across camera state changes. |
| X, Escape, the footer Leave button, backdrop clicks and unmount did not reliably stop capture or remove participation. Speaking monitors also leaked. | Centralized, idempotent cleanup closes peers, stops microphone/camera/display tracks and audio monitors, and sends a best-effort leave. The server relays departure atomically with participant removal. |
| The client waited for HTTP 410 to detect an ended call, but the participant endpoint never returned it. | Live endpoints return 410 after ending. Clients automatically release devices and display an ended-call state. Expired/removed access also stops the local session. |
| Camera switching during sharing stopped the display track, and could enable a camera the user had turned off. | Keep the parked camera separate from the outgoing display and preserve mute/camera settings when switching devices. |
| Slow polls overlapped, potentially replaying negotiation and duplicating chat. Failed HTTP requests were sometimes treated as success. | Serialize polls, bound request timeouts, check responses, resend current state on heartbeats, and restore failed chat drafts. |
| The dialog was clipped by the group header’s glass/overflow styles, making some controls unclickable. | Portal it to the document body, keep headers/footers inside its height, and overlay chat on narrow screens. |
| Group members who had not joined could send/read signaling and in-call chat. Malformed JSON could crash endpoints or turn invalid destinations into broadcasts. | Enforce active participation and validate object bodies, IDs, signal destinations and payload shapes. |

## Automated coverage

`npm run test:calls` runs **24 regression tests** against an isolated local PostgreSQL database and Chromium. Each test creates its own users/group and removes them afterward. The tests explicitly refuse remote database/server URLs and do not load production credentials from `.env.local`.

Coverage includes:

- API response shape, authentication, group membership, participant-only access, malformed input, call ending, rejoin state and leave beacons.
- Two-way audio/video and a three-person mesh, including a lower-ID member joining later.
- **Actual inbound RTP bytes and decoded video frames**, not just local previews or mocked peer connections.
- Delayed/denied permissions, media resolving after close, failed joins, and a transient failed offer.
- Trickle ICE with candidates deliberately stripped from SDP, so a broken candidate handler cannot pass accidentally.
- Mute, camera off/on without losing audio playback, raised hands, chat, and immediate rejoin.
- Screen sharing with the camera off, camera-device switching while sharing, stopping/resuming sharing, and cleanup of the parked camera.
- Cleanup through the room controls, dialog X, Escape, footer, backdrop and pagehide; automatic cleanup after the host ends the call.
- Slow non-overlapping polls, chat deduplication, failed-message recovery and failed end-call feedback.
- Usable controls/chat at a 375 × 812 mobile viewport.
- Complete participant cards through chat, portrait/landscape resizing and paging, with off-page remote audio preserved and full-name dismissal kept separate from leaving.
- Viewer-local pinning and shared-screen focus without recreating players/peers or requesting devices; focus cleanup and view-picker Escape protection. The full suite also passed against the local production build.
- Optional active-speaker selection driven by actual received synthetic microphone audio in a three-person call, with muted indicators suppressed, stable selection, manual overrides and no extra capture/peers/analysers.

**Test environment:** Chromium 149 with simulated camera/microphone devices; screen capture supplied by a canvas stream; real WebRTC peer connections and the real Next.js/PostgreSQL signaling API. No real users or remote application database were modified.

### Verification

- Full browser/API suite: **24/24 passed** in 9.0 minutes against the local production build.
- Isolated participant-card layout suite: **72/72 passed** in 2.9 minutes; see [layout coverage and setup](VIDEO_CALL_LAYOUT_CHECKS.md).
- `npm run typecheck`: passed.
- ESLint on changed call code, tests and Playwright config: passed.
- `npm run build`: passed. An existing Turbopack file-tracing warning comes from `src/lib/storage.ts` / the upload route, outside call functionality.
- Repository-wide `npm run lint`: still reports the **same 8 pre-existing errors and 101 warnings** as the baseline. The errors are effect/state rules in unrelated group/post/report/profile modal components; this check did not change those files.

## Running the tests

Use a **disposable local database**, never a deployed instance. The app may auto-seed an empty development database.

```bash
npm ci
npx playwright install --with-deps chromium
npm run db:local

CALL_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55432/postgres' \
  npm run test:calls
```

By default Playwright starts the app on port **3100**, with the test database explicitly overriding project environment files. If a Next dev server already uses this checkout, stop it first or reuse an existing server **that was started with the same disposable database**:

```bash
CALL_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55432/postgres' \
CALL_TEST_BASE_URL='http://localhost:3000' \
  npm run test:calls
```

Prefer `localhost` for local browser tests: the current Next dev origin allowlist rejects HMR from `127.0.0.1`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed Chromium executable. Browser binaries, traces and database data are not committed.

### Stable production-build validation

To avoid hot reload interrupting test calls, the latest full run used a production build. In a terminal, explicitly override project environment files with a **disposable local database and local storage** before building/serving:

```bash
export DATABASE_URL='postgres://postgres@127.0.0.1:55432/postgres'
export DATABASE_SSL=false DB_MODE=postgres FORCE_OFFLINE_MODE=false ALLOW_DEMO_SEED=true
export S3_BUCKET='' RAPIDAPI_KEY=''
npm run build
npm run start -- --hostname 0.0.0.0 --port 3100
```

In a second terminal:

```bash
CALL_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55432/postgres' \
CALL_TEST_BASE_URL='http://localhost:3100' \
  npm run test:calls
```

Do not run the build concurrently with the browser suite. The active-speaker test generates/removes its microphone WAV in ignored `test-results/`; browser binaries and recordings are not committed.

## Remaining release checks / limitations

- **TURN is not configured.** `WebRTCRoom.tsx` currently uses public STUN servers only. Direct calls can fail on restrictive NATs, corporate networks or blocked UDP. Configure a suitable TURN relay before promising cross-network reliability; no TURN credentials or external service were provisioned here.
- Simulated-device tests do **not** establish real microphone/speaker quality, echo cancellation, OS screen-picker behavior, or mobile Safari/Firefox compatibility. Test two physical devices on different networks, including Wi-Fi versus cellular.
- Camera/microphone access needs HTTPS (localhost is the development exception), browser permission, and camera/microphone permission delegation if the app is embedded in an iframe.
- Test network switching, backgrounding/sleep and reconnect behavior on physical devices. These checks cover initial negotiation and deliberate rejoin, not seamless ICE restart after a network change.
- The mesh is intended for small groups. The three-person check is not a large-room bandwidth, CPU, signaling-load or multi-tab/same-account stress test.

## Separate security follow-up

The existing tracked `.env.example` contains credential-looking values rather than placeholders. Treat those values as exposed, rotate them through the relevant providers, and sanitize the example file. This call check did not use, validate or change those credentials.
