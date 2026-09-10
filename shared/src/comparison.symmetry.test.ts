/**
 * Feature: riftbound-deck-comparator, Property 8: Comparison is order-symmetric
 *
 * For any pair of normalized decks A and B, comparing (A, B) and comparing
 * (B, A) yield the same set of Shared Card identities and the same set of Card
 * Difference identities, with each entry's first-deck and second-deck
 * quantities swapped between the two results.
 *
 * Validates: Requirements 6.5
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { compare } from "./comparison.js";
import type { CardEntry, NormalizedDeck } from "./types.js";

/** Recognized set identifiers from the deck-code specification. */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/**
 * Generator for a normalized card identity key `SET-[prefix]number`.
 * Drawn from a constrained space so that two independently generated decks
 * are likely to share some identities (exercising both Shared and Difference
 * classifications) while still spanning distinct identities.
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
 * integer quantity (1..99). Uses uniqueArray on the identity so each key
 * appears once, matching the NormalizedDeck invariant.
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

/** Index a comparison result's entries by identity for lookup. */
function byIdentity(entries: CardEntry[]): Map<string, CardEntry> {
  return new Map(entries.map((e) => [e.identity, e]));
}

/** The set of identities appearing in a list of card entries. */
function identitySet(entries: CardEntry[]): Set<string> {
  return new Set(entries.map((e) => e.identity));
}

function expectSameIdentitySet(a: CardEntry[], b: CardEntry[]): void {
  const setA = identitySet(a);
  const setB = identitySet(b);
  expect(setB.size).toBe(setA.size);
  for (const identity of setA) {
    expect(setB.has(identity)).toBe(true);
  }
}

describe("Property 8: Comparison is order-symmetric", () => {
  it("compare(A,B) and compare(B,A) share identities with quantities swapped", () => {
    fc.assert(
      fc.property(normalizedDeckArb, normalizedDeckArb, (a, b) => {
        const ab = compare(a, b);
        const ba = compare(b, a);

        // Same set of Shared identities regardless of order.
        expectSameIdentitySet(ab.shared, ba.shared);
        // Same set of Card Difference identities regardless of order.
        expectSameIdentitySet(ab.differences, ba.differences);

        // Each entry's first/second quantities are swapped between the two
        // results, for both the shared and difference sets.
        for (const group of ["shared", "differences"] as const) {
          const baByIdentity = byIdentity(ba[group]);
          for (const entry of ab[group]) {
            const swapped = baByIdentity.get(entry.identity);
            expect(swapped).toBeDefined();
            if (!swapped) continue;
            expect(swapped.firstQuantity).toBe(entry.secondQuantity);
            expect(swapped.secondQuantity).toBe(entry.firstQuantity);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
