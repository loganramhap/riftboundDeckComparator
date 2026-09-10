/**
 * Deck_Normalizer: reduces a {@link StructuredDeck} to a printing-independent
 * {@link NormalizedDeck}.
 *
 * See the design document (Components and Interfaces / Deck_Normalizer) for the
 * authoritative behavior. This is a pure, deterministic transformation that
 * strips variant suffixes, retains the set identifier and full card number
 * (including any `R` or `SP` prefix), and sums quantities across printings of
 * the same normalized identity.
 *
 * Decks may also be keyed by free-text card names (from text lists that use
 * names instead of card codes). A name has no printing variants to strip, so it
 * passes through as its own identity unchanged. Only a key that clearly *looks*
 * like a card code (has the `SET-...` shape) but is malformed is rejected.
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
/**
 * Whether a key is clearly *intended* to be a card code — i.e. a single token
 * (no whitespace) beginning with the `SET-` prefix shape (three uppercase
 * letters and a hyphen). Such a key that fails {@link parseCardCode} is a
 * malformed code and rejects the deck; anything else is treated as a card name.
 *
 * Free-text names (which contain spaces, or don't start with the `SET-` shape)
 * are therefore never mistaken for malformed codes.
 */
function looksLikeCardCode(key: string): boolean {
  return /^[A-Z]{3}-/.test(key) && !/\s/.test(key);
}

export function normalize(deck: StructuredDeck): Result<NormalizedDeck> {
  const normalized: NormalizedDeck = new Map<string, number>();

  for (const [key, quantity] of deck) {
    const parsed = parseCardCode(key);

    let identity: string;
    if (parsed.ok) {
      // A valid card code normalizes to its printing-independent identity.
      identity = normalizedIdentityKey(parsed.value);
    } else if (looksLikeCardCode(key)) {
      // Looks like a card code (SET-... shape) but is malformed: reject the
      // whole deck, naming the offending code (Requirement 5.5).
      return err(parsed.error);
    } else {
      // A free-text card name has no variant to strip; it is its own identity.
      identity = key;
    }

    const existing = normalized.get(identity) ?? 0;
    // Sum quantities across printings / duplicate names (Requirement 5.4).
    normalized.set(identity, existing + quantity);
  }

  return ok(normalized);
}
