# The share sheet

The profile page had a share dialog: a preview of the profile, its link with a
Copy button, and four tabs — **Feed**, **Groups**, **Send to**, **Elsewhere**.
Every other card had its own smaller thing (a repost dialog on posts, a popover
on highlight and player cards, a composer mode on clips, matches and
predictions). They are now all that one dialog.

| Share on…                       | Heading           | Link                                | To the feed or a group             |
| ------------------------------- | ----------------- | ----------------------------------- | ---------------------------------- |
| a profile                       | Share profile     | `/profile/{id}?u={username}`        | a profile card (unchanged)         |
| a member's post                 | Share post        | `/post/{id}`                        | a repost, note above it            |
| a highlight card                | Share highlight   | the card's page                     | a repost of the card's post        |
| a player (leaders) card         | Share player      | the card's page                     | a repost of the card's post        |
| a league clip                   | Share clip        | the clip's ESPN page                | a text post about the clip         |
| a match (feed card)             | Share match       | the match page                      | a text post about the match        |
| a prediction                    | Share prediction  | `/sports/predictions`               | a text post about the prediction   |

"Send to" writes a private message: the note if there is one, a short label, and
the full link. "Elsewhere" is the same list of networks the profile dialog had.

## Pieces

- `src/components/ShareSheet.tsx` — the dialog. It knows nothing about what is
  being shared. It is given a `subject` (noun, title, subtitle, picture, link,
  text) and two functions, `shareToFeed(message, groupId)` and
  `sendTo(receiverId, note)`, and shows whatever they answer.
- `src/components/ShareProfileModal.tsx` — the profile's dialog, now a thin
  wrapper. Its wording, link and share counting are what they were.
- `src/components/ShareSheets.tsx` — `SharePostSheet` (a member's post) and
  `ShareContentSheet` (a card with no post of its own: the caller passes the
  function that writes the post text).
- `src/app/share-actions.ts` — the server side: `sharePostToFeed`,
  `sharePostToMessage`, `shareContentToFeed`, `shareContentToMessage`, beside the
  profile actions that were already there.
- `src/lib/share.ts` — links: `absoluteShareUrl` lets through a path on this site
  or an `http(s)` address and turns anything else into the site root.

## Sending the video itself

A link pasted into WhatsApp or Facebook shows a picture. A video only plays
there when the file itself is sent, so a post with a video gets one more button
at the top of the sheet, **Send the video**, which hands the file to the
device's share menu (`navigator.share({ files })`).

It is an addition: a sheet without a video, or on a device that does not take a
video file, is the sheet described above, unchanged.

- **When it shows** (`shareableVideo` in `src/lib/share-video.ts`): the post has
  a video stored by this site (`/uploads/…`), the post is one anybody may read
  (`isPublicPost`, the post page's own rule, plus "a group post handed over
  without its group is not public"), and the device answers yes to
  `navigator.canShare` for an empty file of the same name and type. A
  provider's clip (ESPN) is never sent as a file; it stays a link.
- **Two presses** (`src/components/ShareVideoButton.tsx`): a share menu may only
  open straight after a press, and a download outlives that. The first press
  fetches the file ("Preparing video… 40%", with Cancel); the second, "Send
  video", opens the menu. Nothing is fetched before the first press.
- **Limit**: 50 MB (`MAX_SHARE_VIDEO_BYTES`). A larger file is refused from its
  declared length before any of it is read, or stopped mid-read when no length
  is declared.
- **Failures** each leave one line and the rest of the sheet: "This video is too
  large to send. Share the link instead." (the button is removed), "The video
  could not be prepared. Share the link instead." (it can be pressed again),
  "This device could not send the video. Share the link instead." Closing the
  share menu without choosing is not an error.
- **Caption**: the share text and the post's link go with the file. On iPhone
  and iPad the file goes alone and the caption is put on the clipboard, because
  an app handed a video and a text there may keep only the text.
- The post and group pages now hand the card the group's `privacy`, which the
  rule above needs.

## Rules the server holds

Checked on the server on every share, whatever the dialog shows:

- You must be signed in to share to a feed, a group or a message. A guest's
  sheet has only the link and "Elsewhere".
- A group share needs you to be a member of that group.
- A post is not shareable across a block, while it is still scheduled (unless it
  is yours), or out of a non-public group — a private group's post can be
  reposted inside that group only, and cannot be sent as a message.
- A message is refused across a block and by the receiver's "who can message me"
  setting. **This now applies to profile shares too**; before, sending a profile
  skipped that setting.
- The author of a shared post gets a "repost" alert; the receiver of a message
  gets a message alert unless they turned those off.
- Notes are cut at 500 characters, post text at 2000. A message drops the line of
  hashtags a feed post ends with.

## What changed for people using it

- The old repost dialog on posts is gone. Sharing a post to your feed is still a
  repost, with or without a note.
- Guests can open Share everywhere and copy the link or use another network.
  Before, Share was disabled for them on clips, matches and predictions.
- On highlight and player cards, "Expand Image" moved from the share popover to
  the More (⋯) menu.
- Only profile shares are counted; there is no share count for posts or cards.

## Checks

`npm run test:share` — 31 tests in jsdom. The first 11: links, the sheet's contents for a
non-profile subject, a feed share, a refused share staying open with its reason,
copy and WhatsApp, the guest view, Escape and backdrop, the post subject, the
unchanged profile dialog, and message text. The share assertions for highlight,
player and clip cards live in `tests/sports/`.

Against a local database in Chromium (signed in as a demo member, 1280px and
320px): post → feed (repost row, author alerted), post → group, post → message,
message refused when the receiver accepts messages from nobody (no row written),
a private group's post refused to the feed, to another group and to a message
and accepted inside its own group, highlight → feed and → message, clip → feed
and → message, profile → feed (still a profile card), the guest sheet, and no
sideways scroll at 320px.

The other 20 (`tests/share/share-video.test.ts`) are "Send the video": which
video may be sent, what a device is asked, the fetch (pieces, declared too
large, too large mid-read, missing, dropped, empty, cancelled), and the button
in the sheet (absent without a video or a capable device, nothing fetched until
pressed, two presses, progress and Cancel, too large, failed then retried, menu
dismissed, device refusing, iPhone, a sheet closed mid-download).

In Chromium against a local database, at 390px and 1280px, with a real 355 KB
video in a post: no button and nothing fetched on a device without file sharing;
with `navigator.share` and `canShare` stood in, the first press fetched the file
once, the second handed over one file of the video's exact size and type with
the caption and link; a video on another site got no button; a 50 MB + 1 byte
answer and a dropped download each showed their line with the sheet intact; the
button also shows on the feed and the profile page when signed in.

Not checked: a real phone. The sandbox has no share menu, so what WhatsApp and
Facebook do with the file, the iPhone caption rule, and whether the storage host
lets the browser read the file (the fetch follows a redirect to a signed
address there) all need one try on the live site.

Not checked: player cards, match cards and prediction cards in a browser (the
sandbox cannot reach ESPN, so those boards are empty there; they use the same
two wrappers as the highlight and the clip), and the links that open other
networks beyond their addresses.
