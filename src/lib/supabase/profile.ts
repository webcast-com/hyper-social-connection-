import { db, hasDatabase } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { supabase } from "@/db/supabase";
import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/config";
import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Maps a Supabase Auth user to a row in the public `users` table.
 *
 * The `users.auth_id` column (uuid, unique) links the two. When a Supabase
 * account has no profile row yet (brand new signup, or an OAuth login for an
 * email that only exists as a legacy account) one is created/linked so the
 * rest of the app can keep using `users.id` everywhere.
 *
 * DB writes go through drizzle when DATABASE_URL is set, otherwise they fall
 * back to the Supabase REST API (requires the RLS policies from
 * `supabase/policies.sql`). Every failure is swallowed — the app falls back
 * to the demo viewer rather than 500-ing.
 */

/**
 * REST client for the profile fallback. Writes MUST run as the service role:
 * the anonymous client carries no user session here, so `auth.uid()` is NULL
 * and the `users_insert_own` / `users_update_own` RLS policies reject every
 * profile insert/update. That silently leaves sign-ups with a row in
 * `auth.users` but none in `public.users` — invisible across the app.
 */
let adminClient: SupabaseClient | null = null;
function restClient(): SupabaseClient {
  if (SUPABASE_SERVICE_ROLE_KEY) {
    if (!adminClient) {
      adminClient = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return adminClient;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[profile] SUPABASE_SERVICE_ROLE_KEY is not set: profile sync without " +
        "DATABASE_URL will be blocked by RLS. Set it (or DATABASE_URL) so " +
        "sign-ups and logins get a public.users row.",
    );
  }
  return supabase;
}

async function findProfileByAuthId(authId: string): Promise<any | null> {
  try {
    if (hasDatabase) {
      const res = await db.select().from(users).where(eq(users.authId, authId)).limit(1);
      if (res[0]) return res[0];
      return null;
    }
    const { data } = await restClient().from("users").select("*").eq("auth_id", authId).maybeSingle();
    return data || null;
  } catch (e) {
    console.warn("[profile] auth_id lookup failed:", (e as Error)?.message);
    return null;
  }
}

async function findProfileByEmail(email?: string): Promise<any | null> {
  if (!email) return null;
  try {
    if (hasDatabase) {
      const res = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return res[0] || null;
    }
    const { data } = await restClient().from("users").select("*").eq("email", email).maybeSingle();
    return data || null;
  } catch (e) {
    console.warn("[profile] email lookup failed:", (e as Error)?.message);
    return null;
  }
}

async function linkAuthId(userId: number, authId: string) {
  try {
    if (hasDatabase) {
      await db.update(users).set({ authId }).where(eq(users.id, userId));
      return;
    }
    await restClient().from("users").update({ auth_id: authId }).eq("id", userId);
  } catch (e) {
    console.warn("[profile] auth link failed:", (e as Error)?.message);
  }
}

async function createProfile(authUser: User): Promise<any | null> {
  const meta = (authUser.user_metadata || {}) as Record<string, any>;
  const name =
    (meta.name as string) ||
    (meta.full_name as string) ||
    (authUser.email?.split("@")[0] || "Hyper user");
  const email = authUser.email || `${authUser.id}@hyper.local`;
  const avatar = (meta.avatar_url as string) || (meta.picture as string) || null;

  try {
    if (hasDatabase) {
      const res = await db
        .insert(users)
        .values({
          name,
          email,
          password: "", // Supabase Auth owns the password now
          avatar,
          authId: authUser.id,
        })
        .returning();
      return res[0] || null;
    }
    const { data, error } = await restClient()
      .from("users")
      .insert({ name, email, password: "", avatar, auth_id: authUser.id })
      .select()
      .single();
    if (error) throw error;
    return data || null;
  } catch (e) {
    // Race: profile was just created by another request — try to read it.
    console.warn("[profile] create failed, retrying read:", (e as Error)?.message);
    return findProfileByAuthId(authUser.id);
  }
}

/**
 * Ensures a profile row exists for a Supabase Auth user and returns it.
 * Returns null when neither the DB nor Supabase are reachable.
 */
export async function ensureProfileForSupabaseUser(authUser: User): Promise<any | null> {
  try {
    const byAuthId = await findProfileByAuthId(authUser.id);
    if (byAuthId) return byAuthId;

    const byEmail = await findProfileByEmail(authUser.email ?? undefined);
    if (byEmail) {
      await linkAuthId(byEmail.id, authUser.id);
      return { ...byEmail, authId: authUser.id };
    }

    return await createProfile(authUser);
  } catch (e) {
    console.warn("[profile] ensureProfile failed:", (e as Error)?.message);
    return null;
  }
}
