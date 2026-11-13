/**
 * The picks store: every query behind graded match picks.
 *
 * The rules — what may be picked, when a pick locks, how a result grades it —
 * live in `sports-picks.ts`, which a client component may import. Nothing here
 * may: this module holds the database, so a card that needs a rule imports the
 * rules and a page that needs a row imports this.
 *
 * Every function is inert without a database and never throws. A reader with no
 * database gets an empty list and a refused write, which the surfaces render as
 * "no picks" rather than as a leaderboard of nobody.
 */
import { hasDatabase, prisma } from '@/lib/prisma';
import { ensureMigrated } from '@/lib/migrate';
import { validEntityId } from './espn-team';
import {
  GRADE_PER_PASS, LEADERBOARD_DAYS, LEADERBOARD_ROWS, PICKS_UNAVAILABLE, VIEWER_PICKS,
  clampLeaderboardDays, clampLeaderboardRows, normalisePrice, score, side, text,
  type Grading, type LeaderRow, type MatchPick, type NewPick, type PickOutcome, type PicksLeaderboard,
  type ViewerStanding,
} from './sports-picks';

/* ── Queries ────────────────────────────────────────────────────────────── */

const COLUMNS = `"id", "user_id", "league", "event_id", "side", "home", "away", "price",
    "kickoff_at", "created_at", "graded_at", "outcome", "points", "home_score", "away_score"`;

type PickRow = {
  id: number; user_id: number; league: string; event_id: string; side: string;
  home: string; away: string; price: number | null; kickoff_at: Date | null; created_at: Date;
  graded_at: Date | null; outcome: string | null; points: number | null;
  home_score: number | null; away_score: number | null;
};

/**
 * A row as a pick, or null when the row cannot be read honestly.
 *
 * A side this code does not know is not defaulted to `home`: inventing the side
 * a reader picked would put a fabricated pick on a leaderboard, so such a row is
 * dropped and the reader simply does not see it.
 */
const rowToPick = (row: PickRow): MatchPick | null => {
  const picked = side(row.side);
  const league = text(row.league, 64);
  const eventId = validEntityId(row.event_id) ? row.event_id : null;
  const home = text(row.home);
  const away = text(row.away);
  if (!picked || !league || !eventId || !home || !away) return null;
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    league,
    eventId,
    side: picked,
    home,
    away,
    price: normalisePrice(row.price),
    kickoffAt: row.kickoff_at instanceof Date ? row.kickoff_at.toISOString() : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date().toISOString(),
    gradedAt: row.graded_at instanceof Date ? row.graded_at.toISOString() : null,
    outcome: row.outcome === 'won' || row.outcome === 'lost' ? row.outcome : null,
    points: typeof row.points === 'number' && Number.isFinite(row.points) ? row.points : null,
    homeScore: score(row.home_score),
    awayScore: score(row.away_score),
  };
};

const failed = (reason: 'query-failed', error: unknown) => {
  console.warn('[sports-picks] query failed:', (error as Error)?.message);
  return reason;
};

export type PlacePickResult =
  | { ok: true; pick: MatchPick; /** False when the reader had already picked this fixture. */ stored: boolean }
  | { ok: false; reason: 'no-database' | 'query-failed' };

/**
 * Store one pick. The first pick on a fixture stands: the unique index makes a
 * double submit a no-op, and the existing row is read back so the reader sees
 * the pick they made rather than a second one.
 */
