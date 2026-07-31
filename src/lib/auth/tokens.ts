import "server-only";
import { and, eq, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { verificationTokens, users } from "@/db/schema";
import { generateToken, hashToken } from "./crypto";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h

export type TokenType = "email_verification" | "password_reset";

async function createVerificationToken(userId: string, type: TokenType, ttlMs: number) {
  const token = generateToken(24);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.insert(verificationTokens).values({
    userId,
    tokenHash,
    type,
    expiresAt,
  });

  return token;
}

export function createEmailVerificationToken(userId: string) {
  return createVerificationToken(userId, "email_verification", EMAIL_VERIFICATION_TTL_MS);
}

export function createPasswordResetToken(userId: string) {
  return createVerificationToken(userId, "password_reset", PASSWORD_RESET_TTL_MS);
}

/**
 * Looks up a still-valid, unused token of the given type and marks it used.
 * Returns the associated userId, or null if the token is invalid/expired/used.
 */
export async function consumeVerificationToken(
  rawToken: string,
  type: TokenType,
): Promise<string | null> {
  const tokenHash = hashToken(rawToken);

  const rows = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, tokenHash),
        eq(verificationTokens.type, type),
        isNull(verificationTokens.usedAt),
        gt(verificationTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db
    .update(verificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(verificationTokens.id, row.id));

  return row.userId;
}

/**
 * No email provider is configured in this environment (no SMTP/Resend/etc.
 * API keys are set), so we "deliver" links by logging them to the server
 * console. Swap this out for a real provider by reading its API key from
 * process.env once one is configured — the rest of the flow (token
 * generation/consumption) already works end-to-end.
 */
export async function deliverAuthLink(email: string, kind: TokenType, link: string) {
  const label = kind === "email_verification" ? "Verify your email" : "Reset your password";
  // eslint-disable-next-line no-console
  console.log(`\n[auth] ${label} for ${email}:\n  ${link}\n`);
}

export async function getUserByEmail(email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}
