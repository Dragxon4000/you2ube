import { NextResponse } from "next/server";
import { db } from "@/db";
import { discordAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiError, ErrorCode, log, withAuth } from "@/lib/api-helpers";

/**
 * POST /api/auth/discord/unlink — remove the Discord link for the current user.
 * Cascade-safe: discord_accounts.user_id has ON DELETE CASCADE, but we
 * explicitly delete just the one row so the user stays logged in.
 */
export async function POST() {
  return withAuth(async ({ user }) => {
    try {
      const existing = await db
        .select({ id: discordAccounts.id })
        .from(discordAccounts)
        .where(eq(discordAccounts.userId, user.id))
        .then(r => r[0]);

      if (!existing) {
        return apiError(404, ErrorCode.NOT_FOUND, "No Discord account linked");
      }

      await db.delete(discordAccounts).where(eq(discordAccounts.userId, user.id));
      log("info", "Discord unlinked", { userId: user.id });
      return NextResponse.json({ success: true });
    } catch (err) {
      log("error", "Discord unlink failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to unlink Discord");
    }
  });
}
