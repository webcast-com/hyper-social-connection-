# Stored highlight clips

This branch is written by a scheduled job. Do not edit it by hand, and do not
merge it anywhere.

`data/highlights/` is the list of highlight clips the site has collected from
ESPN: titles, fixtures, dates and the addresses of ESPN's own video files. No
video is stored here. The site reads these files directly from this branch.

| Path | What it holds |
|---|---|
| `index.json` | Totals, and which months hold clips |
| `months/2026-11.json` | For each day of the month: how many clips, by kind, competition and match state |
| `clips/2026/11/19.json` | The clips of one UTC day, newest first, one per line |
| `clips/undated.json` | Clips ESPN gave no date for |
| `lookup/n/4820.json` | Clip id, fixture id → the day file it is in |
| `state/cells.json` | Which scoreboards were read, and when |
| `state/probes.json` | Which games were asked for clips, and what they answered |

Nothing is ever deleted from `clips/`. History on this branch is folded into a
single commit from time to time so the repository stays small; the files are
the record, not the commits.

The job is `.github/workflows/highlights-sweep.yml` on the default branch. The
format is described in `src/lib/highlights-files.ts`.

`vercel.json` here only tells Vercel not to build this branch.
