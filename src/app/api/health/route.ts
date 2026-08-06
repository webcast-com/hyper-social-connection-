import { db, hasDatabase } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabase) {
    return Response.json({ ok: true, db: false, warning: "DATABASE_URL not configured — running in offline fallback mode" });
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: true });
  } catch (err) {
    console.warn('[health] DB check failed:', (err as Error)?.message);
    return Response.json({ ok: false, db: false, error: (err as Error)?.message }, { status: 500 });
  }
}
