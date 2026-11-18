/**
 * Planning helpers for scripts/copy-database.ts, kept apart from it so they
 * can be tested without a database.
 */

export type ForeignKey = {
  /** Table that holds the reference. */
  child: string;
  /** Table the reference points at. */
  parent: string;
  /** Referencing columns in `child`. */
  columns: string[];
  /** True when every referencing column may be NULL. */
  nullable: boolean;
};

export type CopyOrder = {
  /** Tables in an order where a referenced table comes before its dependents. */
  tables: string[];
  /**
   * References that cannot be satisfied by ordering alone (a table pointing at
   * itself, or two tables pointing at each other). Their columns are inserted
   * as NULL and filled in once every row exists.
   */
  deferred: ForeignKey[];
  /** Loops that cannot be broken because no reference in them may be NULL. */
  problems: string[];
};

/**
 * Order tables for copying into a database whose foreign keys are enforced.
 * Ties are broken alphabetically so the order is the same on every run.
 */
export function copyOrder(tables: string[], foreignKeys: ForeignKey[]): CopyOrder {
  const names = [...tables].sort();
  const deferred: ForeignKey[] = [];
  const problems: string[] = [];

  // A table that references itself can never come "after itself".
  let edges = foreignKeys.filter((fk) => {
    if (fk.child !== fk.parent) return true;
    if (fk.nullable) deferred.push(fk);
    // A required self-reference is satisfied by inserting in primary-key
    // order in practice; nothing to plan for here.
    return false;
  });

  const ordered: string[] = [];
  const placed = new Set<string>();

  while (placed.size < names.length) {
    const ready = names.filter(
      (name) => !placed.has(name) && edges.every((fk) => fk.child !== name || placed.has(fk.parent)),
    );
    if (ready.length) {
      for (const name of ready) {
        ordered.push(name);
        placed.add(name);
      }
      continue;
    }

    // Every remaining table waits on another: a loop. Postpone one optional
    // reference between remaining tables and try again.
    const breakable = edges
      .filter((fk) => fk.nullable && !placed.has(fk.child) && !placed.has(fk.parent))
      .sort((a, b) => `${a.child}.${a.columns}`.localeCompare(`${b.child}.${b.columns}`))[0];
    if (!breakable) {
      const stuck = names.filter((name) => !placed.has(name));
      problems.push(`Tables ${stuck.join(", ")} reference each other through required columns; no copy order exists.`);
      ordered.push(...stuck);
      break;
    }
    deferred.push(breakable);
    edges = edges.filter((fk) => fk !== breakable);
  }

  return { tables: ordered, deferred, problems };
}

/** PostgreSQL allows 65 535 bind parameters per statement. */
const MAX_PARAMETERS = 60_000;
const MAX_ROWS = 500;

/** How many rows of `columnCount` columns fit in one INSERT. */
export function rowsPerInsert(columnCount: number): number {
  return Math.max(1, Math.min(MAX_ROWS, Math.floor(MAX_PARAMETERS / Math.max(1, columnCount))));
}

/** Quote an identifier for use in SQL. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
