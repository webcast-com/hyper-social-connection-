import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import {
  isSupabaseConfigured,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
  SUPABASE_URL,
} from "@/lib/supabase/config";

/**
 * Supabase Storage helpers (server-side).
 *
 * Uploads go to the `uploads` bucket (configurable via SUPABASE_STORAGE_BUCKET)
 * and return a public URL. The bucket is created lazily using the service-role
 * key when it is provided; otherwise uploads run as the signed-in user and
 * require the storage policies from `supabase/storage.sql`.
 */

function serviceRoleClient(): SupabaseClient | null {
  if (!isSupabaseConfigured || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureBucket(client: SupabaseClient, bucket: string) {
  const { data: existing } = await client.storage.getBucket(bucket);
  if (existing) return;
  const { error } = await client.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: 250 * 1024 * 1024, // 250 MB
  });
  if (error) {
    // Bucket may already exist (race) — treat as non-fatal.
    console.warn("[storage] bucket ensure failed:", error.message);
  }
}

/**
 * Uploads a file to Supabase Storage and resolves with its public URL.
 * Returns null when Supabase Storage is not available.
 */
export async function uploadToStorage(
  bucket: string,
  path: string,
  file: File,
  authenticatedClient?: SupabaseClient,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const admin = serviceRoleClient();
  const client = admin || authenticatedClient;
  if (!client) return null;

  try {
    if (admin) await ensureBucket(admin, bucket);
    const { data, error } = await client.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      console.warn("[storage] upload failed:", error.message);
      return null;
    }
    const { data: publicUrl } = client.storage.from(bucket).getPublicUrl(data.path);
    return publicUrl.publicUrl;
  } catch (error) {
    console.warn("[storage] upload threw:", (error as Error)?.message);
    return null;
  }
}

/** Default bucket used by the shared upload endpoint. */
export function defaultStorageBucket() {
  return SUPABASE_STORAGE_BUCKET;
}

/** Public URL for an object in a bucket (works with the anon key). */
export function getPublicUrl(bucket: string, path: string) {
  const client = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
