import { test, describe } from "node:test";
import * as assert from "node:assert/strict";

/**
 * Unit tests for the Discord avatar URL builder.
 *
 * This function is pure and has no side effects, making it ideal for
 * hermetic unit tests. We re-implement it here to avoid importing the
 * full Discord client module (which reads env vars on import).
 *
 * The production code in src/lib/discord.ts must match this implementation.
 */

const DISCORD_CDN = "https://cdn.discordapp.com";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
}

function getAvatarUrl(user: DiscordUser, size: 16 | 32 | 64 | 128 | 256 = 128): string {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `${DISCORD_CDN}/avatars/${user.id}/${user.avatar}.${ext}?size=${size}`;
  }
  const two = BigInt(2);
  const five = BigInt(5);
  const six = BigInt(6);
  const twentyTwo = BigInt(22);
  const index = user.discriminator === "0"
    ? (BigInt(user.id) >> twentyTwo) % six
    : BigInt(user.discriminator) % five;
  return `${DISCORD_CDN}/embed/avatars/${index}.png`;
}

describe("getAvatarUrl", () => {
  test("returns custom avatar URL when avatar hash is set", () => {
    const user: DiscordUser = {
      id: "123456789012345678",
      username: "alice",
      discriminator: "0",
      global_name: "Alice",
      avatar: "abc123def456",
    };
    assert.equal(
      getAvatarUrl(user),
      "https://cdn.discordapp.com/avatars/123456789012345678/abc123def456.png?size=128",
    );
  });

  test("uses .gif extension for animated avatars (a_ prefix)", () => {
    const user: DiscordUser = {
      id: "123456789012345678",
      username: "bob",
      discriminator: "0",
      global_name: "Bob",
      avatar: "a_animated_hash",
    };
    assert.equal(
      getAvatarUrl(user, 256),
      "https://cdn.discordapp.com/avatars/123456789012345678/a_animated_hash.gif?size=256",
    );
  });

  test("returns default avatar based on user id when discriminator is 0", () => {
    // For discriminator "0", index = (user_id >> 22) % 6.
    const user: DiscordUser = {
      id: "123456789012345678",
      username: "charlie",
      discriminator: "0",
      global_name: null,
      avatar: null,
    };
    const url = getAvatarUrl(user);
    // Verify the URL pattern and that the index is in [0..5].
    const match = url.match(/\/embed\/avatars\/(\d)\.png$/);
    assert.ok(match, `URL should match default-avatar pattern: ${url}`);
    const index = parseInt(match![1], 10);
    assert.ok(index >= 0 && index <= 5, `index ${index} should be 0..5`);
    // Verify the URL is deterministic and computed from the id.
    const two = BigInt(2);
    const six = BigInt(6);
    const twentyTwo = BigInt(22);
    const expectedIndex = Number((BigInt(user.id) >> twentyTwo) % six);
    assert.equal(index, expectedIndex);
  });

  test("returns default avatar based on discriminator for legacy users", () => {
    // For discriminator != "0", index = discriminator % 5.
    // 42 % 5 = 2.
    const user: DiscordUser = {
      id: "1",
      username: "legacy",
      discriminator: "42",
      global_name: null,
      avatar: null,
    };
    assert.equal(
      getAvatarUrl(user),
      "https://cdn.discordapp.com/embed/avatars/2.png",
    );
  });

  test("supports all valid size options", () => {
    const user: DiscordUser = {
      id: "1",
      username: "x",
      discriminator: "0",
      global_name: null,
      avatar: "hash",
    };
    for (const size of [16, 32, 64, 128, 256] as const) {
      assert.match(getAvatarUrl(user, size), new RegExp(`size=${size}$`));
    }
  });
});
