import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_AVATAR_BUCKET = "avatars";

type UploadAvatarInput = {
  userId: string;
  file: File;
  extension: string;
};

let cachedClient: SupabaseClient | null = null;

function getSupabaseUrl(): string | null {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

function getSupabaseServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? null;
}

export function getAvatarBucketName(): string {
  return process.env.SUPABASE_AVATAR_BUCKET ?? DEFAULT_AVATAR_BUCKET;
}

export function isSupabaseStorageConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

export function getSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cachedClient ??= createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

export async function uploadAvatarToStorage({
  userId,
  file,
  extension,
}: UploadAvatarInput): Promise<{ path: string; publicUrl: string }> {
  const supabase = getSupabaseAdminClient();
  const bucket = getAvatarBucketName();
  const path = `${userId}/avatar-${Date.now()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function deleteAvatarFromStorage(path: string | null | undefined): Promise<void> {
  if (!path) return;
  if (!isSupabaseStorageConfigured()) return;

  const supabase = getSupabaseAdminClient();
  const bucket = getAvatarBucketName();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) {
    console.error("[supabase] Failed to delete avatar:", error.message);
  }
}
