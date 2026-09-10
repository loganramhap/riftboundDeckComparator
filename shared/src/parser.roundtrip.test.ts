/**
 * Feature: riftbound-deck-comparator, Property 1: Text parse/format round trip
 *
 * For any parseable Deck List (Text), parse -> format -> parse produces a
 * structured deck equivalent to the first parse (same set of Card Codes each
 * mapped to identical quantities).
 *
 * Validates: Requirements 2.1, 2.2, 2.6, 2.7
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { parse, format } from "./parser.js";
import type { StructuredDeck } from "./types.js";

/** Recognized set identifiers from the deck-code specification. */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/**
 * Generator for a valid Card Code matching the grammar
 * `SET-[prefix]number[variant]`:
 *   set          := [A-Z]{3}   (drawn from the recognized sets)
 *   numberPrefix := "" | "R" | "SP"
 *   number       := [0-9]+
 *   variant      := "" | [a-z*]
 */
const cardCodeArb: fc.Arbitrary<string> = fc
  .record({
    set: fc.constantFrom(...SETS),
    prefix: fc.constantFrom("", "R", "SP"),
    number: fc.integer({ min: 1, max: 999 }).map((n) => String(n)),
    variant: fc.constantFrom("", "a", "b", "s", "*"),
  })
  .map(({ set, prefix, number, variant }) => `${set}-${prefix}${number}${variant}`);

/** A single line "<qty> <CardCode>" with quantity in 1..99. */
const deckEntryArb: fc.Arbitrary<{ code: string; qty: number }> = fc.record({
  code: cardCodeArb,
  qty: fc.integer({ min: 1, max: 99 }),
});

/**
 * A parseable deck list in the clean "<qty> <CardCode>" form with distinct
 * card codes, so the first parse is unambiguous and round trips exactly.
 */
const deckListArb: fc.Arbitrary<string> = fc
  .uniqueArray(deckEntryArb, {
    selector: (e) => e.code,
    minLength: 0,
    maxLength: 30,
  })
  .map((entries) => entries.map((e) => `${e.qty} ${e.code}`).join("\n"));

/** Assert two structured decks map the same card codes to the same quantities. */
function expectEquivalent(a: StructuredDeck, b: StructuredDeck): void {
  expect(b.size).toBe(a.size);
  for (const [code, qty] of a) {
    expect(b.get(code)).toBe(qty);
  }
}

describe("Property 1: Text parse/format round trip", () => {
  it("parse -> format -> parse yields an equivalent structured deck", () => {
    fc.assert(
      fc.property(deckListArb, (text) => {
        const first = parse(text);
        // The generator only produces parseable lists.
        expect(first.ok).toBe(true);
        if (!first.ok) return;

        const formatted = format(first.value);
        const second = parse(formatted);
        expect(second.ok).toBe(true);
        if (!second.ok) return;

        expectEquivalent(first.value, second.value);
      }),
      { numRuns: 200 },
    );
  });
});
