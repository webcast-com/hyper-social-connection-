# Graded match picks

A reader's side on one fixture, kept until ESPN reports a result, then marked won
or lost — and a leaderboard that counts only what has actually been graded.

| | |
| --- | --- |
| Table | `sports_picks` (raw DDL in `src/lib/migrate.ts`) |
| Rules | `src/lib/sports-picks.ts` — pure, importable from a client component |
| Queries | `src/lib/sports-picks-store.ts` — the only module that touches the database |
| Grading pass | `src/lib/sports-picks-grader.ts` — the only module that reaches for a board |
| Action | `placeMatchPick` in `src/app/actions.ts` |
| Surfaces | the pick row on each odds card, and `SportsPicksRail` on `/sports/predictions` |
| Specs | `tests/sports/sports-picks.test.ts` (24), plus the real-Postgres probe below |

## Why a table and not a post

A pick used to become a post: `SportsPredictionsBoard` pasted the fixture, the
kickoff and the reported prices into free text and called `createPost`. That is
shareable and it is unanswerable — nothing on the site could say whether the
reader was right, so a prediction was decoration and gave nobody a reason to come
back. A pick row has a side, the price ESPN reported when it was made, and, once
the fixture is finished, an outcome and a point. That is what makes a leaderboard
mean something. The post path is untouched: Share and Poll this still do what they
did.

## The three rules that keep it honest

**1. A pick is addressed the way this app addresses a match.** A catalog league
slug plus ESPN's own numeric event id, both read from the odds board that listed
the fixture — never from a team name. Grading is therefore a lookup by
`(league, event_id)` against a reported result, with no string matching anywhere
in the path. A fixture the feed listed without an ESPN match id cannot be picked
at all, because it could never be graded; the card says so.

**2. A pick locks at kickoff, server-side.** `placeMatchPick` resolves the fixture
from the same cached odds board the page rendered from, so the kickoff it checks is
the one ESPN reported — not a timestamp from the request, and not a browser clock.
A kickoff that cannot be parsed is treated as **locked**: this site cannot prove the
fixture has not started, so it does not take the pick. The first pick on a fixture
stands (the unique index makes a double submit a no-op and reads the original row
back), so a reader cannot swap sides after a price moves or after a result becomes
likely.

**3. A pick is graded only from a result ESPN reported.** No score, no grade: the
row keeps `graded_at` null and the surfaces say "awaiting a result". A fractional,
negative or missing score is refused by `score()` rather than rounded into a
result, and a sample fixture (`source: 'demo'`) is never a result. Grading writes
only `WHERE "graded_at" IS NULL`, so running a pass twice cannot change an outcome
already recorded — the probe below re-grades a won pick as a loss and finds the win
still standing.

## What is stored

| Column | Meaning |
| --- | --- |
| `user_id` | The reader. FK to `users`, `ON DELETE cascade`. |
| `league`, `event_id` | A catalog slug and ESPN's numeric fixture id. |
| `side` | `home`, `draw` or `away`. A sport that cannot draw is never offered one. |
| `home`, `away` | The team names ESPN reported **when the pick was made**, so the row still reads correctly if a club is renamed. |
| `price` | The decimal price ESPN reported for that side, `float8`, null when it reported none. |
| `kickoff_at` | ESPN's reported kickoff — the lock's evidence. |
| `graded_at`, `outcome`, `points` | Null until a result is reported; then `won`/`lost` and 1/0. |
| `home_score`, `away_score` | The score that decided it, so a graded pick can show its reasoning. |

Indexes: unique `(user_id, league, event_id)`; partial
`(league, event_id) WHERE "graded_at" IS NULL` for the grader's read;
`(user_id, created_at DESC)` for a reader's own picks; `(graded_at DESC NULLS LAST)`
for the leaderboard window. `price` is a float rather than a `numeric` because the
pg driver returns a numeric column as a string, and a price here labels what the
reader saw — it is not an account balance to be summed.

## Points, and why they are not price-weighted

