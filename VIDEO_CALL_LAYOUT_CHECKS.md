# Participant layouts and call views

Implemented and checked on **2026-09-05**. Scope: participant cards and viewer-local gallery, pinned, screen-focus and active-speaker views in native group video/audio calls.

## What changed

- **Container-owned sizing:** a `ResizeObserver` measures the gallery, including changes caused by opening chat. Equal-sized cards have a 16:9 media area and a separate 36px name row. Native camera resolution no longer determines row height.
- **Complete cards, centered rows:** fit the available width and height instead of scrolling through clipped cards. Incomplete rows are centered. Pagination shows up to nine participants per page; this is not a room-size or transport guarantee.
- **Height-aware pagination:** prefer readable cards. On short, wide stages, the pager moves alongside the cards rather than taking away their height. When minimum sizes are impossible, choose the largest available media area instead of making cards smaller just to paginate.
- **Uncropped screen fit:** cameras use `object-fit: cover`; shared screens use `contain` and are not mirrored. Names, mute indicators and hand/sharing badges sit below the media, not over shared content.
- **Adaptive camera-off state:** avatars scale with the card rather than imposing a fixed minimum tile height. Loading, audio-only and camera-off states use exactly the same card geometry.
- **Readable names:** 14px labels open a participant-options popover with the full name and view actions, plus title and accessible-name fallbacks. Escape or a backdrop click dismissing a name does not also leave the call.
- **Media continuity:** stable participant keys and persistent video elements keep all streams attached, including participants on hidden pages. Resizing and paging do not own or stop tracks. The speaking ring is preserved.
- **Small-screen space:** active rooms use the full viewport on narrow or short screens. Short-screen headers/spacing and icon-only controls leave room for cards; media-toolbar and paging buttons are at least 44px. Lobby behavior, chat and existing leave/end handlers are retained.

## Pinning and screen focus

- Click/tap a **participant name → Pin participant** to give that person the main view. This also works for camera-off and audio-only participants.
- Click a **Sharing badge** (expand icon on larger cards), or choose **Focus shared screen** in the participant options, to use the full available media area for that screen. `object-fit: contain` keeps portrait/tall shared windows visible without a camera-frame crop.
- Use the **participant/screen picker** to change the focused target. With multiple sharers, screen focus offers only the currently shared screens.
- Use **Gallery** to return to the page containing that participant, with keyboard focus restored to their name. The participant options also offer **Unpin participant**.
- Choices affect **only your view**, not other participants. Gallery stays the default; speaking activity never takes over a gallery, pin or screen-focus view.
- If a pinned person leaves, or the selected screen stops sharing, return to the gallery. Stale selections do not reactivate on a later rejoin/share. Pinning a *person* intentionally survives them stopping a screen share.
- The focused card stays in the same DOM parent as the gallery cards. Other cards become hidden, not unmounted or duplicated, so their audio keeps playing. Layout actions do not acquire devices, create peers or replace media streams.
- Focus controls move to the side on short/wide stages. Escape in the view picker or participant-options popover does not accidentally trigger the call's leave shortcut.

## Optional active-speaker view

- Click a **participant name → Follow active speaker** to opt in. Use **Gallery** to stop following; choosing a person from the **Speaker selection** picker makes a manual pin instead.
- Follows connected **remote** speakers rather than cutting back to your own mirrored preview. When quiet, it keeps the last person; with no connected peers it can fall back to the local tile. Camera-off and audio-only participants remain eligible.
- Requires at least **500ms of speaking-indicator activity** from a challenger and a **2.5-second minimum hold** between ordinary switches. Overlapping voices keep the current speaker. A departing/unavailable participant gets a fallback without waiting for the hold.
- Muted and disconnected activity flags cannot take over. Speaking rings are also suppressed for muted participants, even if a stale activity flag remains.
- Reuses the room's existing audio analysers. Their meter now measures **RMS amplitude**, with separate on/off levels and a **400ms quiet release**, rather than averaging logarithmic frequency bins or counting quiet frames. A new/replaced stream resets its old activity indication.
- Pauses automatic switching while participant options/native pickers are open or a button is pressed. Keyboard focus moves to a stable control before a focused card becomes hidden. Escape in the picker does not leave the call.
- Explicit pins and screen focus disable automatic following; it does not resume until selected again. No streams, players, peers or analysers are recreated. Its single timer is cleaned up when disabled or unmounted.

A thumbnail filmstrip and host-enforced spotlighting remain out of scope.

## Verification

