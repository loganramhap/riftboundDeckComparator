/**
 * Property-based test for the Deck_Code_Decoder.
 *
 * Feature: riftbound-deck-comparator, Property 4: Deck code canonical round trip
 *
 * For any structured deck the Deck_Code_Decoder can encode (valid Card Codes
 * with positive integer counts), decoding then encoding then decoding produces
 * a structured deck equivalent to decoding the first encoding — the same set of
 * Card Codes each mapped to the same quantities — where equivalence is taken
 * over the deck-code library's canonical form (signed variants normalized to
 * `s`, `SP` numbers unpadded).
 *
 * Validates: Requirements 3.1, 3.3, 3.4
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decode, encode } from "./deckCode.js";
import type { StructuredDeck } from "./types.js";

// Set identifiers recognized by the deck-code library.
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

// Variant suffixes the library accepts. Note `*` and `s` both map to the same
// numeric variant (signed) and the library canonicalizes both to `s` on decode.
const VARIANTS = ["", "a", "s", "*", "b"] as const;

/**
 * Generator for a single valid card code of the form `SET-[prefix]number[variant]`
 * that the library both encodes and decodes. We draw a set, a number prefix
 * ("" | R | SP), a positive number, and a variant. These are the forms the
 * library's `parseCardCode` regex `^((?:R|SP)?\d+)([a-z*]?)$` accepts.
 */
const cardCodeArb = fc
  .record({
    set: fc.constantFrom(...SETS),
    prefix: fc.constantFrom("", "R", "SP"),
    number: fc.integer({ min: 1, max: 999 }),
    variant: fc.constantFrom(...VARIANTS),
  })
  .map(({ set, prefix, number, variant }) => `${set}-${prefix}${number}${variant}`);

/**
 * Generator for a structured deck: a non-empty map of card codes to positive
 * integer counts. Counts are kept in a deck-legal range (1..12) so the library
 * uses its standard encoding paths. Because distinct generated codes can
 * collapse to the same canonical code on decode, we build the deck from a set
 * of codes with independently chosen counts; any collisions are resolved by the
 * canonical baseline (see the test body).
 */
const structuredDeckArb: fc.Arbitrary<StructuredDeck> = fc
  .array(
    fc.tuple(cardCodeArb, fc.integer({ min: 1, max: 12 })),
    { minLength: 1, maxLength: 20 },
  )
  .map((entries) => {
    const deck: StructuredDeck = new Map();
    for (const [code, count] of entries) {
      // Last write wins for identical raw keys; canonicalization is handled by
      // deriving the baseline from the first encode/decode.
      deck.set(code, count);
    }
    return deck;
  });

/**
 * Compare two structured decks for equivalence: identical sets of card codes,
 * each mapped to identical quantities.
 */
function decksEqual(a: StructuredDeck, b: StructuredDeck): boolean {
  if (a.size !== b.size) return false;
  for (const [code, count] of a) {
    if (b.get(code) !== count) return false;
  }
  return true;
}

describe("Deck_Code_Decoder canonical round trip", () => {
  it("decode(encode(D0)) equals D0 for any encodable structured deck", () => {
    fc.assert(
      fc.property(structuredDeckArb, (deck) => {
        // Encode the generated deck. The generator only produces codes and
        // counts the library accepts, so this must succeed.
        const firstEncode = encode(deck);
        expect(firstEncode.ok).toBe(true);
        if (!firstEncode.ok) return;

        // Decode to obtain the library's canonical baseline D0. This collapses
        // any input codes that share a canonical form (e.g. `s`/`*`, padded/
        // unpadded numbers) into their canonical representation.
        const d0Result = decode(firstEncode.value);
        expect(d0Result.ok).toBe(true);
        if (!d0Result.ok) return;
        const d0 = d0Result.value;

        // Round trip the canonical deck: encode(D0) -> decode.
        const secondEncode = encode(d0);
        expect(secondEncode.ok).toBe(true);
        if (!secondEncode.ok) return;

        const roundTripped = decode(secondEncode.value);
        expect(roundTripped.ok).toBe(true);
        if (!roundTripped.ok) return;

        // The round-tripped deck must equal the canonical baseline.
        expect(decksEqual(roundTripped.value, d0)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
