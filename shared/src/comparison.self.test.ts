/**
 * Feature: riftbound-deck-comparator, Property 9: Comparing a deck with itself yields zero differences
 *
 * For any normalized deck, comparing it against itself produces a comparison
 * result containing zero Card Differences.
 *
 * Validates: Requirements 6.4
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { compare } from "./comparison.js";
import type { NormalizedDeck } from "./types.js";

/** Recognized set identifiers from the deck-code specification. */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/**
 * Generator for a normalized card identity key `SET-[prefix]number`:
 *   set          := [A-Z]{3}   (drawn from the recognized sets)
 *   numberPrefix := "" | "R" | "SP"
 *   number       := [0-9]+
 */
const identityArb: fc.Arbitrary<string> = fc
  .record({
    set: fc.constantFrom(...SETS),
    prefix: fc.constantFrom("", "R", "SP"),
    number: fc.integer({ min: 1, max: 999 }).map((n) => String(n)),
  })
  .map(({ set, prefix, number }) => `${set}-${prefix}${number}`);

/**
 * A NormalizedDeck: map from normalized identity key to a positive integer
 * quantity, with distinct keys. Includes the empty deck.
 */
const normalizedDeckArb: fc.Arbitrary<NormalizedDeck> = fc
  .uniqueArray(
    fc.record({
      identity: identityArb,
      qty: fc.integer({ min: 1, max: 99 }),
    }),
    { selector: (e) => e.identity, minLength: 0, maxLength: 30 },
  )
  .map((entries) => new Map(entries.map((e) => [e.identity, e.qty])));

describe("Property 9: Comparing a deck with itself yields zero differences", () => {
  it("compare(deck, deck) produces zero Card Differences", () => {
    fc.assert(
      fc.property(normalizedDeckArb, (deck) => {
        // Compare against a clone so no shared reference could mask a bug.
        const clone: NormalizedDeck = new Map(deck);
        const result = compare(deck, clone);

        expect(result.differences.length).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
