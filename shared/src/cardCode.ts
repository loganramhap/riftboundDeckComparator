/**
 * Card code parsing helpers for the Riftbound Deck Comparator.
 *
 * A Card Code is the raw identifier `SET-[prefix]number[variant]`. This module
 * provides a parser that decomposes a card code into its structural parts and a
 * helper that produces the printing-independent normalized identity key.
 *
 * Grammar (see design "Card Code and Normalized Identity"):
 *
 *   cardCode     := set "-" numberPrefix number variant?
 *   set          := [A-Z]{3}
 *   numberPrefix := "" | "R" | "SP"
 *   number       := [0-9]+
 *   variant      := [a-z*]   // e.g. a, b, s, *  (base has no variant)
 */

import {
  err,
  ok,
  type CardCodeParts,
  type DeckError,
  type Result,
} from "./types.js";

/**
 * Matches a full card code and captures its parts:
 * - group 1: set identifier `[A-Z]{3}`
 * - group 2: number prefix `R` | `SP` (empty when absent)
 * - group 3: number `[0-9]+`
 * - group 4: variant `[a-z*]` (empty when absent)
 *
 * The prefix alternation lists `SP` before `R` so the longer prefix is
 * preferred, and both are anchored so a leading digit is never consumed as a
 * prefix.
 */
const CARD_CODE_PATTERN = /^([A-Z]{3})-(SP|R|)([0-9]+)([a-z*]?)$/;

/**
 * Parse a card code into its structural parts.
 *
 * Returns an {@link Result} that is `ok` with the {@link CardCodeParts} when the
 * code matches the grammar, or `err` with a `MALFORMED_CARD_CODE` error naming
 * the offending code otherwise.
 *
 * Requirements: 5.1, 5.2
 */
export function parseCardCode(code: string): Result<CardCodeParts> {
  const match = CARD_CODE_PATTERN.exec(code);
  if (match === null) {
    const error: DeckError = {
      code: "MALFORMED_CARD_CODE",
      message: `Card code "${code}" does not match the pattern SET-[prefix]number[variant].`,
    };
    return err(error);
  }

  const [, set, numberPrefix, number, variant] = match;

  const parts: CardCodeParts = {
    set,
    numberPrefix: numberPrefix as CardCodeParts["numberPrefix"],
    number,
    variant,
  };
  return ok(parts);
}

/**
 * Produce the normalized identity key for a card code's parts.
 *
 * The key retains the set identifier and the full card number (including any
 * `R` or `SP` prefix) and drops the variant suffix, yielding `SET-[prefix]number`
 * (e.g. `OGN-007`, `VEN-SP1`, `RAD-R05`). Two codes that share the same set and
 * number therefore normalize to the same key regardless of variant.
 *
 * Requirements: 5.1, 5.2
 */
export function normalizedIdentityKey(parts: CardCodeParts): string {
  return `${parts.set}-${parts.numberPrefix}${parts.number}`;
}
