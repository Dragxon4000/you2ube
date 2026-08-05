/**
 * Discord integration — official APIs only.
 *
 * Used endpoints (all documented at https://discord.com/developers/docs):
 *   - POST https://discord.com/api/v10/oauth2/token            (token exchange + refresh)
 *   - GET  https://discord.com/api/v10/users/@me                 (user identity, requires `identify` scope)
 *   - GET  https://discord.com/api/v10/oauth2/@me                (confirm granted scopes)
 *   - POST https://discord.com/api/webhooks/{id}/{token}         (bot notifications via webhook)
 *   - CDN  https://cdn.discordapp.com/avatars/{id}/{hash}.png    (avatar URL builder)
 *
 * NOT used, by design:
 *   - /users/@me/channels          (DMs — forbidden)
 *   - /users/@me/relationships     (friends — forbidden)
 *   - /users/@me/guilds            (guild list — unnecessary scope)
 *   - Any undocumented / community-maintained endpoints.
 *
 * The module is a no-op when env vars are missing, so Discord remains optional.
 */

import { db } from "@/db";
import { discordAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { log } from "@/lib/api-helpers";

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_CDN = "https://cdn.discordapp.com";

export interface DiscordConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Webhook URL for bot notifications. Optional — notifications disabled when unset. */
  webhookUrl?: string;
  /** Client ID used for Rich Presence RPC handshake (often same as clientId). */
  rpcClientId?: string;
}

/**
 * Returns the Discord config from env vars, or null if not configured.
 * Routes should check this to decide whether to expose Discord features.
 */
export function getDiscordConfig(): DiscordConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const redirectUri =
    process.env.DISCORD_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/discord/callback`;

  return {
    clientId,
    clientSecret,
    redirectUri,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    rpcClientId: process.env.DISCORD_RPC_CLIENT_ID ?? clientId,
  };
}

export function isDiscordConfigured(): boolean {
  return getDiscordConfig() !== null;
}

export function isDiscordWebhookConfigured(): boolean {
  return !!getDiscordConfig()?.webhookUrl;
}

// ============================================================================
// OAuth2 URLs
// ============================================================================

/**
 * Build the official Discord OAuth2 authorization URL.
 * Scope `identify` is the minimum — gives id, username, avatar, discriminator, global_name.
 * We deliberately do NOT request `email`, `guilds`, `friends`, or DM-related scopes.
 */
export function buildAuthorizeUrl(state: string): string {
  const cfg = getDiscordConfig();
  if (!cfg) throw new Error("Discord not configured");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "identify",
    state,
    prompt: "consent",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

// ============================================================================
// Token exchange
// ============================================================================

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const cfg = getDiscordConfig();
  if (!cfg) throw new Error("Discord not configured");
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    log("error", "Discord token request failed", { status: res.status, body: text });
    throw new Error(`Discord token request failed: ${res.status}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const cfg = getDiscordConfig();
  if (!cfg) throw new Error("Discord not configured");
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  });
  return tokenRequest(body);
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const cfg = getDiscordConfig();
  if (!cfg) throw new Error("Discord not configured");
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return tokenRequest(body);
}

// ============================================================================
// User identity (GET /users/@me with `identify` scope)
// ============================================================================

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string; // "0" for modern usernames
  global_name: string | null;
  avatar: string | null;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    log("error", "Discord /users/@me failed", { status: res.status, body: text });
    throw new Error(`Discord /users/@me failed: ${res.status}`);
  }
  return (await res.json()) as DiscordUser;
}

/**
 * Build the official Discord CDN avatar URL. Falls back to the default
 * avatar (computed from discriminator or user id) when no custom avatar is set.
 */
