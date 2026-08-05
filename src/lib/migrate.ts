import { pool } from '@/db';

let migrated = false;

/**
 * Idempotent, non-destructive schema patches for databases that were
 * provisioned before these columns existed. Safe to call on every request:
 * it only runs once per server process and every statement is a no-op when
 * the column already exists. Errors are caught so this can never break the
 * app (e.g. on a fresh database where drizzle-kit push creates the tables
 * from the current schema anyway).
 */
export async function ensureMigrated() {
  if (migrated) return;
  migrated = true;

  const statements = [
    // Video upload support for posts (new nullable column, existing rows untouched)
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url text`,
  ];

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (error) {
      console.warn('Migration skipped:', statement, (error as Error)?.message);
    }
  }
}
