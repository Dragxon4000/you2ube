import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createUserWithProfile } from "@/lib/auth/users";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { isValidEmail, normalizeEmail, passwordError } from "@/lib/auth/validation";
import { createEmailVerificationToken, deliverAuthLink } from "@/lib/auth/tokens";

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

  if (typeof rawEmail !== "string" || !isValidEmail(rawEmail)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }

  const passwordProblem = passwordError(password ?? "");
  if (passwordProblem) {
    return NextResponse.json({ error: passwordProblem }, { status: 400 });
  }

  const email = normalizeEmail(rawEmail);

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const user = await createUserWithProfile(email, password as string);

  // Fire off an email verification link. No email provider is configured in
  // this environment, so the link is logged server-side instead of sent.
  const token = await createEmailVerificationToken(user.id);
  const origin = new URL(request.url).origin;
  await deliverAuthLink(
    email,
    "email_verification",
    `${origin}/verify-email?token=${token}`,
  );

  const sessionToken = await createSession(user.id);
  await setSessionCookie(sessionToken);

  return NextResponse.json({
    user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
  });
}
