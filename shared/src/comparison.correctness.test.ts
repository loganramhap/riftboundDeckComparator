/**
 * Feature: riftbound-deck-comparator, Property 7: Comparison correctness
 *
 * For any pair of normalized decks, the comparison result records, for every
 * Normalized Card Identity present in either deck, that deck's actual quantity
 * in each deck (zero where absent), and classifies the identity as a Shared
 * Card exactly when the two per-deck quantities are equal and as a Card
 * Difference exactly when they differ; every identity present in either deck
 * appears in exactly one of the two result sets. Empty decks are included to
 * cover Requirement 6.7.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.7
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { compare } from "./comparison.js";
import type { NormalizedDeck } from "./types.js";

/** Recognized set identifiers from the deck-code specification. */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/**
 * Generator for a normalized card identity key `SET-[prefix]number`.
 * A small number pool ensures the two generated decks share identities
 * frequently, exercising both the Shared and Card Difference branches.
 */
const identityArb: fc.Arbitrary<string> = fc
  .record({
    set: fc.constantFrom(...SETS),
    prefix: fc.constantFrom("", "R", "SP"),
    number: fc.integer({ min: 1, max: 20 }).map((n) => String(n)),
  })
  .map(({ set, prefix, number }) => `${set}-${prefix}${number}`);

/**
 * Generator for a NormalizedDeck: a Map from identity key to a positive
 * integer quantity. Includes the empty map (minLength 0) to cover 6.7.
 */
const normalizedDeckArb: fc.Arbitrary<NormalizedDeck> = fc
  .array(
    fc.record({
      identity: identityArb,
      quantity: fc.integer({ min: 1, max: 99 }),
    }),
    { minLength: 0, maxLength: 25 },
  )
  .map((entries) => {
    const deck: NormalizedDeck = new Map();
    // Last write wins, yielding a well-formed map of identity -> quantity.
    for (const { identity, quantity } of entries) {
      deck.set(identity, quantity);
    }
    return deck;
  });

describe("Property 7: Comparison correctness", () => {
  it("records actual per-deck quantities and classifies shared vs. different", () => {
    fc.assert(
      fc.property(normalizedDeckArb, normalizedDeckArb, (first, second) => {
        const result = compare(first, second);

        const union = new Set<string>([...first.keys(), ...second.keys()]);

        // Every identity in either deck appears in exactly one result set.
        const sharedIdentities = result.shared.map((e) => e.identity);
        const diffIdentities = result.differences.map((e) => e.identity);
        const allResultIdentities = [...sharedIdentities, ...diffIdentities];

        // No duplicates across (or within) the two result sets.
        expect(new Set(allResultIdentities).size).toBe(allResultIdentities.length);
        // The union of result identities equals the union of the deck identities.
        expect(new Set(allResultIdentities)).toEqual(union);
        // Exactly one set per identity (implied by the two checks above, but
        // asserted directly for clarity): shared and differences are disjoint.
        for (const id of sharedIdentities) {
          expect(diffIdentities).not.toContain(id);
        }

        // For every result entry, verify quantities and classification.
        for (const entry of [...result.shared, ...result.differences]) {
          const expectedFirst = first.get(entry.identity) ?? 0;
          const expectedSecond = second.get(entry.identity) ?? 0;

          // 6.1 / 6.3: actual quantity in each deck, 0 where absent.
          expect(entry.firstQuantity).toBe(expectedFirst);
          expect(entry.secondQuantity).toBe(expectedSecond);
        }

        // 6.2: Shared exactly when the two quantities are equal.
        for (const entry of result.shared) {
          expect(entry.firstQuantity).toBe(entry.secondQuantity);
        }
        // 6.2 / 6.3: Card Difference exactly when they differ.
        for (const entry of result.differences) {
          expect(entry.firstQuantity).not.toBe(entry.secondQuantity);
        }
      }),
      { numRuns: 200 },
    );
  });
});
