/**
 * Copy the app's data from one PostgreSQL database into another: every row of
 * every table in `public` that both databases have. Written for moving the
 * site from its previous database to Supabase (DATABASE.md, "Moving existing
 * data").
 *
 *   tsx scripts/copy-database.ts check     compare the two, write nothing
 *   tsx scripts/copy-database.ts copy      copy into an EMPTY target
 *   tsx scripts/copy-database.ts replace   empty the target's tables, then copy
 *
 *   SOURCE_DATABASE_URL   where the data is now. When unset, the DATABASE_URL
 *                         in the repository's .env.local / .env is used.
 *   TARGET_DATABASE_URL   where it goes. Its tables must exist already
 *                         (`npm run db:migrate`, then `npm run db:bootstrap`).
 *   SOURCE_DATABASE_SSL, SOURCE_DATABASE_CA_CERT,
 *   TARGET_DATABASE_SSL, TARGET_DATABASE_CA_CERT   as DATABASE_SSL and
 *                         DATABASE_CA_CERT (src/prisma/tls.ts), per side.
 *
 * How it stays safe:
 *  - The source is only read, inside one read-only snapshot, so the copy is
 *    consistent even while the site is in use.
 *  - Everything written to the target happens in one transaction: either all
 *    tables arrive, or the target is left exactly as it was.
 *  - `copy` refuses a target that already holds rows.
 *  - It stops, before writing, when a column that holds data in the source
 *    has nowhere to go in the target.
 *  - Values travel as PostgreSQL's own text, so nothing is rounded or shifted
 *    (timestamps keep their microseconds).
 *  - The counters on posts are copied as they are: the triggers that maintain
 *    them are switched off while rows are inserted and back on before commit.
 *  - Sequences are moved past the copied ids, so new rows do not collide.
 */
import { existsSync, readFileSync } from "node:fs";
import { parse as parseEnvFile } from "dotenv";
import { Pool, type PoolClient } from "pg";
import { describeTls, poolConfig, resolveDatabaseUrl } from "../src/prisma/tls";
import { copyOrder, quoteIdent, rowsPerInsert, type ForeignKey } from "../src/lib/copy-plan";

type Mode = "check" | "copy" | "replace";

type Column = {
  name: string;
  type: string;
  notNull: boolean;
  hasDefault: boolean;
  generated: boolean;
  identity: boolean;
  sequence: string | null;
};

type Table = { name: string; columns: Column[]; primaryKey: string[] };

type Database = { tables: Map<string, Table>; foreignKeys: ForeignKey[]; triggers: Map<string, string[]> };

/** Every value as the text PostgreSQL sent, untouched. */
const asText = { getTypeParser: () => (value: string) => value };

const READ_BATCH = 2000;

function sourceUrl(): { url: string; from: string } {
  const explicit = process.env.SOURCE_DATABASE_URL?.trim();
  if (explicit) return { url: explicit, from: "SOURCE_DATABASE_URL" };
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const url = parseEnvFile(readFileSync(file))["DATABASE_URL"]?.trim();
    if (url && url !== "-") return { url, from: `DATABASE_URL in ${file}` };
  }
  throw new Error("No source database: set SOURCE_DATABASE_URL.");
}

function where(url: string): string {
  try {
    const parsed = new URL(url);
    // Anything else is not a connection URL, and its "path" could be the password.
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) return "(not a postgres:// URL)";
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "(connection string)";
  }
}

async function text<T extends Record<string, string | null>>(client: PoolClient, sql: string, values?: unknown[]): Promise<T[]> {
  const result = await client.query({ text: sql, values, types: asText as never });
  return result.rows as T[];
}

