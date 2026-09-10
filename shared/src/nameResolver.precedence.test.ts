/**
 * Feature: riftbound-deck-comparator, Property 10: Name resolution precedence
 *
 * For any combination of an optional user-entered name, an optional source
 * name, and a deck position, the resolved deck name is: the trimmed
 * user-entered name when it contains at least one non-whitespace character;
 * otherwise the source name truncated to 100 characters when a source name is
 * present; otherwise the position default (`Deck 1` for the first deck,
 * `Deck 2` for the second).
 *
 * Validates: Requirements 8.2, 8.3, 8.4
 */

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { resolveName, defaultName, MAX_NAME_LENGTH, type DeckPosition } from "./nameResolver.js";

/**
 * Whitespace characters used to build whitespace-only strings that must NOT
 * count as a "non-whitespace" user name. `String.prototype.trim` treats these
 * as whitespace.
 */
const WHITESPACE_CHARS = [" ", "\t", "\n", "\r", "\f", "\v", "\u00a0"] as const;

/** A string composed solely of whitespace (possibly empty). */
const whitespaceOnlyArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...WHITESPACE_CHARS), { minLength: 0, maxLength: 8 })
  .map((chars) => chars.join(""));

/**
 * An optional user-entered name spanning the interesting input space:
 * undefined, empty, whitespace-only, ordinary text, long strings, and unicode.
 */
const userNameArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  whitespaceOnlyArb,
  fc.string(),
  fc.string({ minLength: 101, maxLength: 300 }),
  fc.fullUnicodeString(),
  // Text with surrounding whitespace to exercise trimming.
  fc.tuple(whitespaceOnlyArb, fc.fullUnicodeString({ minLength: 1 }), whitespaceOnlyArb).map(
    ([lead, core, trail]) => `${lead}${core}${trail}`,
  ),
);

/**
 * An optional source name spanning empty, ordinary, long (over 100 chars), and
 * unicode strings, plus undefined.
 */
const sourceNameArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constant(""),
  fc.string(),
  fc.string({ minLength: 101, maxLength: 300 }),
  fc.fullUnicodeString(),
);

const positionArb: fc.Arbitrary<DeckPosition> = fc.constantFrom("first", "second");

describe("Property 10: Name resolution precedence", () => {
  it("resolves user name, then source name (truncated), then position default", () => {
    fc.assert(
      fc.property(userNameArb, sourceNameArb, positionArb, (userName, sourceName, position) => {
        const resolved = resolveName(userName, sourceName, position);

        const hasUserName = userName !== undefined && userName.trim().length > 0;

        if (hasUserName) {
          // Branch 1: trimmed user-entered name wins (Req 8.3).
          expect(resolved).toBe((userName as string).trim());
        } else if (sourceName !== undefined) {
          // Branch 2: source name truncated to 100 chars (Req 8.2).
          expect(resolved).toBe(sourceName.slice(0, MAX_NAME_LENGTH));
          expect(resolved.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
        } else {
          // Branch 3: position default (Req 8.4).
          expect(resolved).toBe(defaultName(position));
          expect(resolved).toBe(position === "first" ? "Deck 1" : "Deck 2");
        }
      }),
      { numRuns: 200 },
    );
  });
});
