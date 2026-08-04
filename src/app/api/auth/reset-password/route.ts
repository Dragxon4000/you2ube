import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { hashPassword } from "@/lib/auth/crypto";
import { consumeVerificationToken } from "@/lib/auth/tokens";
import { passwordError } from "@/lib/auth/validation";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { token, password } = (body ?? {}) as { token?: string; password?: string };

  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "Missing or invalid reset token." }, { status: 400 });
  }

  const passwordProblem = passwordError(password ?? "");
  if (passwordProblem) {
    return NextResponse.json({ error: passwordProblem }, { status: 400 });
  }

  const userId = await consumeVerificationToken(token, "password_reset");
  if (!userId) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password as string);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

  // Invalidate all existing sessions for this user for safety.
  await db.delete(sessions).where(eq(sessions.userId, userId));

  return NextResponse.json({ success: true });
}
