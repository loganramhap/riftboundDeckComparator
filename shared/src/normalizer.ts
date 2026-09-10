/**
 * Deck_Normalizer: reduces a {@link StructuredDeck} to a printing-independent
 * {@link NormalizedDeck}.
 *
 * See the design document (Components and Interfaces / Deck_Normalizer) for the
 * authoritative behavior. This is a pure, deterministic transformation that
 * strips variant suffixes, retains the set identifier and full card number
 * (including any `R` or `SP` prefix), and sums quantities across printings of
 * the same normalized identity.
 */

import { normalizedIdentityKey, parseCardCode } from "./cardCode.js";
import {
  err,
  ok,
  type NormalizedDeck,
  type Result,
  type StructuredDeck,
} from "./types.js";

/**
 * Normalize a structured deck into a printing-independent normalized deck.
 *
 * Each card code is reduced to its normalized identity (`SET-[prefix]number`,
 * variant removed). Multiple printings of the same identity within the deck
 * have their quantities summed into a single entry.
 *
 * If any card code does not match the card code grammar, the whole deck is
 * rejected with a `MALFORMED_CARD_CODE` error naming the offending code; no
 * normalized deck is produced.
 *
 * @param deck The structured deck to normalize.
 * @returns A {@link Result} that is `ok` with the {@link NormalizedDeck}, or
 *   `err` with a malformed-code error (Requirements 5.1, 5.2, 5.3, 5.4, 5.5).
 */
export function normalize(deck: StructuredDeck): Result<NormalizedDeck> {
  const normalized: NormalizedDeck = new Map<string, number>();

  for (const [code, quantity] of deck) {
    const parsed = parseCardCode(code);
    if (!parsed.ok) {
      // A single malformed code rejects the entire deck (Requirement 5.5).
      return err(parsed.error);
    }

    const identity = normalizedIdentityKey(parsed.value);
    const existing = normalized.get(identity) ?? 0;
    // Sum quantities across printings of the same identity (Requirement 5.4).
    normalized.set(identity, existing + quantity);
  }

  return ok(normalized);
}
