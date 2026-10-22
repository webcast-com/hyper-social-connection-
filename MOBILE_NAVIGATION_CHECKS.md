# Mobile bottom navigation

The header and responsive navigation are shared by everyone, including signed-out visitors and the login/signup pages. The existing mobile bottom bar is retained. It contains six destinations:

| Accessible name | Visible label | Destination |
| --- | --- | --- |
| Home | Home | `/` |
| People | People | `/discover` |
| Sports | Sports | `/sports` |
| Groups | Groups | `/groups` |
| Messages | Messages | `/messages` |
| Notifications | Alerts | `/notifications` |

The short Alerts label fits narrow phones; its accessible name and tooltip are Notifications. Messages replaces the ambiguous Contacts label. The currently selected destination uses `aria-current="page"`, including Messages for nested conversation routes. The bar is fixed to the viewport below 768px; the top navigation is used on wider screens. Guests see Log in and Sign up controls instead of an avatar/account menu. The desktop Profile link takes guests to login; private destinations and server actions keep their existing authentication requirements.

## Fixes

- The six tabs use equal-width grid cells with at least 44px tap targets on the tested phone widths.
- The bar, shared page padding and chat-panel height now share the same bar-height and bottom-safe-area measurements. Previously, the bar included the safe area but the fixed `pb-20` page padding did not account for it; a 34px safe area could cover the last page action. Chat height also reserved slightly too little room.
- Safe-area padding protects the phone's bottom gesture area and horizontal insets. The message composer no longer shrinks; the message stream can scroll within the remaining panel space.
- A zero unread count no longer renders a literal `0` next to the notification icon. Positive counts display up to `9+` while assistive technology receives the full unread count.

## Automated verification

```sh
npm run test:mobile-navigation
npm run typecheck
```

Install a Playwright Chromium browser first (`npx playwright install chromium`) or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a compatible installed browser.

Twenty-two navigation tests cover:

- Six tabs fitting and remaining clickable before/after scrolling at 320, 375, 390 and 430px, plus 667px landscape.
- Destination URLs and selected-tab indicators for all six links.
- Nested conversation selection and composer placement using the real conversation component.
- Simulated 34px bottom safe areas and the last notification row remaining above the bar.
- Viewport height changes (812, 500 and 400px), badge accessibility and desktop navigation switching.
- Guest headers and responsive navigation at 320/375/768/1024/1440px, without fake account controls, invalid profile links or document overflow.
- Fixed guest navigation on the real login and signup components, before and after scrolling.

The fixture uses the real Navbar, login/signup, message pages, MessageInput, ChatStream and notifications page with controlled server data/actions/router boundaries. Destination links navigate through ordinary anchor behavior without a Next router context. It does not validate authentication, production routing, message persistence, or a physical phone's software keyboard. Native iOS Safari and Android Chrome keyboard/gesture-area behavior still needs a device check.

## Running-app spot check (signed out)

Checked the unmocked local Next.js app at 320px: `/`, `/sports`, `/login`, `/signup`, `/groups` and `/discover` all retain the guest header and bottom tabs. `/messages` and `/notifications` redirect to `/login`, where navigation stays visible. No document overflow or browser page errors were found. Third-party assets were blocked for this network-limited check; the app's pages, routing and APIs were not mocked. This checks anonymous routing, not successful authentication or database persistence.

Final regression run: **22 navigation + 29 sports/homepage layout + 30 upload + 32 sports-data/API/transport tests passed (113 total)**. Typecheck and diff whitespace checks passed. Changed-file lint has no errors; three existing image-optimization warnings remain.
