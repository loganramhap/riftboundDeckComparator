/**
 * Unit tests for the Comparator's input routing and error attribution.
 *
 * These example tests cover the Comparator orchestration concerns that are not
 * covered by the pure-component property tests:
 *   - A mixed-method comparison (text + code) succeeds and both names resolve.
 *   - Missing input for a deck is rejected with a MISSING_INPUT error that
 *     names the deck (Req 1.6).
 *   - Input that does not match the selected method is rejected with the error
 *     attributed to the deck and input method (Req 1.7).
 *   - A deck that cannot be normalized (via the link path) yields a MISSING_DECK
 *     error naming the deck (Req 6.6).
 *
 * Validates: Requirements 1.5, 1.6, 1.7, 6.6
 */

import { describe, expect, it } from "vitest";
import { compare, type ImportedDeck, type LinkImporter } from "./comparator.js";
import { encode } from "./deckCode.js";
import { err, ok, type Result, type StructuredDeck } from "./types.js";

/**
 * A stub importer used by the text/code paths, which never invoke the link
 * path. It returns a fixed, valid imported deck; if a test unexpectedly routes
 * to it, the returned deck is well-formed so the failure surfaces elsewhere.
 */
const stubImporter: LinkImporter = {
  async import(): Promise<Result<ImportedDeck>> {
    return ok({ deck: new Map([["OGN-001", 1]]), sourceName: "Stub Source" });
  },
};

/**
 * Build a valid deck code by encoding a small structured deck. The Comparator's
 * code path decodes this back into a structured deck.
 */
function validDeckCode(): string {
  const deck: StructuredDeck = new Map([
    ["OGN-010", 2],
    ["VEN-SP1", 1],
  ]);
  const encoded = encode(deck);
  if (!encoded.ok) {
    throw new Error(`failed to build a valid deck code: ${encoded.error.message}`);
  }
  return encoded.value;
}

describe("Comparator input routing and errors", () => {
  it("succeeds for a mixed-method comparison (text + code) and resolves both names (Req 1.5)", async () => {
    const result = await compare(
      {
        first: { method: "text", raw: "3 OGN-007a\n1 VEN-SP1", userName: "Aggro" },
        second: { method: "code", raw: validDeckCode(), userName: "Control" },
      },
      stubImporter,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected success, got error ${result.error.code}`);
    }

    // Both user-entered names resolve (Req 8.3).
    expect(result.value.firstName).toBe("Aggro");
    expect(result.value.secondName).toBe("Control");

    // A comparison result is produced with the expected shape.
    expect(result.value.result).toHaveProperty("shared");
    expect(result.value.result).toHaveProperty("differences");
  });

  it("resolves position defaults when neither user nor source name is given (Req 1.5)", async () => {
    const result = await compare(
      {
        first: { method: "text", raw: "1 OGN-007a" },
        second: { method: "code", raw: validDeckCode() },
      },
      stubImporter,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected success, got error ${result.error.code}`);
    }
    expect(result.value.firstName).toBe("Deck 1");
    expect(result.value.secondName).toBe("Deck 2");
  });

  it("rejects a missing first input with a MISSING_INPUT error naming the deck (Req 1.6)", async () => {
    const result = await compare(
      {
        first: { method: "text", raw: "" },
        second: { method: "text", raw: "1 OGN-007a" },
      },
      stubImporter,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a missing-input error");
    }
    expect(result.error.code).toBe("MISSING_INPUT");
    expect(result.error.deck).toBe("first");
  });

  it("rejects a whitespace-only second input as missing, naming the second deck (Req 1.6)", async () => {
    const result = await compare(
      {
        first: { method: "text", raw: "1 OGN-007a" },
        second: { method: "text", raw: "   \n  \t " },
      },
      stubImporter,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a missing-input error");
    }
    expect(result.error.code).toBe("MISSING_INPUT");
    expect(result.error.deck).toBe("second");
  });

  it("attributes a text format mismatch to the deck and text method (Req 1.7)", async () => {
    const result = await compare(
      {
        first: { method: "text", raw: "not a valid decklist line" },
        second: { method: "text", raw: "1 OGN-007a" },
      },
      stubImporter,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a format-mismatch error");
    }
    // The error identifies the input method and the deck it belongs to.
    expect(result.error.inputMethod).toBe("text");
    expect(result.error.deck).toBe("first");
  });

  it("attributes a deck-code format mismatch to the deck and code method (Req 1.7)", async () => {
    const result = await compare(
      {
        first: { method: "text", raw: "1 OGN-007a" },
        second: { method: "code", raw: "!!!garbage-not-a-code!!!" },
      },
      stubImporter,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a format-mismatch error");
    }
    expect(result.error.inputMethod).toBe("code");
    expect(result.error.deck).toBe("second");
  });

  it("returns a MISSING_DECK error when an imported deck cannot be normalized (Req 6.6)", async () => {
    // A link importer whose deck contains a malformed card code so that
    // normalization fails; the Comparator maps this to a missing-deck error.
    const malformedImporter: LinkImporter = {
      async import(): Promise<Result<ImportedDeck>> {
        // Code-shaped (SET- prefix, no spaces) but malformed — the number is
        // missing — so normalization rejects it. (A plain name would instead
        // pass through as its own identity.)
        return ok({ deck: new Map([["OGN-", 3]]), sourceName: "Bad Source" });
      },
    };

    const result = await compare(
      {
        first: { method: "text", raw: "1 OGN-007a" },
        second: { method: "link", raw: "https://example.com/deck/123" },
      },
      malformedImporter,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a missing-deck error");
    }
    expect(result.error.code).toBe("MISSING_DECK");
    expect(result.error.deck).toBe("second");
  });

  it("propagates a link retrieval failure attributed to the link method (Req 1.7)", async () => {
    // Sanity check that a failing importer is attributed to the link path.
    const failingImporter: LinkImporter = {
      async import(): Promise<Result<ImportedDeck>> {
        return err({ code: "RETRIEVAL_FAILED", message: "could not retrieve" });
      },
    };

    const result = await compare(
      {
        first: { method: "text", raw: "1 OGN-007a" },
        second: { method: "link", raw: "https://example.com/deck/123" },
      },
      failingImporter,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a retrieval-failure error");
    }
    expect(result.error.inputMethod).toBe("link");
    expect(result.error.deck).toBe("second");
  });
});
