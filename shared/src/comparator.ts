/**
 * Comparator: orchestrates the full comparison flow.
 *
 * The Comparator owns the cross-cutting concerns named in the design document
 * (Components and Interfaces / Comparator): input-method routing, missing-input
 * detection, error attribution to a deck and method, normalization, comparison,
 * and name resolution.
 *
 * All three input paths converge on a common {@link StructuredDeck}. The text
 * and code paths are pure and handled by the shared parser/decoder. The link
 * path requires server-side HTTP retrieval and therefore lives in the client
 * half; it is injected here as a {@link LinkImporter} dependency so the shared
 * package stays free of I/O.
 *
 * See design document: "Data Flow", "Deck Name Resolution", and the Error
 * Handling table (Reqs 1.2-1.7, 6.6).
 */

import { compare as compareDecks } from "./comparison.js";
import { decode as decodeCode } from "./deckCode.js";
import { resolveName } from "./nameResolver.js";
import { normalize } from "./normalizer.js";
import { parse } from "./parser.js";
import {
  err,
  ok,
  type ComparisonResult,
  type DeckError,
  type InputMethod,
  type NormalizedDeck,
  type Result,
  type StructuredDeck,
} from "./types.js";

/**
 * A deck retrieved from a link source: its structured contents plus an optional
 * source-provided name.
 */
export interface ImportedDeck {
  /** The structured deck retrieved from the source. */
  deck: StructuredDeck;
  /** The deck name extracted from the source, when the source provides one. */
  sourceName?: string;
}

/**
 * Retrieves and parses a decklist from a supported URL.
 *
 * The Link_Importer is split across the client (issues the request, applies the
 * caller-facing timeout) and the server proxy (performs the outbound fetch).
 * The Comparator depends only on this interface, so the concrete importer is
 * injected rather than imported, keeping the shared package I/O-free.
 */
export interface LinkImporter {
  /** Retrieve and parse a decklist from a supported URL. (Reqs 4.1-4.7) */
  import(url: string): Promise<Result<ImportedDeck>>;
}

/**
 * A single deck's input to a comparison: the chosen input method, the raw input
 * (pasted text, deck code, or URL), and an optional user-entered name.
 */
export interface DeckInput {
  /** The input method selected for this deck. */
  method: InputMethod;
  /** The raw input: pasted text, deck code, or URL. */
  raw: string;
  /** An optional user-entered name for this deck. */
  userName?: string;
}

/**
 * A request to compare two decks. The two decks may use different input
 * methods within a single comparison (Req 1.5).
 */
export interface CompareRequest {
  /** The first deck's input. */
  first: DeckInput;
  /** The second deck's input. */
  second: DeckInput;
}

/**
 * The resolved view of a completed comparison: both display names and the
 * comparison result.
 */
export interface ComparisonView {
  /** The resolved display name of the first deck. */
  firstName: string;
  /** The resolved display name of the second deck. */
  secondName: string;
  /** The computed comparison result. */
  result: ComparisonResult;
}

/**
 * Orchestrates the full comparison flow: presence validation, input-method
 * routing, error attribution, normalization, comparison, and name resolution.
 */
export interface Comparator {
  /**
   * Validate presence, route each deck to its producer, normalize both decks,
   * run the comparison, and resolve both names. Returns a full comparison view
   * or the first blocking error, attributed to a deck and method.
   * (Reqs 1.2-1.7, 6.6)
   */
  compare(request: CompareRequest): Promise<Result<ComparisonView>>;
}

/** The position of a deck within a comparison. */
type DeckPosition = "first" | "second";

/**
 * The outcome of producing a single deck: its structured contents plus any
 * source-provided name (present only on the link path).
 */
interface ProducedDeck {
  deck: StructuredDeck;
  sourceName?: string;
}

/**
 * Build a missing-input error naming the deck that has no input (Req 1.6).
 */
function missingInputError(position: DeckPosition): DeckError {
  return {
    code: "MISSING_INPUT",
    message: `The ${position} deck has no input provided.`,
    deck: position,
  };
}

/**
 * Build a missing-deck error for a deck that is unavailable or cannot be
 * normalized when the comparison is requested (Req 6.6).
 */
function missingDeckError(position: DeckPosition, cause: DeckError): DeckError {
  return {
    code: "MISSING_DECK",
    message: `A valid normalized ${position} deck is missing: ${cause.message}`,
    deck: position,
    inputMethod: cause.inputMethod,
  };
}

