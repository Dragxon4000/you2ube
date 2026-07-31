import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/crypto";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email: rawEmail, password } = (body ?? {}) as {
    email?: string;
    password?: string;
  };

  if (typeof rawEmail !== "string" || !isValidEmail(rawEmail) || typeof password !== "string") {
    return NextResponse.json({ error: "Please provide a valid email and password." }, { status: 400 });
  }

  const email = normalizeEmail(rawEmail);
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const sessionToken = await createSession(user.id);
  await setSessionCookie(sessionToken);

  return NextResponse.json({
    user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
  });
}