export function getAvatarUrl(user: DiscordUser, size: 16 | 32 | 64 | 128 | 256 = 128): string {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `${DISCORD_CDN}/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
  }
  // Default avatar: for discriminator "0", use (user_id >> 22) % 6.
  const two = BigInt(2);
  const five = BigInt(5);
  const six = BigInt(6);
  const twentyTwo = BigInt(22);
  const index = user.discriminator === "0"
    ? (BigInt(user.id) >> twentyTwo) % six
    : BigInt(user.discriminator) % five;
  return `${DISCORD_CDN}/embed/avatars/${index}.png`;
}

// ============================================================================
// Token auto-refresh helper
// ============================================================================

/**
 * Returns a valid access token for the given user's Discord account,
 * transparently refreshing if expired. Returns null if no Discord link exists.
 */
export async function getValidAccessToken(userId: number): Promise<string | null> {
  const row = await db
    .select()
    .from(discordAccounts)
    .where(eq(discordAccounts.userId, userId))
    .then(r => r[0]);
  if (!row) return null;

  // Refresh 60s before actual expiry to avoid edge-case races.
  const safeExpiry = new Date(row.tokenExpiresAt.getTime() - 60_000);
  if (safeExpiry.getTime() > Date.now()) {
    return row.accessToken;
  }

  try {
    const refreshed = await refreshAccessToken(row.refreshToken);
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
    await db
      .update(discordAccounts)
      .set({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(discordAccounts.userId, userId));
    return refreshed.access_token;
  } catch (err) {
    log("error", "Discord token refresh failed", { userId, error: (err as Error).message });
    return null;
  }
}

// ============================================================================
// Bot notifications via Discord Webhook (official API)
// ============================================================================

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  thumbnail?: { url: string };
  author?: { name: string; icon_url?: string; url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
}

export interface WebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

/**
 * Send a notification via the configured Discord webhook. No-op when the
 * webhook URL is not configured. Returns true on success, false on failure
 * (failures are logged but never thrown — notifications are best-effort).
 */
export async function sendWebhookNotification(payload: WebhookPayload): Promise<boolean> {
  const cfg = getDiscordConfig();
  if (!cfg?.webhookUrl) return false;

  try {
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      log("warn", "Discord webhook failed", { status: res.status, body: text });
      return false;
    }
    return true;
  } catch (err) {
    log("error", "Discord webhook threw", { error: (err as Error).message });
    return false;
  }
}

// Color constants matching Discord's brand + our tier palette.
export const Colors = {
  you2ube: 0x6366f1, // indigo
  levelUp: 0x22c55e, // green
  achievement: 0xf59e0b, // amber
  badge: 0xec4899, // pink
  reward: 0x06b6d4, // cyan
} as const;

/**
 * Send a level-up notification to the Discord webhook for a specific user.
 * Only fires if: webhook is configured AND user has linked Discord AND
 * user has `notifyLevelUps` enabled.
 */
export async function notifyLevelUp(params: {
  userId: number;
  newLevel: number;
  newTitle: string;
}): Promise<void> {
  const row = await db
    .select()
    .from(discordAccounts)
    .where(eq(discordAccounts.userId, params.userId))
    .then(r => r[0]);
  if (!row || !row.notifyLevelUps) return;

  const avatarUrl = getAvatarUrl({
    id: row.discordId,
    username: row.discordUsername,
    discriminator: row.discordDiscriminator,
    global_name: row.discordGlobalName,
    avatar: row.discordAvatar,
  });

  await sendWebhookNotification({
    username: "you2ube",
    embeds: [{
      title: `🎉 ${row.discordGlobalName ?? row.discordUsername} reached Level ${params.newLevel}!`,
      description: `They've earned the title **${params.newTitle}** on you2ube.`,
      color: Colors.levelUp,
      author: {
        name: row.discordGlobalName ?? row.discordUsername,
        icon_url: avatarUrl,
      },
      timestamp: new Date().toISOString(),
      footer: { text: "you2ube progression" },
    }],
  });
}

/**
 * Send an achievement-unlocked notification. Same opt-in rules as notifyLevelUp.
 */
export async function notifyAchievement(params: {
  userId: number;
  name: string;
  description: string;
  icon: string;
  tier: string;
}): Promise<void> {
  const row = await db
    .select()
    .from(discordAccounts)
    .where(eq(discordAccounts.userId, params.userId))
    .then(r => r[0]);
  if (!row || !row.notifyAchievements) return;

  const avatarUrl = getAvatarUrl({
    id: row.discordId,
    username: row.discordUsername,
    discriminator: row.discordDiscriminator,
    global_name: row.discordGlobalName,
    avatar: row.discordAvatar,
  });

  const tierColors: Record<string, number> = {
    bronze: 0xb45309,
    silver: 0x94a3b8,
    gold: 0xf59e0b,
    diamond: 0x06b6d4,
  };

  await sendWebhookNotification({
    username: "you2ube",
    embeds: [{
      title: `${params.icon} Achievement Unlocked: ${params.name}`,
      description: params.description,
      color: tierColors[params.tier] ?? Colors.achievement,
      author: {
        name: row.discordGlobalName ?? row.discordUsername,
        icon_url: avatarUrl,
      },
      fields: [
        { name: "Tier", value: params.tier.toUpperCase(), inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "you2ube achievements" },
    }],
  });
}

/**
 * Send a badge-earned notification. Gated on notifyBadges preference.
 */
export async function notifyBadge(params: {
  userId: number;
  name: string;
  description: string;
  icon: string;
  tier: string;
}): Promise<void> {
  const row = await db
    .select()
    .from(discordAccounts)
    .where(eq(discordAccounts.userId, params.userId))
    .then(r => r[0]);
  if (!row || !row.notifyBadges) return;

  await sendWebhookNotification({
    username: "you2ube",
    embeds: [{
      title: `${params.icon} Badge Earned: ${params.name}`,
      description: params.description,
      color: Colors.badge,
      fields: [
        { name: "Tier", value: params.tier.toUpperCase(), inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}
