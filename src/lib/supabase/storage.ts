import "server-only";
import {
  getSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

const DEFAULT_AVATAR_BUCKET = "avatars";

type UploadAvatarInput = {
  userId: string;
  file: File;
  extension: string;
};

export function getAvatarBucketName(): string {
  return process.env.SUPABASE_AVATAR_BUCKET ?? DEFAULT_AVATAR_BUCKET;
}

export function isSupabaseStorageConfigured(): boolean {
  return isSupabaseAdminConfigured();
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
