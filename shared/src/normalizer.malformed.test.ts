/**
 * Unit tests for Deck_Normalizer malformed card code rejection (Req 5.5).
 *
 * A StructuredDeck that contains a single card code not matching the card code
 * grammar, placed among otherwise valid codes, must cause `normalize` to reject
 * the whole deck with a `MALFORMED_CARD_CODE` error that names the offending
 * code, and no normalized deck is produced.
 */

import { describe, it, expect } from "vitest";
import { normalize } from "./normalizer.js";
import type { StructuredDeck } from "./types.js";

describe("Deck_Normalizer normalize malformed code rejection (Req 5.5)", () => {
  it("rejects a deck with one malformed code, naming the offending code", () => {
    // Lowercase set id does not match [A-Z]{3}, so this code is malformed.
    const malformed = "ogn-007a";
    const deck: StructuredDeck = new Map([
      ["OGN-007a", 3],
      ["VEN-SP1", 2],
      [malformed, 1],
      ["RAD-R05", 1],
    ]);

    const result = normalize(deck);

    // No normalized deck is produced.
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected normalize to reject the deck");
    }

    expect(result.error.code).toBe("MALFORMED_CARD_CODE");
    // The offending code is named in the message.
    expect(result.error.message).toContain(malformed);
  });

  it("rejects a deck whose malformed code has a two-character variant", () => {
    // A two-character variant "ab" is outside variant := [a-z*]?, so it is malformed.
    const malformed = "OGN-007ab";
    const deck: StructuredDeck = new Map([
      ["VEN-SP1", 2],
      [malformed, 4],
    ]);

    const result = normalize(deck);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected normalize to reject the deck");
    }
    expect(result.error.code).toBe("MALFORMED_CARD_CODE");
    expect(result.error.message).toContain(malformed);
  });
});
