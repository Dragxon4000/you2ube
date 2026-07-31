import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { createPasswordResetToken, deliverAuthLink, getUserByEmail } from "@/lib/auth/tokens";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email: rawEmail } = (body ?? {}) as { email?: string };

  if (typeof rawEmail !== "string" || !isValidEmail(rawEmail)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }

  const email = normalizeEmail(rawEmail);
  const user = await getUserByEmail(email);

  // Always respond with success to avoid leaking which emails are registered.
  if (user) {
    const token = await createPasswordResetToken(user.id);
    const origin = new URL(request.url).origin;
    const link = `${origin}/reset-password?token=${token}`;
    await deliverAuthLink(email, "password_reset", link);
  }

  return NextResponse.json({
    success: true,
    message:
      "If an account exists for that email, a password reset link has been sent (check the server logs in this demo environment since no email provider is configured).",
  });
}
