import { test, describe } from "node:test";
import * as assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";

/**
 * Unit tests for the timing-safe string comparison helper used in the
 * Discord OAuth callback.
 *
 * The production implementation in src/app/api/auth/discord/callback/route.ts
 * must match this.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(a, "utf-8"));
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
}

describe("safeCompare (OAuth state verification)", () => {
  test("returns true for identical strings", () => {
    assert.equal(safeCompare("hello", "hello"), true);
    assert.equal(safeCompare("", ""), true);
    const long = "a".repeat(64);
    assert.equal(safeCompare(long, long), true);
  });

  test("returns false for different strings of same length", () => {
    assert.equal(safeCompare("hello", "world"), false);
    assert.equal(safeCompare("aaaa", "aaab"), false);
  });

  test("returns false for different-length strings without throwing", () => {
    assert.equal(safeCompare("short", "a-much-longer-string"), false);
    assert.equal(safeCompare("", "x"), false);
    assert.equal(safeCompare("abc", ""), false);
  });

  test("does not reveal length via thrown error", () => {
    // If safeCompare threw on length mismatch, an attacker could measure
    // response time to guess the token length. We verify it doesn't throw.
    assert.doesNotThrow(() => safeCompare("x", "yyyyyyyyy"));
    assert.doesNotThrow(() => safeCompare("", "abc"));
  });

  test("is byte-exact (not locale-aware)", () => {
    // Confirms comparison is byte-level — important for OAuth tokens which
    // are hex strings.
    assert.equal(safeCompare("CAFÉ", "café"), false);
    assert.equal(safeCompare("abc123", "ABC123"), false);
  });
});