One point per correct pick, nothing else. A price-weighted score would compare
readers who picked at different prices, and cannot be computed at all when ESPN
reported no price — so the rail shows points **alongside the record** (`3 correct
from 4 graded`) and lets a reader judge the strike rate themselves. Ranking is
`points DESC, graded ASC`: four right from four outranks four right from twenty.
The viewer's rank is counted with the same tuple comparison the ordering uses, so a
rail can never say "3rd" above a list that disagrees with it.

## Grading without a scheduler

There is no cron in this deployment, so grading rides on traffic the same way the
highlights sweep does: `nudgePickGrading()` schedules a pass with `after()` past the
response, rate-limited to one per ten minutes per process, falling back to a direct
call where there is no request scope (where `after` throws).

It is called from **the homepage only**, because the homepage has just fetched the
sports board and the grader reads it with no cache bypass — so a pass normally costs
**zero ESPN requests**. The predictions page deliberately does not nudge: it reads
odds, not a board, and a pass there would pay for a full 121-competition scoreboard
fan-out. A pass reports what it graded (`examined`, `graded`, `awaiting`) and not
what it cost, because it cannot attribute a request it did not make.

A pass reads at most `GRADE_PER_PASS = 12` ungraded picks, oldest kickoff first, and
grades the ones the board reports as finished. The consequence, stated plainly: a
fixture is graded when a board this site reads carries its result, so a pick on a
fixture three days out waits for its day, and a pick nobody's homepage visit ever
sees reported stays awaiting a result. Nothing times out into a guess.

## Degradation

Every store function is inert without a database and never throws. With no database
`getViewer()` returns null, so no reader is signed in and no pick can be taken; the
rail renders **nothing at all** rather than an empty leaderboard, because "no graded
picks yet" and "picks are not being stored" are different claims. A write that fails
returns `{ ok: false }` and the card says "Could not record your pick. Please try
again." The odds on the page are unchanged from what they were before picks existed.

## Verified

- `npm run test:sports` — 24 specs: the sides a fixture may be picked on, grading
  from a reported score and the refusal to grade without one, price normalisation,
  the kickoff lock including an unreportable kickoff, every refusal `pickFromFixture`
  can make, the leaderboard clamps, what a pass may grade against (live, upcoming,
  scoreless, sample and id-less fixtures all excluded), and seven pass specs against
  an injected store — bounded reads, exact write sets, a board with no results, no
  database, nothing awaiting, a second pass doing no work, and a sample fixture
  grading nothing.
- **Real-Postgres probe** (throwaway, deleted in the same run, rows cleaned up):
  all four indexes created as intended including the partial one; a pick stored with
  its price rounded to two decimals; **a second pick on the same fixture refused by
  the index with the original side and price returned**; picks read back newest
  first per reader and invisible to another; the grader's read bounded and oldest
  kickoff first; the multi-array `unnest` UPDATE writing each row and **re-grading
  writing nothing**; the leaderboard ordering, record and reader count correct for
  two readers; the viewer's rank agreeing with the list for both readers; a one-day
  and a clamped 365-day window both reading; and graded picks leaving the grader's
  read, so a pass converges.
- The probe caught a real bug the specs could not: `JOIN "users" AS user` is a
  **syntax error in Postgres** (`user` is reserved), so the leaderboard query had
  never run. The alias is `reader`.

## Not verified here

- **No pick has been taken against live ESPN odds in this sandbox** — it has no
  egress to ESPN, so the odds board is empty and `placeMatchPick` correctly reports
  that the fixture is not listed. On a deployment that can reach ESPN, a human eye
  should confirm: a pick taken before kickoff is stored and shown on the card; the
  same fixture refuses a second pick; a pick after kickoff is refused; and after the
  fixture finishes and the homepage is visited, the pick shows a graded outcome and
  the rail ranks it.
- Playwright layout is unrunnable in this sandbox. `tests/sports/home-layout.spec.ts`
  was updated (the `SportsLiveWidget` stub is gone — see
  [SPORTS_CHECKS.md](SPORTS_CHECKS.md) for the match centre) but not executed.
