import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { discordAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  exchangeCodeForTokens,
  fetchDiscordUser,
  getDiscordConfig,
} from "@/lib/discord";
import { apiError, ErrorCode, log, withAuth } from "@/lib/api-helpers";

const STATE_COOKIE = "discord_oauth_state";

/**
 * GET /api/auth/discord/callback — Discord redirects here after authorization.
 *
 * Exchanges the code for tokens, fetches the user identity, and upserts a
 * discord_accounts row linked to the current session user. Redirects back
 * to the dashboard with a success/error query param.
 */
export async function GET(req: Request) {
  return withAuth(async ({ user }) => {
    const cfg = getDiscordConfig();
    if (!cfg) {
      return apiError(503, ErrorCode.INTERNAL, "Discord integration is not configured");
    }

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    if (error) {
      log("warn", "Discord OAuth user-denied or errored", { error, userId: user.id });
      return NextResponse.redirect(`${appUrl}/?discord=error&reason=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return apiError(400, ErrorCode.INVALID_INPUT, "Missing code or state");
    }

    // CSRF check.
    const cookieStore = await cookies();
    const expected = cookieStore.get(STATE_COOKIE)?.value;
    cookieStore.delete(STATE_COOKIE);
    if (!expected || expected !== state) {
      log("warn", "Discord OAuth state mismatch", { userId: user.id });
      return NextResponse.redirect(`${appUrl}/?discord=error&reason=state_mismatch`);
    }

    try {
      // Exchange code for tokens.
      const tokens = await exchangeCodeForTokens(code);
      if (!tokens.scope.split(" ").includes("identify")) {
        return NextResponse.redirect(`${appUrl}/?discord=error&reason=missing_scope`);
      }

      // Fetch identity.
      const discordUser = await fetchDiscordUser(tokens.access_token);

      // Check if this Discord account is already linked to a DIFFERENT user.
      const conflict = await db
        .select({ userId: discordAccounts.userId })
        .from(discordAccounts)
        .where(eq(discordAccounts.discordId, discordUser.id))
        .then(r => r[0]);
      if (conflict && conflict.userId !== user.id) {
        log("warn", "Discord account already linked to another user", {
          discordId: discordUser.id,
          conflictingUserId: conflict.userId,
          currentUserId: user.id,
        });
        return NextResponse.redirect(`${appUrl}/?discord=error&reason=already_linked`);
      }

      // Upsert link.
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
      await db
        .insert(discordAccounts)
        .values({
          userId: user.id,
          discordId: discordUser.id,
          discordUsername: discordUser.username,
          discordDiscriminator: discordUser.discriminator,
          discordGlobalName: discordUser.global_name,
          discordAvatar: discordUser.avatar,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt,
          scopes: tokens.scope,
        })
        .onConflictDoUpdate({
          target: discordAccounts.userId,
          set: {
            discordId: discordUser.id,
            discordUsername: discordUser.username,
            discordDiscriminator: discordUser.discriminator,
            discordGlobalName: discordUser.global_name,
            discordAvatar: discordUser.avatar,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiresAt: expiresAt,
            scopes: tokens.scope,
            updatedAt: new Date(),
          },
        });

      log("info", "Discord linked", { userId: user.id, discordId: discordUser.id });
      return NextResponse.redirect(`${appUrl}/?discord=linked`);
    } catch (err) {
      log("error", "Discord OAuth callback failed", { userId: user.id, error: (err as Error).message });
      return NextResponse.redirect(`${appUrl}/?discord=error&reason=callback_failed`);
    }
  });
}
