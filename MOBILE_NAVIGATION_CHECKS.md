# Mobile bottom navigation

The existing signed-in mobile bottom bar is retained. It contains six destinations:

| Accessible name | Visible label | Destination |
| --- | --- | --- |
| Home | Home | `/` |
| People | People | `/discover` |
| Sports | Sports | `/sports` |
| Groups | Groups | `/groups` |
| Messages | Messages | `/messages` |
| Notifications | Alerts | `/notifications` |

The short Alerts label fits narrow phones; its accessible name and tooltip are Notifications. Messages replaces the ambiguous Contacts label. The currently selected destination uses `aria-current="page"`, including Messages for nested conversation routes. The bar is fixed to the viewport below 768px; the top navigation is used on wider screens. Like before, the bottom navigation is shown only to signed-in users.

## Fixes

- The six tabs use equal-width grid cells with at least 44px tap targets on the tested phone widths.
- The bar, signed-in page padding and chat-panel height now share the same bar-height and bottom-safe-area measurements. Previously, the bar included the safe area but the fixed `pb-20` page padding did not account for it; a 34px safe area could cover the last page action. Chat height also reserved slightly too little room.
- Safe-area padding protects the phone's bottom gesture area and horizontal insets. The message composer no longer shrinks; the message stream can scroll within the remaining panel space.
- A zero unread count no longer renders a literal `0` next to the notification icon. Positive counts display up to `9+` while assistive technology receives the full unread count.

## Automated verification

```sh
npm run test:mobile-navigation
npm run typecheck
```

Install a Playwright Chromium browser first (`npx playwright install chromium`) or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a compatible installed browser.

Fifteen navigation tests cover:

- Six tabs fitting and remaining clickable before/after scrolling at 320, 375, 390 and 430px, plus 667px landscape.
- Destination URLs and selected-tab indicators for all six links.
- Nested conversation selection and composer placement using the real conversation component.
- Simulated 34px bottom safe areas and the last notification row remaining above the bar.
- Viewport height changes (812, 500 and 400px), badge accessibility and desktop navigation switching.

The fixture uses the real Navbar, message pages, MessageInput, ChatStream and notifications page with controlled server data/actions/router boundaries. Destination links navigate through ordinary anchor behavior without a Next router context. It does not validate authentication, production routing, message persistence, or a physical phone's software keyboard. Native iOS Safari and Android Chrome keyboard/gesture-area behavior still needs a device check.

Final regression run: **15 navigation + 21 sports/homepage layout + 30 upload + 7 sports-data tests passed**. Typecheck and diff whitespace checks passed. Changed-file lint has no errors; existing image-optimization warnings remain.
