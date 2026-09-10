/**
 * Core shared types for the Riftbound Deck Comparator domain layer.
 *
 * These types are the common vocabulary shared across the parser, deck-code
 * decoder, normalizer, comparison engine, and share service. See the design
 * document (Components and Interfaces / Data Models) for the authoritative
 * definitions.
 */

/**
 * A discriminated result type used across the domain layer in place of thrown
 * exceptions, so that errors can be attributed to a specific deck and input
 * method and surfaced with a precise message.
 */
export type Result<T, E = DeckError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Construct a successful {@link Result}.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Construct a failed {@link Result}.
 */
export function err<E = DeckError>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * The input method a user selects for a deck.
 */
export type InputMethod = "text" | "code" | "link";

/**
 * A structured, machine-readable error emitted by domain components.
 */
export interface DeckError {
  /** Machine-readable code, e.g. "PARSE_LINE", "INVALID_CODE". */
  code: string;
  /** Human-readable message. */
  message: string;
  /** Which deck the error belongs to, when applicable. */
  deck?: "first" | "second";
  /** Which input method produced the error, when applicable. */
  inputMethod?: InputMethod;
  /** For text parse errors: the 1-based line number that failed. */
  lineNumber?: number;
  /** For text parse errors: the content of the failing line. */
  lineContent?: string;
}

/**
 * The common shape produced by all three input paths: a map from card code
 * (with variant, as supplied) to total quantity.
 *
 * Invariants:
 * - All quantities are integers >= 1 (zero-quantity entries are excluded).
 * - Text-sourced decks cap each card code at 99.
 */
export type StructuredDeck = Map<string, number>;

/**
 * A deck reduced to printing-independent identities: a map from a normalized
 * card identity key (`SET-[prefix]number`) to a summed quantity.
 *
 * Invariant: all quantities are integers >= 1.
 */
export type NormalizedDeck = Map<string, number>;

/**
 * The structural breakdown of a card code, e.g. "VEN-SP1a".
 */
export interface CardCodeParts {
  /** Three-character set id, e.g. "VEN". */
  set: string;
  /** Number prefix: "" (base), "R" (rune), or "SP" (special). */
  numberPrefix: "" | "R" | "SP";
  /** Card number as digits; may be zero-padded for base/R printings. */
  number: string;
  /** Single-character variant suffix, or "" for a base printing. */
  variant: string;
}

/**
 * A single card's presence in a comparison, keyed by its normalized identity.
 */
export interface CardEntry {
  /** Normalized identity key "SET-[prefix]number". */
  identity: string;
  /** Quantity in the first deck; 0 if absent. */
  firstQuantity: number;
  /** Quantity in the second deck; 0 if absent. */
  secondQuantity: number;
}

/**
 * The result of comparing two normalized decks.
 */
export interface ComparisonResult {
  /** Cards where firstQuantity === secondQuantity (both > 0). */
  shared: CardEntry[];
  /** Cards where firstQuantity !== secondQuantity. */
  differences: CardEntry[];
}

/**
 * The full comparison state encoded into a shareable link: both structured
 * decks and both resolved deck names. The comparison result is deterministic
 * from the two decks, so it is not stored and is recomputed on open.
 */
export interface SharePayload {
  /** The first deck's card codes and quantities. */
  first: StructuredDeck;
  /** The second deck's card codes and quantities. */
  second: StructuredDeck;
  /** The first deck's name, preserved verbatim. */
  firstName: string;
  /** The second deck's name, preserved verbatim. */
  secondName: string;
}