/**
 * Attribute a producer error to a deck and input method (Req 1.7).
 *
 * The underlying producer error already carries its reason (and, for text
 * parse errors, the line number and content); this stamps the deck position
 * and method so the UI can present a precise, attributed message.
 */
function attributeError(
  error: DeckError,
  position: DeckPosition,
  method: InputMethod,
): DeckError {
  return { ...error, deck: position, inputMethod: method };
}

/**
 * Route a single deck's raw input to its producer by input method, returning
 * the produced structured deck (and any source name) or an attributed error.
 *
 * The text and code paths are pure; the link path delegates to the injected
 * {@link LinkImporter}. Producer errors are attributed to the deck and method
 * (Req 1.7).
 */
async function produceDeck(
  input: DeckInput,
  position: DeckPosition,
  importer: LinkImporter,
): Promise<Result<ProducedDeck>> {
  switch (input.method) {
    case "text": {
      // Deck List (Text) input (Req 1.2).
      const parsed = parse(input.raw);
      if (!parsed.ok) {
        return err(attributeError(parsed.error, position, "text"));
      }
      return ok({ deck: parsed.value });
    }
    case "code": {
      // Piltover Archive Deck Code input (Req 1.3).
      const decoded = decodeCode(input.raw);
      if (!decoded.ok) {
        return err(attributeError(decoded.error, position, "code"));
      }
      return ok({ deck: decoded.value });
    }
    case "link": {
      // Decklist URL input (Req 1.4).
      const imported = await importer.import(input.raw);
      if (!imported.ok) {
        return err(attributeError(imported.error, position, "link"));
      }
      return ok({
        deck: imported.value.deck,
        sourceName: imported.value.sourceName,
      });
    }
    default: {
      // Exhaustiveness guard: an unrecognized method is a format error.
      const method: InputMethod = input.method;
      return err({
        code: "UNKNOWN_INPUT_METHOD",
        message: `Unknown input method "${String(method)}".`,
        deck: position,
      });
    }
  }
}

/**
 * Prepare one deck end to end: presence check, production, and normalization,
 * returning the normalized deck and its resolved name, or the first blocking
 * error attributed to the deck.
 */
async function prepareDeck(
  input: DeckInput,
  position: DeckPosition,
  importer: LinkImporter,
): Promise<Result<{ normalized: NormalizedDeck; name: string }>> {
  // Reject when this deck has no input provided (Req 1.6). Whitespace-only
  // input is treated as absent.
  if (input.raw.trim() === "") {
    return err(missingInputError(position));
  }

  const produced = await produceDeck(input, position, importer);
  if (!produced.ok) {
    return produced;
  }

  // Normalize; a deck that cannot be normalized is a missing-deck error at
  // comparison time (Reqs 5.5, 6.6).
  const normalized = normalize(produced.value.deck);
  if (!normalized.ok) {
    return err(missingDeckError(position, normalized.error));
  }

  // Resolve the display name from the user-entered name, the source name (link
  // path only), and the deck position (Reqs 8.2-8.4).
  const name = resolveName(
    input.userName,
    produced.value.sourceName,
    position,
  );

  return ok({ normalized: normalized.value, name });
}

/**
 * Create a {@link Comparator} bound to a concrete {@link LinkImporter}.
 *
 * The importer is injected because the link path performs server-side HTTP
 * retrieval, which the shared package deliberately does not do. The text and
 * code paths need no external dependency.
 */
export function createComparator(importer: LinkImporter): Comparator {
  return {
    async compare(
      request: CompareRequest,
    ): Promise<Result<ComparisonView>> {
      // Prepare both decks. Presence is validated per deck (Req 1.6) and the
      // two decks may use different input methods (Req 1.5).
      const first = await prepareDeck(request.first, "first", importer);
      if (!first.ok) {
        return first;
      }

      const second = await prepareDeck(request.second, "second", importer);
      if (!second.ok) {
        return second;
      }

      // Both decks are available and normalized; run the comparison (Req 6.x).
      const result = compareDecks(first.value.normalized, second.value.normalized);

      return ok({
        firstName: first.value.name,
        secondName: second.value.name,
        result,
      });
    },
  };
}

/**
 * Convenience one-shot form: prepare and compare both decks with an injected
 * importer, without first constructing a {@link Comparator}.
 *
 * Equivalent to `createComparator(importer).compare(request)`.
 */
export function compare(
  request: CompareRequest,
  importer: LinkImporter,
): Promise<Result<ComparisonView>> {
  return createComparator(importer).compare(request);
}
