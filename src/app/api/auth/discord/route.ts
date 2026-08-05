import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { buildAuthorizeUrl, getDiscordConfig } from "@/lib/discord";
import { apiError, ErrorCode, withAuth } from "@/lib/api-helpers";

const STATE_COOKIE = "discord_oauth_state";
const STATE_MAX_AGE = 60 * 10; // 10 minutes

/**
 * GET /api/auth/discord — kick off the Discord OAuth2 flow.
 *
 * Redirects the user to Discord's official authorization page with only the
 * `identify` scope (id, username, avatar, discriminator, global_name).
 * No email, guilds, friends, or DM scopes are requested.
 */
export async function GET() {
  return withAuth(async () => {
    const cfg = getDiscordConfig();
    if (!cfg) {
      return apiError(503, ErrorCode.INTERNAL, "Discord integration is not configured");
    }

    // CSRF state parameter — stored in an httpOnly cookie, verified on callback.
    const state = randomBytes(24).toString("hex");
    const cookieStore = await cookies();
    cookieStore.set({
      name: STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STATE_MAX_AGE,
    });

    return NextResponse.redirect(buildAuthorizeUrl(state));
  });
}
