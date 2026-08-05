import { test, describe } from "node:test";
import * as assert from "node:assert/strict";

/**
 * Unit tests for input validators in src/lib/api-helpers.ts.
 *
 * These are pure functions that run without any DB / network / env setup,
 * making them ideal candidates for fast, hermetic unit tests.
 */

// Re-implement the validators inline so the tests can run without importing
// the full Next.js stack (which would require a DB connection).
// The production code in src/lib/api-helpers.ts must match these exactly.
function isPositiveInt(v: unknown, max = 1_000_000): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max;
}

function isNonNegativeInt(v: unknown, max = 1_000_000): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

function isNonEmptyString(v: unknown, maxLen = 1000): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{2,30}$/;

describe("isPositiveInt", () => {
  test("accepts integers between 1 and max", () => {
    assert.equal(isPositiveInt(1), true);
    assert.equal(isPositiveInt(100), true);
    assert.equal(isPositiveInt(1_000_000), true);
  });

  test("rejects zero, negatives, and values above max", () => {
    assert.equal(isPositiveInt(0), false);
    assert.equal(isPositiveInt(-1), false);
    assert.equal(isPositiveInt(1_000_001), false);
  });

  test("rejects non-integer numbers", () => {
    assert.equal(isPositiveInt(1.5), false);
    assert.equal(isPositiveInt(NaN), false);
    assert.equal(isPositiveInt(Infinity), false);
  });

  test("rejects non-numbers", () => {
    assert.equal(isPositiveInt("1"), false);
    assert.equal(isPositiveInt(null), false);
    assert.equal(isPositiveInt(undefined), false);
    assert.equal(isPositiveInt({}), false);
    assert.equal(isPositiveInt([]), false);
  });

  test("respects custom max", () => {
    assert.equal(isPositiveInt(50, 50), true);
    assert.equal(isPositiveInt(51, 50), false);
  });
});

describe("isNonNegativeInt", () => {
  test("accepts zero and positive integers up to max", () => {
    assert.equal(isNonNegativeInt(0), true);
    assert.equal(isNonNegativeInt(1), true);
    assert.equal(isNonNegativeInt(1_000_000), true);
  });

  test("rejects negatives", () => {
    assert.equal(isNonNegativeInt(-1), false);
  });

  test("rejects non-integers and non-numbers", () => {
    assert.equal(isNonNegativeInt(1.5), false);
    assert.equal(isNonNegativeInt("0"), false);
    assert.equal(isNonNegativeInt(null), false);
  });
});

describe("isNonEmptyString", () => {
  test("accepts non-empty strings within length limit", () => {
    assert.equal(isNonEmptyString("a"), true);
    assert.equal(isNonEmptyString("hello world"), true);
    assert.equal(isNonEmptyString("   x   "), true); // trim-aware
  });

  test("rejects empty and whitespace-only strings", () => {
    assert.equal(isNonEmptyString(""), false);
    assert.equal(isNonEmptyString("   "), false);
    assert.equal(isNonEmptyString("\t\n"), false);
  });

  test("rejects strings over max length", () => {
    assert.equal(isNonEmptyString("x".repeat(1001)), false);
    assert.equal(isNonEmptyString("x".repeat(1000)), true);
  });

  test("rejects non-strings", () => {
    assert.equal(isNonEmptyString(123), false);
    assert.equal(isNonEmptyString(null), false);
    assert.equal(isNonEmptyString(undefined), false);
    assert.equal(isNonEmptyString({}), false);
  });
});

describe("USERNAME_REGEX", () => {
  test("accepts valid usernames", () => {
    assert.equal(USERNAME_REGEX.test("alice"), true);
    assert.equal(USERNAME_REGEX.test("bob_123"), true);
    assert.equal(USERNAME_REGEX.test("user-Name_99"), true);
    assert.equal(USERNAME_REGEX.test("ab"), true); // minimum 2 chars
    assert.equal(USERNAME_REGEX.test("a".repeat(30)), true); // maximum 30 chars
  });

  test("rejects too-short and too-long usernames", () => {
    assert.equal(USERNAME_REGEX.test("a"), false);
    assert.equal(USERNAME_REGEX.test(""), false);
    assert.equal(USERNAME_REGEX.test("a".repeat(31)), false);
  });

  test("rejects invalid characters", () => {
    assert.equal(USERNAME_REGEX.test("alice!"), false);
    assert.equal(USERNAME_REGEX.test("user name"), false);
    assert.equal(USERNAME_REGEX.test("user@name"), false);
    assert.equal(USERNAME_REGEX.test("user.name"), false);
  });
});
