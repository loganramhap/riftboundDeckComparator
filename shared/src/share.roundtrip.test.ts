/**
 * Feature: riftbound-deck-comparator, Property 12: Share link round trip
 *
 * For any comparison state (two structured decks and two deck names),
 * createLink then resolveLink reconstructs both decks and both names verbatim
 * (full character sequence preserved), such that recomputing the comparison
 * from the resolved state reproduces the same per-deck quantities and the same
 * Shared/Difference classification for every Normalized Card Identity as the
 * original comparison.
 *
 * Validates: Requirements 9.1, 9.2, 9.3
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { createLink, resolveLink } from "./share.js";
import { normalize } from "./normalizer.js";
import { compare } from "./comparison.js";
import type { ComparisonResult, StructuredDeck } from "./types.js";

/** Recognized set identifiers from the deck-code specification. */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/**
 * Generator for a valid Card Code `SET-[prefix]number[variant]`. Valid codes
 * ensure the resolved state can also be normalized/compared for the
 * classification half of the property.
 */
const cardCodeArb: fc.Arbitrary<string> = fc
  .record({
    set: fc.constantFrom(...SETS),
    prefix: fc.constantFrom("", "R", "SP"),
    number: fc.integer({ min: 1, max: 999 }).map((n) => String(n)),
    variant: fc.constantFrom("", "a", "b", "s", "*"),
  })
  .map(({ set, prefix, number, variant }) => `${set}-${prefix}${number}${variant}`);

/**
 * A structured deck: a Map of distinct card codes to positive integer
 * quantities in 1..99.
 */
const structuredDeckArb: fc.Arbitrary<StructuredDeck> = fc
  .uniqueArray(
    fc.record({ code: cardCodeArb, qty: fc.integer({ min: 1, max: 99 }) }),
    { selector: (e) => e.code, minLength: 0, maxLength: 30 },
  )
  .map((entries) => new Map(entries.map((e) => [e.code, e.qty])));

/**
 * A deck name including unicode, whitespace, and the empty string, exercised
 * for verbatim preservation (Req 9.2). `fc.string` with the full unicode range
 * covers surrogate pairs, whitespace, and control characters.
 */
const nameArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: "grapheme", maxLength: 100 }),
  fc.string({ unit: "binary", maxLength: 100 }),
  fc.constantFrom("", "   ", "\t\n ", "日本語 デッキ", "😀 deck", "  spaced  "),
);

/** Assert two structured decks map the same card codes to the same quantities. */
function expectDeckEqual(actual: StructuredDeck, expected: StructuredDeck): void {
  expect(actual.size).toBe(expected.size);
  for (const [code, qty] of expected) {
    expect(actual.get(code)).toBe(qty);
  }
}

/**
 * Compute a comparison from a pair of structured decks by normalizing both and
 * diffing them. Both decks are built from valid card codes, so normalization
 * always succeeds here.
 */
function comparisonOf(first: StructuredDeck, second: StructuredDeck): ComparisonResult {
  const nf = normalize(first);
  const ns = normalize(second);
  expect(nf.ok).toBe(true);
  expect(ns.ok).toBe(true);
  if (!nf.ok || !ns.ok) throw new Error("unexpected normalization failure");
  return compare(nf.value, ns.value);
}

/** Sort card entries by identity for order-independent comparison. */
function sortEntries(result: ComparisonResult): ComparisonResult {
  const byIdentity = (a: { identity: string }, b: { identity: string }) =>
    a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0;
  return {
    shared: [...result.shared].sort(byIdentity),
    differences: [...result.differences].sort(byIdentity),
  };
}

describe("Property 12: Share link round trip", () => {
  it("createLink -> resolveLink reconstructs decks/names verbatim and preserves comparison", () => {
    fc.assert(
      fc.property(
        structuredDeckArb,
        structuredDeckArb,
        nameArb,
        nameArb,
        (first, second, firstName, secondName) => {
          const payload = { first, second, firstName, secondName };

          const link = createLink(payload);
          const resolved = resolveLink(link);

          // The link must resolve successfully (Reqs 9.1, 9.2).
          expect(resolved.ok).toBe(true);
          if (!resolved.ok) return;

          // Both decks reconstructed verbatim.
          expectDeckEqual(resolved.value.first, first);
          expectDeckEqual(resolved.value.second, second);

          // Both names preserved verbatim, full character sequence (Req 9.2).
          expect(resolved.value.firstName).toBe(firstName);
          expect(resolved.value.secondName).toBe(secondName);

          // Recomputing the comparison from the resolved state reproduces the
          // same per-deck quantities and Shared/Difference classification for
          // every normalized identity (Req 9.3).
          const original = comparisonOf(first, second);
          const roundTripped = comparisonOf(
            resolved.value.first,
            resolved.value.second,
          );
          expect(sortEntries(roundTripped)).toEqual(sortEntries(original));
        },
      ),
      { numRuns: 200 },
    );
  });
});