async function describe(client: PoolClient): Promise<Database> {
  const columns = await text<{
    table: string; name: string; type: string; not_null: string; has_default: string;
    generated: string; identity: string; sequence: string | null;
  }>(client, `
    SELECT c.relname AS "table", a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull::text AS not_null, a.atthasdef::text AS has_default,
           (a.attgenerated <> '')::text AS generated, (a.attidentity <> '')::text AS identity,
           pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) AS sequence
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname, a.attnum`);

  const keys = await text<{ table: string; name: string }>(client, `
    SELECT c.relname AS "table", a.attname AS name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(i.indkey) WITH ORDINALITY AS k(attnum, position) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public' AND i.indisprimary
    ORDER BY c.relname, k.position`);

  const foreignKeys = await text<{ child: string; parent: string; columns: string; nullable: string }>(client, `
    SELECT child.relname AS child, parent.relname AS parent,
           (SELECT string_agg(a.attname, ',' ORDER BY k.position)
              FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, position)
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS columns,
           (SELECT bool_and(NOT a.attnotnull)
              FROM unnest(con.conkey) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum)::text AS nullable
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_class parent ON parent.oid = con.confrelid
    WHERE con.contype = 'f'
      AND con.connamespace = 'public'::regnamespace
      AND parent.relnamespace = 'public'::regnamespace`);

  const triggers = await text<{ table: string; name: string }>(client, `
    SELECT c.relname AS "table", t.tgname AS name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace AND t.tgenabled <> 'D'`);

  const tables = new Map<string, Table>();
  for (const row of columns) {
    const table = tables.get(row.table) ?? { name: row.table, columns: [], primaryKey: [] };
    table.columns.push({
      name: row.name,
      type: row.type,
      notNull: row.not_null === "true",
      hasDefault: row.has_default === "true",
      generated: row.generated === "true",
      identity: row.identity === "true",
      sequence: row.sequence,
    });
    tables.set(row.table, table);
  }
  for (const row of keys) tables.get(row.table)?.primaryKey.push(row.name);

  const triggerMap = new Map<string, string[]>();
  for (const row of triggers) triggerMap.set(row.table, [...(triggerMap.get(row.table) ?? []), row.name]);

  return {
    tables,
    foreignKeys: foreignKeys.map((fk) => ({
      child: fk.child,
      parent: fk.parent,
      columns: (fk.columns ?? "").split(",").filter(Boolean),
      nullable: fk.nullable === "true",
    })),
    triggers: triggerMap,
  };
}

async function count(client: PoolClient, table: string): Promise<number> {
  const rows = await text<{ n: string }>(client, `SELECT count(*) AS n FROM public.${quoteIdent(table)}`);
  return Number(rows[0].n);
}

async function sameDatabase(source: PoolClient, target: PoolClient): Promise<boolean | null> {
  // Two connection strings can name one database (a pooler and a direct
  // host). The cluster id plus the database's own id tells them apart.
  const identity = async (client: PoolClient) => {
    try {
      await client.query("SAVEPOINT identity");
      const rows = await text<{ id: string }>(client, `
        SELECT (SELECT system_identifier::text FROM pg_control_system()) || '/' ||
               (SELECT oid::text FROM pg_database WHERE datname = current_database()) AS id`);
      await client.query("RELEASE SAVEPOINT identity");
      return rows[0].id;
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT identity");
      return null;
    }
  };
  const [a, b] = [await identity(source), await identity(target)];
  if (a === null || b === null) return null;
  return a === b;
}

