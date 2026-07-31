import "server-only";
import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import { hashPassword } from "./crypto";
import { displayNameFromEmail } from "./validation";

/**
 * Creates a user row and its matching profile row atomically. This is the
 * single "automatic profile creation" path used by signup.
 */
export async function createUserWithProfile(email: string, password: string) {
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash })
      .returning();

    await tx.insert(profiles).values({
      userId: user.id,
      displayName: displayNameFromEmail(email),
    });

    return user;
  });
}
