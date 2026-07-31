import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { consumeVerificationToken } from "@/lib/auth/tokens";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { token } = (body ?? {}) as { token?: string };

  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "Missing or invalid verification token." }, { status: 400 });
  }

  const userId = await consumeVerificationToken(token, "email_verification");
  if (!userId) {
    return NextResponse.json(
      { error: "This verification link is invalid or has expired." },
      { status: 400 },
    );
  }

  await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(eq(users.id, userId));

  return NextResponse.json({ success: true });
}