function table(rows: string[][]): string {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  return rows.map((row) => row.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ")).join("\n");
}

async function main() {
  const mode = (process.argv[2] ?? "check") as Mode;
  if (!["check", "copy", "replace"].includes(mode)) throw new Error(`Unknown mode "${mode}". Use check, copy or replace.`);

  const source = sourceUrl();
  const targetUrl = process.env.TARGET_DATABASE_URL?.trim();
  if (!targetUrl) throw new Error("TARGET_DATABASE_URL is not set.");

  const sourceEnv = { DATABASE_SSL: process.env.SOURCE_DATABASE_SSL, DATABASE_CA_CERT: process.env.SOURCE_DATABASE_CA_CERT };
  const targetEnv = { DATABASE_SSL: process.env.TARGET_DATABASE_SSL, DATABASE_CA_CERT: process.env.TARGET_DATABASE_CA_CERT };
  console.log(`Source: ${where(source.url)}  (${source.from}; ${describeTls(resolveDatabaseUrl(source.url, sourceEnv).tls)})`);
  console.log(`Target: ${where(targetUrl)}  (${describeTls(resolveDatabaseUrl(targetUrl, targetEnv).tls)})`);
  console.log(`Mode:   ${mode}\n`);

  const sourcePool = new Pool({ ...poolConfig(source.url, sourceEnv), max: 1 });
  const targetPool = new Pool({ ...poolConfig(targetUrl, targetEnv), max: 1 });
  // A dropped idle connection must surface as a failed query, not crash the process.
  sourcePool.on("error", () => {});
  targetPool.on("error", () => {});

  const from = await sourcePool.connect();
  const to = await targetPool.connect();
  let committed = false;
  try {
    // One snapshot of the source; nothing can be written through it.
    await from.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await from.query("SET LOCAL datestyle TO 'ISO, YMD'");
    await from.query("SET LOCAL intervalstyle TO 'postgres'");
    await from.query("SET LOCAL extra_float_digits TO 3");
    await from.query("SET LOCAL bytea_output TO 'hex'");

    await to.query("BEGIN");
    await to.query("SET LOCAL datestyle TO 'ISO, YMD'");
    await to.query("SET LOCAL intervalstyle TO 'postgres'");

    // When the servers will not say who they are, fall back to the addresses.
    const same = (await sameDatabase(from, to)) ?? where(source.url) === where(targetUrl);
    if (same) throw new Error("Source and target are the same database. Nothing to copy.");

    const src = await describe(from);
    const dst = await describe(to);

    const shared = [...dst.tables.keys()].filter((name) => src.tables.has(name));
    const onlyInSource = [...src.tables.keys()].filter((name) => !dst.tables.has(name));
    const onlyInTarget = [...dst.tables.keys()].filter((name) => !src.tables.has(name));
    if (!shared.length) {
      throw new Error("The two databases have no table in common. Create the target's tables first (npm run db:migrate, npm run db:bootstrap).");
    }

    // ── What can and cannot be carried over ──────────────────────────────
    const problems: string[] = [];
    const notes: string[] = [];
    const plan = new Map<string, { columns: Column[]; sourceRows: number; targetRows: number }>();

    for (const name of shared) {
      const s = src.tables.get(name)!;
      const d = dst.tables.get(name)!;
      const sourceColumns = new Set(s.columns.map((column) => column.name));
      const targetColumns = new Map(d.columns.map((column) => [column.name, column]));
      const sourceRows = await count(from, name);

      for (const column of s.columns) {
        if (targetColumns.has(column.name)) continue;
        const holdsData = sourceRows > 0 && (await text(from, `SELECT 1 AS x FROM public.${quoteIdent(name)} WHERE ${quoteIdent(column.name)} IS NOT NULL LIMIT 1`)).length > 0;
        if (holdsData) problems.push(`${name}.${column.name} holds data in the source but the target has no such column.`);
        else notes.push(`${name}.${column.name} exists only in the source and is empty there; skipped.`);
      }
      for (const column of d.columns) {
        if (sourceColumns.has(column.name) || column.generated) continue;
        if (column.notNull && !column.hasDefault && !column.identity && sourceRows > 0) {
          problems.push(`${name}.${column.name} is required in the target but the source has no such column.`);
        } else {
          notes.push(`${name}.${column.name} exists only in the target; rows get its default.`);
        }
      }

      plan.set(name, {
        columns: d.columns.filter((column) => sourceColumns.has(column.name) && !column.generated),
        sourceRows,
        targetRows: await count(to, name),
      });
    }

    for (const name of onlyInSource) {
      const rows = await count(from, name);
      notes.push(`Table ${name} exists only in the source (${rows} row${rows === 1 ? "" : "s"}); not copied.`);
    }
    for (const name of onlyInTarget) notes.push(`Table ${name} exists only in the target; left as it is.`);

    const order = copyOrder(shared, dst.foreignKeys.filter((fk) => plan.has(fk.child) && plan.has(fk.parent)));
    for (const fk of order.deferred) {
      if (!dst.tables.get(fk.child)!.primaryKey.length) {
        problems.push(`${fk.child}.${fk.columns.join(",")} has to be filled in after its rows are inserted, but ${fk.child} has no primary key to find them by.`);
      }
    }
    problems.push(...order.problems);

    console.log(table([
      ["table", "source rows", "target rows"],
      ...order.tables.map((name) => [name, String(plan.get(name)!.sourceRows), String(plan.get(name)!.targetRows)]),
    ]));
    const totalSource = order.tables.reduce((sum, name) => sum + plan.get(name)!.sourceRows, 0);
    const occupied = order.tables.filter((name) => plan.get(name)!.targetRows > 0);
    console.log(`\n${totalSource} row(s) in ${order.tables.length} table(s) to copy.`);
    if (notes.length) console.log("\nNotes:\n" + notes.map((note) => `  - ${note}`).join("\n"));
    if (problems.length) console.log("\nProblems:\n" + problems.map((problem) => `  ✘ ${problem}`).join("\n"));

    if (mode === "check") {
      if (occupied.length) console.log(`\nThe target already holds rows in: ${occupied.join(", ")}. "copy" would refuse; "replace" would delete them first.`);
      console.log(problems.length ? "\n❌ A copy would stop on the problems above." : "\n✅ Nothing stands in the way of a copy. Nothing was written.");
      if (problems.length) process.exitCode = 1;
      return;
    }

    if (problems.length) throw new Error("Not copying: see the problems above. Nothing was written.");
    if (mode === "copy" && occupied.length) {
      throw new Error(`Not copying: the target already holds rows in ${occupied.join(", ")}. Use "replace" to delete the target's rows first. Nothing was written.`);
    }

    // ── Write ────────────────────────────────────────────────────────────
    const targets = order.tables.map((name) => `public.${quoteIdent(name)}`);
    if (mode === "replace") {
      // No CASCADE: a table outside this list that references one of these
      // makes the statement fail instead of being emptied without a word.
      await to.query(`TRUNCATE TABLE ${targets.join(", ")} RESTART IDENTITY`);
      console.log(`\nEmptied ${targets.length} table(s) in the target.`);
    }

    // The triggers keep counters (posts.likes_count, …) in step with inserts.
    // The counters are copied as values, so the triggers must not run too.
    const withTriggers = order.tables.filter((name) => dst.triggers.has(name));
    const eachTrigger = async (action: "DISABLE" | "ENABLE") => {
      for (const name of withTriggers) {
        for (const trigger of dst.triggers.get(name)!) {
          await to.query(`ALTER TABLE public.${quoteIdent(name)} ${action} TRIGGER ${quoteIdent(trigger)}`);
        }
      }
    };
    await eachTrigger("DISABLE");

    const copied = new Map<string, number>();
    const later: { fk: ForeignKey; rows: string[][] }[] = [];

    for (const name of order.tables) {
      const { columns, sourceRows } = plan.get(name)!;
      const d = dst.tables.get(name)!;
      const deferred = order.deferred.filter((fk) => fk.child === name);
      const deferredColumns = new Set(deferred.flatMap((fk) => fk.columns));
      const postponed = deferred.map((fk) => ({ fk, rows: [] as string[][] }));
      later.push(...postponed);

      const names = columns.map((column) => quoteIdent(column.name));
      const orderBy = d.primaryKey.length ? d.primaryKey.map(quoteIdent).join(", ") : "ctid";
      const overriding = d.columns.some((column) => column.identity) ? " OVERRIDING SYSTEM VALUE" : "";
      const perInsert = rowsPerInsert(columns.length);
      let done = 0;

      for (let offset = 0; ; offset += READ_BATCH) {
        const rows = await text<Record<string, string | null>>(
          from,
          `SELECT ${names.join(", ")} FROM public.${quoteIdent(name)} ORDER BY ${orderBy} LIMIT ${READ_BATCH} OFFSET ${offset}`,
        );
        if (!rows.length) break;

        for (const { fk, rows: kept } of postponed) {
          for (const row of rows) {
            if (fk.columns.some((column) => row[column] === null)) continue;
            kept.push([...d.primaryKey.map((key) => row[key]!), ...fk.columns.map((column) => row[column]!)]);
          }
        }

        for (let start = 0; start < rows.length; start += perInsert) {
          const chunk = rows.slice(start, start + perInsert);
          const values: (string | null)[] = [];
          const tuples = chunk.map((row) => {
            const placeholders = columns.map((column) => {
              values.push(deferredColumns.has(column.name) ? null : row[column.name]);
              return `$${values.length}`;
            });
            return `(${placeholders.join(", ")})`;
          });
          await to.query(`INSERT INTO public.${quoteIdent(name)} (${names.join(", ")})${overriding} VALUES ${tuples.join(", ")}`, values);
        }
        done += rows.length;
        if (rows.length < READ_BATCH) break;
      }

      if (done !== sourceRows) throw new Error(`${name}: read ${done} row(s) but counted ${sourceRows}. Nothing was written.`);
      copied.set(name, done);
    }

    // References that point back into a table still being filled (a repost of
    // a later post) were left empty above; fill them in now that every row exists.
    for (const { fk, rows } of later) {
      const d = dst.tables.get(fk.child)!;
      const typeOf = (column: string) => d.columns.find((c) => c.name === column)!.type;
      const keyed = [...d.primaryKey, ...fk.columns];
      const perUpdate = rowsPerInsert(keyed.length);
      for (let start = 0; start < rows.length; start += perUpdate) {
        const chunk = rows.slice(start, start + perUpdate);
        const values: string[] = [];
        const tuples = chunk.map((row) => `(${row.map((value, i) => { values.push(value); return `$${values.length}::${typeOf(keyed[i])}`; }).join(", ")})`);
        const alias = keyed.map((_, i) => `c${i}`);
        await to.query(
          `UPDATE public.${quoteIdent(fk.child)} AS t SET ${fk.columns.map((column, i) => `${quoteIdent(column)} = v.c${d.primaryKey.length + i}`).join(", ")}
           FROM (VALUES ${tuples.join(", ")}) AS v(${alias.join(", ")})
           WHERE ${d.primaryKey.map((key, i) => `t.${quoteIdent(key)} = v.c${i}`).join(" AND ")}`,
          values,
        );
      }
    }

    await eachTrigger("ENABLE");

    // Move every sequence past the ids that just arrived, and no further back
    // than the source's own counter, so ids of deleted rows are not handed out again.
    for (const name of order.tables) {
      for (const column of dst.tables.get(name)!.columns) {
        if (!column.sequence) continue;
        const max = (await text<{ max: string | null }>(to, `SELECT max(${quoteIdent(column.name)})::text AS max FROM public.${quoteIdent(name)}`))[0].max;
        let last = max === null ? null : BigInt(max);
        const sourceSequence = src.tables.get(name)!.columns.find((c) => c.name === column.name)?.sequence;
        if (sourceSequence) {
          try {
            await from.query("SAVEPOINT seq");
            const state = (await text<{ last_value: string; is_called: string }>(from, `SELECT last_value::text, is_called::text FROM ${sourceSequence}`))[0];
            await from.query("RELEASE SAVEPOINT seq");
            if (state.is_called === "true" && (last === null || BigInt(state.last_value) > last)) last = BigInt(state.last_value);
          } catch {
            await from.query("ROLLBACK TO SAVEPOINT seq"); // not readable: the largest id is enough
          }
        }
        if (last === null) await to.query("SELECT setval($1::regclass, 1, false)", [column.sequence]);
        else await to.query("SELECT setval($1::regclass, $2::bigint, true)", [column.sequence, last.toString()]);
      }
    }

    // Count again on the target before making it permanent.
    for (const name of order.tables) {
      const now = await count(to, name);
      if (now !== copied.get(name)) throw new Error(`${name}: the target holds ${now} row(s) after copying ${copied.get(name)}. Rolled back; nothing was written.`);
    }

    await to.query("COMMIT");
    committed = true;
    console.log(`\n✅ Copied ${[...copied.values()].reduce((a, b) => a + b, 0)} row(s) into ${order.tables.length} table(s).`);
  } finally {
    await from.query("ROLLBACK").catch(() => {});
    if (!committed) await to.query("ROLLBACK").catch(() => {});
    from.release();
    to.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main().catch((error) => {
  console.error(`\n❌ ${(error as Error)?.message ?? error}`);
  if ((error as { code?: string })?.code) console.error(`   (${(error as { code?: string }).code})`);
  process.exit(1);
});
