import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { parseProfileUpdate } from "@/lib/profile/validation";
import { displayNameFromEmail } from "@/lib/auth/validation";

async function getOrCreateProfile(userId: string, email: string) {
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (existing[0]) return existing[0];

  const [profile] = await db
    .insert(profiles)
    .values({
      userId,
      displayName: displayNameFromEmail(email),
    })
    .returning();

  return profile;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const profile = await getOrCreateProfile(user.id, user.email);
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = parseProfileUpdate(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const [profile] = await db
    .update(profiles)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, user.id))
    .returning();

  if (!profile) {
    const [created] = await db
      .insert(profiles)
      .values({
        userId: user.id,
        ...parsed.data,
      })
      .returning();
    return NextResponse.json({ profile: created });
  }

  return NextResponse.json({ profile });
}
