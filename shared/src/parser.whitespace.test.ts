/**
 * Property-based test for Deck_Parser whitespace invariance and no zero
 * entries.
 *
 * Feature: riftbound-deck-comparator, Property 3: Blank and whitespace lines
 * are ignored and no zero entries
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parse } from "./parser.js";
import type { StructuredDeck } from "./types.js";

const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/** Generates a valid card code of the form SET-[prefix]number[variant]. */
const cardCodeArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...SETS),
    fc.constantFrom("", "R", "SP"),
    fc.integer({ min: 1, max: 999 }),
    fc.constantFrom("", "a", "b", "s", "*"),
  )
  .map(([set, prefix, num, variant]) => `${set}-${prefix}${num}${variant}`);

/** A valid "<qty> <CardCode>" line: quantity 1..99. */
const deckLineArb: fc.Arbitrary<{ code: string; qty: number }> = fc.record({
  code: cardCodeArb,
  qty: fc.integer({ min: 1, max: 99 }),
});

/** Whitespace-only (or empty) line content. */
const whitespaceLineArb: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(" ", "\t"),
  { minLength: 0, maxLength: 5 },
);

/**
 * Expects the given Result to be ok and returns its value; fails the test
 * otherwise.
 */
function expectOk(result: ReturnType<typeof parse>): StructuredDeck {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`expected ok, got error: ${result.error.message}`);
  }
  return result.value;
}

/** Compares two structured decks for identical key/quantity sets. */
function decksEqual(a: StructuredDeck, b: StructuredDeck): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

describe("Deck_Parser Property 3: whitespace invariance and no zero entries", () => {
  it("ignores blank/whitespace lines and never produces zero-quantity entries", () => {
    // Feature: riftbound-deck-comparator, Property 3: Blank and whitespace
    // lines are ignored and no zero entries
    // Validates: Requirements 2.4
    fc.assert(
      fc.property(
        // A list of valid deck lines forming the "original" parseable list.
        fc.array(deckLineArb, { minLength: 0, maxLength: 20 }),
        // For each interleave slot (positions 0..n), how many whitespace
        // lines to insert, and their content.
        fc.array(fc.array(whitespaceLineArb, { minLength: 0, maxLength: 3 }), {
          minLength: 0,
          maxLength: 21,
        }),
        (lines, insertions) => {
          const originalLines = lines.map((l) => `${l.qty} ${l.code}`);
          const originalText = originalLines.join("\n");

          const originalDeck = expectOk(parse(originalText));

          // Build the augmented text by inserting whitespace-only lines at
          // arbitrary positions (before each original line and at the end).
          const augmented: string[] = [];
          for (let i = 0; i <= originalLines.length; i++) {
            const blanks = insertions[i] ?? [];
            for (const blank of blanks) {
              augmented.push(blank);
            }
            if (i < originalLines.length) {
              augmented.push(originalLines[i]);
            }
          }
          const augmentedText = augmented.join("\n");

          const augmentedDeck = expectOk(parse(augmentedText));

          // Parsing the augmented list yields the same deck as the original.
          expect(decksEqual(originalDeck, augmentedDeck)).toBe(true);

          // The resulting deck never contains a zero-quantity entry.
          for (const quantity of augmentedDeck.values()) {
            expect(quantity).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
