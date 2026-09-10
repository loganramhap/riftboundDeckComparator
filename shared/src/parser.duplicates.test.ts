/**
 * Property-based test for Deck_Parser duplicate summing and cap behavior.
 *
 * Feature: riftbound-deck-comparator, Property 2: Duplicate quantities sum and cap at 99
 *
 * For any Deck List (Text) containing multiple lines that reference the same
 * Card Code, the parsed structured deck maps that Card Code to the minimum of
 * 99 and the sum of those lines' quantities.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parse } from "./parser.js";

/** Sets recognized by the card code grammar (design: Data Models). */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/**
 * Generates a valid Card Code of the form SET-[prefix]number[variant]:
 *   set          := one of the recognized set ids
 *   numberPrefix := "" | "R" | "SP"
 *   number       := 1..3 digits
 *   variant      := "" | a | b | s | *
 */
const cardCodeArb: fc.Arbitrary<string> = fc.tuple(
  fc.constantFrom(...SETS),
  fc.constantFrom("", "R", "SP"),
  fc.integer({ min: 1, max: 999 }),
  fc.constantFrom("", "a", "b", "s", "*"),
).map(([set, prefix, num, variant]) => `${set}-${prefix}${num}${variant}`);

describe("Deck_Parser: duplicate summing and cap at 99 (Property 2)", () => {
  // Feature: riftbound-deck-comparator, Property 2: Duplicate quantities sum and cap at 99
  // Validates: Requirements 2.3
  it("maps a repeated Card Code to min(99, sum of the lines' quantities)", () => {
    fc.assert(
      fc.property(
        cardCodeArb,
        // Multiple lines (>= 2) referencing the same code, quantities 1..99.
        fc.array(fc.integer({ min: 1, max: 99 }), { minLength: 2, maxLength: 20 }),
        (code, quantities) => {
          const text = quantities.map((q) => `${q} ${code}`).join("\n");

          const result = parse(text);
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const sum = quantities.reduce((a, b) => a + b, 0);
          const expected = Math.min(99, sum);

          // The parsed deck maps the code to a single, capped entry.
          expect(result.value.get(code)).toBe(expected);
          expect(result.value.size).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
