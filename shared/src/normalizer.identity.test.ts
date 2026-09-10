/**
 * Feature: riftbound-deck-comparator, Property 5: Normalized identity is variant-independent
 *
 * For any Card Code, its Normalized Card Identity equals the set identifier plus
 * the full card number (including any `R` or `SP` prefix) with the variant
 * suffix removed; consequently, any two Card Codes that share the same set and
 * number normalize to the same identity regardless of their variant suffixes,
 * and a base printing (no variant) normalizes to itself unchanged.
 *
 * Validates: Requirements 5.1, 5.2, 5.3
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { normalizedIdentityKey, parseCardCode } from "./cardCode.js";
import type { Result, CardCodeParts } from "./types.js";

/** Recognized set identifiers from the deck-code specification. */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/** Number prefixes: base (""), rune ("R"), and special ("SP"). */
const PREFIXES = ["", "R", "SP"] as const;

/** Variant suffixes, including the empty (base) variant. */
const VARIANTS = ["", "a", "b", "s", "*"] as const;

/** Assert a Result is ok and return its value, failing the test otherwise. */
function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok result but got error: ${result.error.message}`);
  }
  return result.value;
}

/**
 * Generator for the structural pieces of a valid card code. Numbers are digit
 * strings (which may have leading zeros to exercise the retained-number
 * behavior). We keep set/prefix/number separate so tests can build both a base
 * printing and variant printings that share the same set + number.
 */
const codePartsArb = fc.record({
  set: fc.constantFrom(...SETS),
  prefix: fc.constantFrom(...PREFIXES),
  number: fc
    .integer({ min: 1, max: 999 })
    .chain((n) =>
      // Optionally left-pad with zeros to produce numbers like "007".
      fc.constantFrom("", "0", "00").map((pad) => `${pad}${n}`),
    ),
});

describe("Property 5: Normalized identity is variant-independent", () => {
  it("removes the variant while retaining set + full number, is variant-independent, and leaves base printings unchanged", () => {
    fc.assert(
      fc.property(
        codePartsArb,
        fc.constantFrom(...VARIANTS),
        fc.constantFrom(...VARIANTS),
        ({ set, prefix, number }, variantA, variantB) => {
          const expectedIdentity = `${set}-${prefix}${number}`;

          const codeA = `${set}-${prefix}${number}${variantA}`;
          const codeB = `${set}-${prefix}${number}${variantB}`;
          const baseCode = `${set}-${prefix}${number}`;

          // 5.1: identity equals set + full number (incl. prefix), variant removed.
          const keyA = normalizedIdentityKey(expectOk(parseCardCode(codeA)));
          expect(keyA).toBe(expectedIdentity);

          // 5.3: two codes sharing set + number normalize identically regardless
          // of their variant suffixes.
          const keyB = normalizedIdentityKey(expectOk(parseCardCode(codeB)));
          expect(keyB).toBe(keyA);

          // 5.2: a base printing (no variant) normalizes to itself unchanged.
          const parsedBase = expectOk(parseCardCode(baseCode)) as CardCodeParts;
          expect(parsedBase.variant).toBe("");
          expect(normalizedIdentityKey(parsedBase)).toBe(baseCode);
        },
      ),
      { numRuns: 200 },
    );
  });
});
