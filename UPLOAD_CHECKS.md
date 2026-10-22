# Upload button checks

## Scope

Real React components and the shared `uploadMediaFile` helper are exercised in Chromium. The isolated fixture substitutes server actions and intercepts storage/API responses; it does **not** prove a live database write, bucket configuration, CORS setup, or deployment body limits. No production test route or extra runtime dependency was added.

Covered surfaces: post photo/video attachment, composer story, story card, message attachment, settings avatar and cover fields, group cover field, profile avatar, and profile cover.

## Fixes

- Removed the composer toolbar overflow that clipped the attachment popover; kept the popover within narrow and desktop viewports. Added accessible labels to controls whose text disappears on small screens, menu focus, and Escape dismissal.
- Restored missing progress updates in the settings cover field and displayed story-card progress.
- Disabled conflicting replacement/removal actions while files are uploading. Made the story upload card a native keyboard-operable button with its file input outside the clickable card.
- Wrapped settings/group field controls and constrained message input/preview widths to prevent small-screen overflow. Preserved the send button's width.
- Moved profile cover controls above the overlapping avatar/name row so they remain clickable. Kept progress/error feedback clear of those buttons.
- Put profile-avatar feedback in document flow instead of over adjacent content. Allowed progress byte counts to wrap in narrow columns.
- Kept the saved avatar/cover displayed when persistence fails and caught cover-removal failures.

## Automated checks

Run with a Playwright Chromium browser installed:

```sh
npm ci
npx playwright install chromium
npm run test:uploads
npm run typecheck
```

An existing compatible browser can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Latest verification: **30 upload tests passed**, typecheck passed, and `git diff --check` passed. Browser layout checks cover 320, 375, 768, and 1440 pixel viewports. Tests include picker activation, repeat selection, cancellation, image-only story validation, file type/size rejection, progress, disabled controls, errors and retry, attachment submission, simulated presigned PUT/verification, multipart fallback, and failed profile persistence. Narrow-column progress is also checked in light and dark modes.

Repository-wide lint still reports eight errors in untouched files (`CreateGroupButton`, `EditPostModal`, `GroupAdminControls`, `GroupInviteButton`, `ReportModal`, `ReportUserModal`, `RepostModal`, and `ShareProfileModal`) for `react-hooks/set-state-in-effect`. The changed upload files have no lint errors; existing image-optimization warnings remain.

## Deployment follow-up

With a signed-in account, upload an actual image and video to the configured storage service, save/submit them, and reload to confirm persistence. Confirm storage CORS and platform body limits with a larger permitted file. Also verify native file pickers on iOS Safari and Android Chrome; the automated suite uses desktop Chromium at responsive viewport sizes.
