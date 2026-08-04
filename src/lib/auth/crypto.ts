import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/** Generates a URL-safe opaque random token (used for sessions & one-off links). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/** One-way hash used so raw tokens are never stored at rest. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