| Check | Result |
| --- | --- |
| Isolated component/geometry suite | **72/72 passed**, 2.9 minutes |
| Full call/API regression suite | **24/24 passed**, 9.0 minutes (local production app) |
| TypeScript and targeted ESLint | Passed |
| Production build | Passed; existing unrelated upload/storage tracing warning remains |
| Repository-wide ESLint | Same pre-existing **8 errors / 101 warnings** in unrelated code |

The full RTC suite ran against the **locally built production app**, including the view-picker Escape guard and updated speaking meter. Run builds separately from browser checks; dev hot reload can interrupt an active call. Safe production-test commands are in the functionality report.

### Component and boundary checks

`npm run test:call-layout` bundles the **actual gallery, tiles and CSS modules** into an intercepted Playwright fixture. It needs no Next server, database, account or production test route.

Coverage includes:

- 1, 2, 3, 4 and 6 participants in desktop, desktop-with-chat, tablet-with-chat, portrait-phone and two short-landscape container sizes.
- Mixed 16:9, portrait and 4:3 synthetic camera sources; equal bounds, complete labels, no overlapping cards and reserved space for speaking rings.
- Camera-off/avatar, audio-only and undecoded/loading states without geometry changes.
- Shared-screen fit, compact badges, full-name disclosure and keyboard focus.
- Twelve-participant pagination, incomplete final rows, departures, and container-only resizing.
- Persistent video/stream identity and continued off-page media playback through gallery, pinned and shared-screen views.
- Pin/unpin, picker navigation, keyboard focus restoration, departures, stopped/multiple shares, and a portrait screen using the full focus height.
- Zero, tiny, fractional, invalid and larger measurements in the pure geometry helper.
- Speaker selection timing, overlapping/brief activity, mute/disconnect/leave fallbacks, RMS/quiet thresholds, manual-view priority, menu pauses, keyboard focus and timer cleanup.

The suite records screenshots for visual inspection and asserts geometry. It does **not** use pixel-diff golden baselines. Synthetic six/twelve-card fixtures are layout coverage, not six/twelve-person WebRTC verification.

### Real-call integration

The additional test in `tests/calls/layout.spec.ts` uses three authenticated local users, real peer connections and the real signaling API. It checks card boundaries with desktop chat and at **768×900, 375×812, 812×375 and 568×320** viewports. At **320×480**, it verifies pagination, off-page playback time and increasing inbound audio RTP bytes, then verifies that video elements/streams survive resizing back to desktop. It also checks that dismissing a full-name popover does not end the call.

`tests/calls/focus.spec.ts` additionally verifies that pinning is local to one viewer, hidden-peer playback and inbound audio RTP continue, view changes preserve video/stream identity without new peer connections or camera/microphone requests, screen focus uses a real canvas display track sent over WebRTC, stopping sharing returns to the gallery, and closing while focused releases media. The final production-app run also checks Escape in the native view picker.

`tests/calls/active-speaker.spec.ts` verifies actual three-person audio-driven selection, mute/unmute transitions, manual-pin priority, unchanged players/streams/peer counts/device requests/analyser counts, off-stage audio, Escape and cleanup. Its generated microphone WAV drives real WebRTC and WebAudio; speaking flags and peer connections are not mocked. Audio processing is disabled **only in this controlled test** to make that synthetic signal deterministic. Production microphone echo-cancellation, noise-suppression and gain settings are unchanged.

The other 21 regression cases cover media controls, audio-only calling, sharing/device privacy, signaling, authorization, chat and cleanup. See [the functionality report](VIDEO_CALL_CHECKS.md) for their scope and safe local database setup.

## Run the layout checks

```bash
npm ci
npx playwright install --with-deps chromium
npm run test:call-layout
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium binary. Screenshots and failure traces go to ignored `test-results/call-layout/` directories.

Run the full RTC suite with `npm run test:calls` and the disposable-local-database environment described in the functionality report. Optional `CALL_TEST_CAPTURE_LAYOUT=1` enables full-app screenshots in its layout test; these can be slow with software rendering. Boundary and RTP assertions run whether or not screenshots are enabled.

## Remaining limits

These checks used Chromium 149 with simulated media devices. Speaker indication is energy-based, not speech recognition; quiet voices, microphone gain, background noise and real-device behaviour still need validation/tuning. Physical devices, Safari/Firefox/iOS, native screen pickers, restrictive networks and large-room load still need release testing. Participant-options popovers (including pin actions) require a supporting browser; title/accessible-name fallbacks still expose full names. Paging preserves all peer connections and audio—it is not a bandwidth optimization. TURN is still not configured; this layout work does not change the network limitations documented in the functionality report.
