/**
 * Feature: riftbound-deck-comparator, Property 6: Normalization sums quantities across printings
 *
 * For any structured deck, the normalized quantity for each Normalized Card
 * Identity equals the sum of the quantities of every card code in the deck that
 * reduces to that identity.
 *
 * The generator intentionally produces several distinct card codes that share
 * the same set + number but differ by variant suffix, so multiple printings
 * collapse to the same identity and must have their quantities summed.
 *
 * Validates: Requirements 5.4
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { normalizedIdentityKey, parseCardCode } from "./cardCode.js";
import { normalize } from "./normalizer.js";
import type { StructuredDeck } from "./types.js";

/** Recognized set identifiers from the deck-code specification. */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/** Variant suffixes, including "" for a base printing. */
const VARIANTS = ["", "a", "b", "s", "*"] as const;

/**
 * A base identity is a `SET-[prefix]number` combination that multiple card
 * codes (differing only by variant) will reduce to. A small pool of numbers
 * keeps identities colliding frequently across distinct variants.
 */
const baseIdentityArb: fc.Arbitrary<{
  set: string;
  prefix: "" | "R" | "SP";
  number: string;
}> = fc.record({
  set: fc.constantFrom(...SETS),
  prefix: fc.constantFrom("" as const, "R" as const, "SP" as const),
  number: fc.integer({ min: 1, max: 10 }).map((n) => String(n)),
});

/**
 * A single printing entry: a base identity paired with a variant and a
 * quantity. Distinct variants over the same base identity collapse together.
 */
const printingArb = fc.record({
  base: baseIdentityArb,
  variant: fc.constantFrom(...VARIANTS),
  quantity: fc.integer({ min: 1, max: 99 }),
});

/**
 * Generator for a StructuredDeck built from printing entries. Because a Map
 * keys on the full card code (set+prefix+number+variant), entries that share a
 * base identity but differ by variant produce distinct keys that all normalize
 * to the same identity. Entries that collide on the exact same card code are
 * merged by summing, matching how a real structured deck is assembled.
 */
const structuredDeckArb: fc.Arbitrary<StructuredDeck> = fc
  .array(printingArb, { minLength: 0, maxLength: 30 })
  .map((entries) => {
    const deck: StructuredDeck = new Map();
    for (const { base, variant, quantity } of entries) {
      const code = `${base.set}-${base.prefix}${base.number}${variant}`;
      const existing = deck.get(code) ?? 0;
      deck.set(code, existing + quantity);
    }
    return deck;
  });

describe("Property 6: Normalization sums quantities across printings", () => {
  it("sums the quantities of all card codes that reduce to each identity", () => {
    fc.assert(
      fc.property(structuredDeckArb, (deck) => {
        const result = normalize(deck);

        // The generator only emits well-formed card codes, so normalization
        // must succeed.
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Independently compute the expected per-identity sum.
        const expected = new Map<string, number>();
        for (const [code, quantity] of deck) {
          const parsed = parseCardCode(code);
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          const identity = normalizedIdentityKey(parsed.value);
          expected.set(identity, (expected.get(identity) ?? 0) + quantity);
        }

        const actual = result.value;

        // Same set of identities.
        expect(new Set(actual.keys())).toEqual(new Set(expected.keys()));

        // Each identity's normalized quantity equals the independent sum.
        for (const [identity, sum] of expected) {
          expect(actual.get(identity)).toBe(sum);
        }
      }),
      { numRuns: 200 },
    );
  });
});