export async function placePick(userId: number, pick: NewPick): Promise<PlacePickResult> {
  if (!hasDatabase || !(userId > 0)) return { ok: false, reason: 'no-database' };
  try {
    await ensureMigrated();
    const inserted = await prisma.$queryRawUnsafe<PickRow[]>(
      `INSERT INTO "sports_picks" ("user_id", "league", "event_id", "side", "home", "away", "price", "kickoff_at")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT ("user_id", "league", "event_id") DO NOTHING
        RETURNING ${COLUMNS}`,
      userId, pick.league, pick.eventId, pick.side, pick.home, pick.away, pick.price,
      pick.kickoffAt ? new Date(pick.kickoffAt) : null,
    );
    const stored = inserted[0] ? rowToPick(inserted[0]) : null;
    if (stored) return { ok: true, pick: stored, stored: true };

    const existing = await prisma.$queryRawUnsafe<PickRow[]>(
      `SELECT ${COLUMNS} FROM "sports_picks"
        WHERE "user_id" = $1 AND "league" = $2 AND "event_id" = $3 LIMIT 1`,
      userId, pick.league, pick.eventId,
    );
    const existingPick = existing[0] ? rowToPick(existing[0]) : null;
    if (!existingPick) return { ok: false, reason: 'query-failed' };
    return { ok: true, pick: existingPick, stored: false };
  } catch (error) {
    return { ok: false, reason: failed('query-failed', error) };
  }
}

/** The reader's own picks, newest first, for the page in front of them. */
export async function findViewerPicks(userId: number | null | undefined, limit: number = VIEWER_PICKS): Promise<MatchPick[]> {
  const id = Number(userId);
  if (!hasDatabase || !Number.isFinite(id) || id <= 0) return [];
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<PickRow[]>(
      `SELECT ${COLUMNS} FROM "sports_picks" WHERE "user_id" = $1
        ORDER BY "created_at" DESC, "id" DESC LIMIT $2`,
      id, Math.min(VIEWER_PICKS, Math.max(1, Math.trunc(limit))),
    );
    return rows.map(rowToPick).filter((pick): pick is MatchPick => pick !== null);
  } catch (error) {
    failed('query-failed', error);
    return [];
  }
}

/** Picks still awaiting a result, oldest kickoff first: the likeliest to have one. */
export async function findUngradedPicks(limit: number = GRADE_PER_PASS): Promise<MatchPick[]> {
  if (!hasDatabase) return [];
  try {
    await ensureMigrated();
    const rows = await prisma.$queryRawUnsafe<PickRow[]>(
      `SELECT ${COLUMNS} FROM "sports_picks" WHERE "graded_at" IS NULL
        ORDER BY "kickoff_at" ASC NULLS LAST, "id" ASC LIMIT $1`,
      Math.min(GRADE_PER_PASS, Math.max(1, Math.trunc(limit))),
    );
    return rows.map(rowToPick).filter((pick): pick is MatchPick => pick !== null);
  } catch (error) {
    failed('query-failed', error);
    return [];
  }
}

/**
 * Write outcomes onto picks that are still ungraded.
 *
 * The `graded_at IS NULL` guard is in the statement, not in a prior read, so two
 * instances grading the same pass cannot both write and a re-run cannot change
 * an outcome that is already recorded. Returns the rows actually updated.
 */
export async function applyGrading(entries: readonly Grading[]): Promise<number> {
  if (!hasDatabase || !entries.length) return 0;
  try {
    await ensureMigrated();
    const rows = await prisma.$executeRawUnsafe(
      `UPDATE "sports_picks" AS pick SET
          "graded_at" = now(), "outcome" = graded.outcome, "points" = graded.points,
          "home_score" = graded.home_score, "away_score" = graded.away_score
        FROM (
          SELECT unnest($1::integer[]) AS id, unnest($2::text[]) AS outcome,
                 unnest($3::integer[]) AS points, unnest($4::integer[]) AS home_score,
                 unnest($5::integer[]) AS away_score
        ) AS graded
        WHERE pick."id" = graded.id AND pick."graded_at" IS NULL`,
      entries.map((entry) => entry.id),
      entries.map((entry) => entry.outcome),
      entries.map((entry) => entry.points),
      entries.map((entry) => entry.homeScore),
      entries.map((entry) => entry.awayScore),
    );
    return Number(rows) || 0;
  } catch (error) {
    failed('query-failed', error);
    return 0;
  }
}

/**
 * The rail's two reads in one call: the top readers in the window, and where the
 * viewer stands in it.
 *
 * Ranked by points, then by fewer graded picks for the same points — the reader
 * who got four right from four outranks the one who got four right from twenty.
 * The rank is counted with the same comparison the ordering uses, so a rail can
 * never say "3rd" above a list that disagrees with it.
 */
