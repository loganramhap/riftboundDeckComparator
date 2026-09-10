/**
 * Unit tests for deck-name length boundaries in {@link validateName}.
 *
 * A submitted name of length 1 or 100 is accepted (returned unchanged via
 * `ok`). A name of length 101 is rejected with a `NAME_TOO_LONG` error via
 * `err`; because rejection is signalled through `err` (result.ok === false),
 * the caller retains the deck's prior name rather than applying the rejected
 * value.
 *
 * Validates: Requirements 8.1, 8.5
 */

import { describe, expect, it } from "vitest";
import { validateName } from "./nameResolver.js";

/** Build a name of exactly `length` characters. */
function nameOfLength(length: number): string {
  return "a".repeat(length);
}

describe("validateName: length boundaries (Reqs 8.1, 8.5)", () => {
  it("accepts a name of length 1", () => {
    const name = nameOfLength(1);
    const result = validateName(name);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(name);
    }
  });

  it("accepts a name of length 100 (upper bound)", () => {
    const name = nameOfLength(100);
    const result = validateName(name);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(name);
    }
  });

  it("rejects a name of length 101 with NAME_TOO_LONG", () => {
    const name = nameOfLength(101);
    const result = validateName(name);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NAME_TOO_LONG");
    }
  });

  it("retains the prior name on rejection by signalling failure (result.ok === false)", () => {
    const priorName = "My Deck";
    const submitted = nameOfLength(101);

    const result = validateName(submitted);

    // The function does not mutate or return the rejected value; it signals
    // rejection so the caller keeps the prior name.
    expect(result.ok).toBe(false);

    const resolvedName = result.ok ? result.value : priorName;
    expect(resolvedName).toBe(priorName);
  });
});
