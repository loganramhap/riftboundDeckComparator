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
import {
  err,
  ok,
  type DeckError,
  type Result,
  type Section,
  type SectionMap,
  type StructuredDeck,
} from "./types.js";

/**
 * Decode a Piltover Archive deck code into a {@link StructuredDeck}.
 *
 * Maps the `mainDeck` entries (`{ cardCode, count }`) returned by the library
 * into a map from card code to quantity. Empty, malformed, or otherwise
 * undecodable codes are caught and returned as an invalid-code error rather
 * than throwing. (Reqs 3.1, 3.2)
 */
export function decode(code: string): Result<StructuredDeck> {
  const decoded = decodeWithSections(code);
  return decoded.ok ? ok(decoded.value.deck) : decoded;
}

/**
 * A decoded deck code together with the section each card belongs to.
 */
export interface DecodedDeck {
  /** The full deck (all zones pooled), card code -> quantity. */
  deck: StructuredDeck;
  /** Card code -> the {@link Section} it was decoded into. */
  sections: SectionMap;
}

/**
 * Decode a Piltover Archive deck code, preserving the zone each card came from.
 *
 * The deck-code format distinguishes three zones, which map to canonical
 * {@link Section}s: the chosen champion ("Chosen Champion"), the main deck
 * ("Main Deck"), and the sideboard ("Sideboard"). The format does not separate
 * Legend, Battlefields, or Runes — those cards are part of the main deck zone
 * and therefore appear under "Main Deck".
 *
 * Returns the pooled {@link StructuredDeck} plus a {@link SectionMap}; empty,
 * malformed, or undecodable codes are caught and returned as an invalid-code
 * error rather than throwing. (Reqs 3.1, 3.2)
 */
export function decodeWithSections(code: string): Result<DecodedDeck> {
  try {
    const { mainDeck, sideboard, chosenChampion } = getDeckFromCode(code);
    const deck: StructuredDeck = new Map();
    const sections: SectionMap = new Map();

    const add = (cardCode: string, count: number, section: Section) => {
      deck.set(cardCode, (deck.get(cardCode) ?? 0) + count);
      // First zone seen for a card wins its section label.
      if (!sections.has(cardCode)) {
        sections.set(cardCode, section);
      }
    };

    if (chosenChampion) {
      add(chosenChampion, 1, "Chosen Champion");
    }
    for (const { cardCode, count } of mainDeck) {
      add(cardCode, count, "Main Deck");
    }
    for (const { cardCode, count } of sideboard) {
      add(cardCode, count, "Sideboard");
    }

    return ok({ deck, sections });
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
