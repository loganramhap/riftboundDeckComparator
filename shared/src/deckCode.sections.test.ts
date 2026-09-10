/**
 * Unit tests for section-aware deck-code decoding (decodeWithSections).
 *
 * The deck-code format distinguishes three zones — chosen champion, main deck,
 * and sideboard — which decode to the "Chosen Champion", "Main Deck", and
 * "Sideboard" sections respectively.
 */

import { describe, it, expect } from "vitest";
import { getCodeFromDeck } from "@piltoverarchive/riftbound-deck-codes";
import { decodeWithSections } from "./deckCode.js";

describe("decodeWithSections", () => {
  it("maps deck-code zones to canonical sections", () => {
    // Build a code with a main deck, a sideboard, and a chosen champion.
    const code = getCodeFromDeck(
      [
        { cardCode: "OGN-001", count: 3 },
        { cardCode: "OGN-002", count: 2 },
      ],
      [{ cardCode: "OGN-003", count: 1 }],
      "OGN-007",
    );

    const result = decodeWithSections(code);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const { deck, sections } = result.value;

    // Main-deck cards are present with their counts and section.
    expect(deck.get("OGN-001")).toBe(3);
    expect(sections.get("OGN-001")).toBe("Main Deck");
    expect(sections.get("OGN-002")).toBe("Main Deck");

    // Sideboard card is in the Sideboard section.
    expect(deck.get("OGN-003")).toBe(1);
    expect(sections.get("OGN-003")).toBe("Sideboard");

    // Chosen champion is in the Chosen Champion section.
    expect(sections.get("OGN-007")).toBe("Chosen Champion");
  });

  it("returns an invalid-code error without throwing for garbage", () => {
    expect(() => decodeWithSections("!!!not-a-code!!!")).not.toThrow();
    const result = decodeWithSections("!!!not-a-code!!!");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_CODE");
    }
  });
});
