/**
 * Unit tests for Deck_Code_Decoder invalid-input handling.
 *
 * Empty and garbage deck codes must return an invalid-code error
 * (`code === "INVALID_CODE"`) without throwing, rather than surfacing the
 * underlying library exception.
 *
 * Validates: Requirements 3.2
 */

import { describe, expect, it } from "vitest";
import { decode } from "./deckCode.js";

/** A spread of empty and garbage inputs that are not valid deck codes. */
const invalidCodes: { name: string; code: string }[] = [
  { name: "empty string", code: "" },
  { name: "whitespace only", code: "   " },
  { name: "random letters", code: "not-a-deck-code" },
  { name: "punctuation garbage", code: "!!!@@@###" },
  { name: "invalid base32 characters", code: "0189" },
  { name: "arbitrary word", code: "hello" },
  { name: "json-ish garbage", code: "{\"foo\":\"bar\"}" },
  { name: "unicode garbage", code: "🎴🃏🀄" },
  { name: "truncated-looking code", code: "AB" },
  { name: "long random string", code: "zzzzzzzzzzzzzzzzzzzzzzzzzzzz" },
];

describe("decode: invalid deck code handling (Req 3.2)", () => {
  it.each(invalidCodes)("does not throw for $name", ({ code }) => {
    expect(() => decode(code)).not.toThrow();
  });

  it.each(invalidCodes)("returns an invalid-code error for $name", ({ code }) => {
    const result = decode(code);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CODE");
      // No structured deck is produced on failure.
      expect(result).not.toHaveProperty("value");
    }
  });
});
