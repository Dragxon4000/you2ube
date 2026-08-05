import { NextResponse } from "next/server";
import { db } from "@/db";
import { discordAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  apiError, ErrorCode, log, parseJsonBody, withAuth,
} from "@/lib/api-helpers";

interface PreferencesBody {
  notifyLevelUps?: unknown;
  notifyAchievements?: unknown;
  notifyBadges?: unknown;
  richPresenceEnabled?: unknown;
}

/**
 * GET /api/auth/discord/preferences — read current Discord preferences.
 */
export async function GET() {
  return withAuth(async ({ user }) => {
    const row = await db
      .select()
      .from(discordAccounts)
      .where(eq(discordAccounts.userId, user.id))
      .then(r => r[0]);
    if (!row) {
      return apiError(404, ErrorCode.NOT_FOUND, "No Discord account linked");
    }
    return NextResponse.json({
      notifyLevelUps: row.notifyLevelUps,
      notifyAchievements: row.notifyAchievements,
      notifyBadges: row.notifyBadges,
      richPresenceEnabled: row.richPresenceEnabled,
    });
  });
}

/**
 * POST /api/auth/discord/preferences — update notification + RPC prefs.
 */
export async function POST(req: Request) {
  return withAuth(async ({ user }) => {
    const body = await parseJsonBody<PreferencesBody>(req);
    if (!body.ok) return body.response;

    const existing = await db
      .select({ id: discordAccounts.id })
      .from(discordAccounts)
      .where(eq(discordAccounts.userId, user.id))
      .then(r => r[0]);
    if (!existing) {
      return apiError(404, ErrorCode.NOT_FOUND, "No Discord account linked");
    }

    const { notifyLevelUps, notifyAchievements, notifyBadges, richPresenceEnabled } = body.data;
    const set: Record<string, boolean | Date> = { updatedAt: new Date() };

    if (typeof notifyLevelUps === "boolean") set.notifyLevelUps = notifyLevelUps;
    if (typeof notifyAchievements === "boolean") set.notifyAchievements = notifyAchievements;
    if (typeof notifyBadges === "boolean") set.notifyBadges = notifyBadges;
    if (typeof richPresenceEnabled === "boolean") set.richPresenceEnabled = richPresenceEnabled;

    try {
      await db.update(discordAccounts).set(set).where(eq(discordAccounts.userId, user.id));
      return NextResponse.json({ success: true });
    } catch (err) {
      log("error", "Failed to update Discord preferences", {
        userId: user.id,
        error: (err as Error).message,
      });
      return apiError(500, ErrorCode.INTERNAL, "Failed to update preferences");
    }
  });
}