export async function getPicksLeaderboard(
  viewerId: number | null | undefined = null, days: number = LEADERBOARD_DAYS, limit: number = LEADERBOARD_ROWS,
): Promise<PicksLeaderboard> {
  if (!hasDatabase) return PICKS_UNAVAILABLE;
  const window = clampLeaderboardDays(days);
  const rows = clampLeaderboardRows(limit);
  try {
    await ensureMigrated();
    const leaders = await prisma.$queryRawUnsafe<{
      user_id: number; name: string | null; username: string | null;
      graded: number; won: number; points: number; readers: number;
    }[]>(
      `SELECT reader."id" AS "user_id", reader."name" AS "name", reader."username" AS "username",
              COUNT(*)::integer AS "graded",
              (COUNT(*) FILTER (WHERE pick."outcome" = 'won'))::integer AS "won",
              COALESCE(SUM(pick."points"), 0)::integer AS "points",
              (COUNT(*) OVER ())::integer AS "readers"
         FROM "sports_picks" AS pick
         JOIN "users" AS reader ON reader."id" = pick."user_id"
        WHERE pick."graded_at" IS NOT NULL
          AND pick."graded_at" >= now() - make_interval(days => $1)
        GROUP BY reader."id", reader."name", reader."username"
        ORDER BY "points" DESC, "graded" ASC, "won" DESC, reader."name" ASC
        LIMIT $2`,
      window, rows,
    );

    const id = Number(viewerId);
    let viewer: ViewerStanding | null = null;
    if (Number.isFinite(id) && id > 0) {
      const standing = await prisma.$queryRawUnsafe<{ rank: number; graded: number; won: number; points: number }[]>(
        `WITH scored AS (
           SELECT "user_id", COUNT(*)::integer AS "graded",
                  COUNT(*) FILTER (WHERE "outcome" = 'won')::integer AS "won",
                  COALESCE(SUM("points"), 0)::integer AS "points"
             FROM "sports_picks"
            WHERE "graded_at" IS NOT NULL AND "graded_at" >= now() - make_interval(days => $1)
            GROUP BY "user_id"
         )
         SELECT (SELECT COUNT(*) FROM scored AS other
                  WHERE (other."points", -other."graded") > (mine."points", -mine."graded"))::integer + 1 AS "rank",
                mine."graded", mine."won", mine."points"
           FROM scored AS mine WHERE mine."user_id" = $2`,
        window, id,
      );
      const row = standing[0];
      if (row) {
        viewer = { rank: Number(row.rank) || 1, graded: Number(row.graded) || 0, won: Number(row.won) || 0, points: Number(row.points) || 0 };
      }
    }

    return {
      ok: true, days: window, readers: Number(leaders[0]?.readers) || 0, viewer,
      rows: leaders.map((row) => ({
        userId: Number(row.user_id),
        name: text(row.name) ?? null,
        username: text(row.username) ?? null,
        graded: Number(row.graded) || 0,
        won: Number(row.won) || 0,
        points: Number(row.points) || 0,
      })),
    };
  } catch (error) {
    return { ...PICKS_UNAVAILABLE, days: window, reason: failed('query-failed', error) };
  }
}

/* ── The store, injectable for tests ────────────────────────────────────── */

export type PicksStore = {
  available(): boolean;
  place(userId: number, pick: NewPick): Promise<PlacePickResult>;
  forViewer(userId: number | null | undefined, limit?: number): Promise<MatchPick[]>;
  ungraded(limit?: number): Promise<MatchPick[]>;
  grade(entries: readonly Grading[]): Promise<number>;
  leaderboard(viewerId?: number | null, days?: number, limit?: number): Promise<PicksLeaderboard>;
};

export const picksStore: PicksStore = {
  available: () => hasDatabase,
  place: (userId, pick) => placePick(userId, pick),
  forViewer: (userId, limit) => findViewerPicks(userId, limit),
  ungraded: (limit) => findUngradedPicks(limit),
  grade: (entries) => applyGrading(entries),
  leaderboard: (viewerId, days, limit) => getPicksLeaderboard(viewerId, days, limit),
};
