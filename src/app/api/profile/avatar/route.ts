import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { validateAvatarFile } from "@/lib/profile/validation";
import {
  deleteAvatarFromStorage,
  isSupabaseStorageConfigured,
  uploadAvatarToStorage,
} from "@/lib/supabase/storage";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing avatar file." }, { status: 400 });
  }

  const validation = validateAvatarFile(file);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const current = await db
    .select({ avatarPath: profiles.avatarPath })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  try {
    const uploaded = await uploadAvatarToStorage({
      userId: user.id,
      file,
      extension: validation.extension,
    });

    const [profile] = await db
      .update(profiles)
      .set({
        avatarUrl: uploaded.publicUrl,
        avatarPath: uploaded.path,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, user.id))
      .returning();

    if (current[0]?.avatarPath && current[0].avatarPath !== uploaded.path) {
      await deleteAvatarFromStorage(current[0].avatarPath);
    }

    return NextResponse.json({ profile, avatarUrl: uploaded.publicUrl });
  } catch (error) {
    console.error("[profile] Avatar upload failed:", error);
    return NextResponse.json({ error: "Avatar upload failed." }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const current = await db
    .select({ avatarPath: profiles.avatarPath })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  await deleteAvatarFromStorage(current[0]?.avatarPath);

  const [profile] = await db
    .update(profiles)
    .set({
      avatarUrl: null,
      avatarPath: null,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, user.id))
    .returning();

  return NextResponse.json({ profile });
}
