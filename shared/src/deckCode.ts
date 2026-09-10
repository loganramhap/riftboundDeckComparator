/**
 * Deck_Code_Decoder: wraps the official `@piltoverarchive/riftbound-deck-codes`
 * library to decode/encode Piltover Archive deck codes into and out of the
 * common {@link StructuredDeck} shape.
 *
 * The library throws on invalid input (undecodable codes, non-positive or
 * non-integer counts). This module catches those throws at the boundary and
 * converts them into {@link DeckError} results, so the rest of the domain layer
 * never has to handle exceptions from the deck-code path.
 *
 * See design document: Components and Interfaces / Deck_Code_Decoder and the
 * Error Handling section (Reqs 3.1, 3.2, 3.3).
 */

import {
  getCodeFromDeck,
  getDeckFromCode,
  type Deck,
} from "@piltoverarchive/riftbound-deck-codes";
import { err, ok, type DeckError, type Result, type StructuredDeck } from "./types.js";

/**
 * Decode a Piltover Archive deck code into a {@link StructuredDeck}.
 *
 * Maps the `mainDeck` entries (`{ cardCode, count }`) returned by the library
 * into a map from card code to quantity. Empty, malformed, or otherwise
 * undecodable codes are caught and returned as an invalid-code error rather
 * than throwing. (Reqs 3.1, 3.2)
 */
export function decode(code: string): Result<StructuredDeck> {
  try {
    const { mainDeck } = getDeckFromCode(code);
    const deck: StructuredDeck = new Map();
    for (const { cardCode, count } of mainDeck) {
      // Sum in case the library ever emits the same card code more than once.
      deck.set(cardCode, (deck.get(cardCode) ?? 0) + count);
    }
    return ok(deck);
  } catch (cause) {
    return err(invalidCodeError(cause));
  }
}

/**
 * Encode a {@link StructuredDeck} into a Piltover Archive deck code.
 *
 * Builds the library's `Deck` (an array of `{ cardCode, count }`) from the map
 * and delegates to `getCodeFromDeck`. The library requires positive integer
 * counts and throws otherwise; that throw is caught and returned as an error.
 * (Req 3.3)
 */
export function encode(deck: StructuredDeck): Result<string> {
  try {
    const mainDeck: Deck = [];
    for (const [cardCode, count] of deck) {
      mainDeck.push({ cardCode, count });
    }
    const code = getCodeFromDeck(mainDeck);
    return ok(code);
  } catch (cause) {
    return err(encodeError(cause));
  }
}

/**
 * Build an invalid-code {@link DeckError} for a failed decode.
 */
function invalidCodeError(cause: unknown): DeckError {
  return {
    code: "INVALID_CODE",
    message: `The deck code is invalid: ${messageOf(cause)}`,
  };
}

/**
 * Build an {@link DeckError} for a failed encode.
 */
function encodeError(cause: unknown): DeckError {
  return {
    code: "ENCODE_FAILED",
    message: `The deck could not be encoded: ${messageOf(cause)}`,
  };
}

/**
 * Extract a human-readable message from an unknown thrown value.
 */
function messageOf(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}
