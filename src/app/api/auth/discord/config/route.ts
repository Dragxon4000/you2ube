import { NextResponse } from "next/server";
import { getDiscordConfig, isDiscordConfigured, isDiscordWebhookConfigured } from "@/lib/discord";

/**
 * GET /api/auth/discord/config — public endpoint (no auth required) that tells
 * the client whether Discord features are enabled. Does NOT leak secrets —
 * only returns booleans and the RPC client ID (which is public anyway).
 */
export async function GET() {
  const cfg = getDiscordConfig();
  return NextResponse.json({
    configured: isDiscordConfigured(),
    webhooksEnabled: isDiscordWebhookConfigured(),
    rpcClientId: cfg?.rpcClientId ?? null,
    // authorizeUrl is built client-side by redirecting to /api/auth/discord.
  });
}
