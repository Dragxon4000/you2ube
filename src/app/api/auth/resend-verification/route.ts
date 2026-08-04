import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createEmailVerificationToken, deliverAuthLink } from "@/lib/auth/tokens";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ success: true, message: "Email already verified." });
  }

  const token = await createEmailVerificationToken(user.id);
  const origin = new URL(request.url).origin;
  await deliverAuthLink(user.email, "email_verification", `${origin}/verify-email?token=${token}`);

  return NextResponse.json({
    success: true,
    message: "Verification link sent (check the server logs in this demo environment).",
  });
}
