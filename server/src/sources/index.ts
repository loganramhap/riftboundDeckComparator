/**
 * Source adapter registry (Link_Importer server half).
 *
 * Supported decklist sources are defined by a registry of source adapters, each
 * exposing a URL matcher and a parser from raw source content to an
 * {@link ImportedDeck}. See the design document (Components and Interfaces /
 * Link_Importer): "Supported sources are defined by a registry of source
 * adapters, each exposing a URL matcher and a parser from raw source content to
 * ImportedDeck."
 *
 * This module is pure (no I/O). The outbound HTTP fetch and 30-second timeout
 * are handled by the proxy endpoint (task 10.1); adapters only classify URLs
 * and parse already-retrieved raw content.
 *
 * Requirements: 4.1 (produce a structured deck from supported-source content),
 * 4.5 (content yielding no card with quantity >= 1 is a retrieval failure),
 * 4.6 (attach the source deck name when present), 4.7 (attach none when absent).
 */

import {
  parse as parseTextDeck,
  err,
  ok,
  type Result,
  type StructuredDeck,
  type DeckError,
} from "@riftbound/shared";

/**
 * A deck retrieved from a link source: its structured contents plus an optional
 * source-provided name.
 *
 * Structurally identical to the shared `ImportedDeck` so it interoperates with
 * the Comparator's `LinkImporter` seam. It is declared locally here to keep the
 * server's source registry decoupled from the shared package's public surface.
 */
export interface ImportedDeck {
  /** The structured deck retrieved from the source. */
  deck: StructuredDeck;
  /** The deck name extracted from the source, when the source provides one. */
  sourceName?: string;
}

/**
 * A source adapter: a URL matcher plus a parser from raw retrieved content to
 * an {@link ImportedDeck}.
 */
export interface SourceAdapter {
  /** Human-readable adapter name, e.g. "text-decklist". */
  name: string;
  /** Whether this adapter handles the given (already-parsed) URL. */
  matches(url: URL): boolean;
  /** Parse raw retrieved content into an {@link ImportedDeck}. */
  parse(rawContent: string): Result<ImportedDeck>;
}

/**
 * Build a retrieval-failure error (Reqs 4.4, 4.5).
 *
 * Content that cannot be parsed into at least one card with quantity >= 1 is
 * treated as a retrieval failure, so the importer surfaces it the same way as a
 * network or HTTP failure.
 */
function retrievalFailure(message: string): DeckError {
  return {
    code: "RETRIEVAL_FAILURE",
    message,
    inputMethod: "link",
  };
}

/**
 * Whether a structured deck contains at least one card with quantity >= 1.
 *
 * Parsed decks never carry zero/negative entries (the parser excludes them),
 * but this is checked explicitly so an empty deck maps to a retrieval failure
 * per Req 4.5.
 */
function hasCard(deck: StructuredDeck): boolean {
  for (const quantity of deck.values()) {
    if (quantity >= 1) {
      return true;
    }
  }
  return false;
}

/**
 * Optional source-name convention shared by the generic adapters.
 *
 * A source may declare a deck name using a leading metadata line of the form
 * `# name: <deck name>` (case-insensitive `name`), or `//name: <deck name>`.
 * The line is stripped before the remaining body is parsed as a text decklist.
 * When no such line is present, no source name is attached (Req 4.7).
 */
const NAME_LINE = /^\s*(?:#|\/\/)\s*name\s*:\s*(.+?)\s*$/i;

/**
 * Extract an optional source name from the leading metadata line and return the
 * remaining decklist body with that line removed.
 */
function extractSourceName(rawContent: string): {
  sourceName?: string;
  body: string;
} {
  const lines = rawContent.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      continue;
    }
    const match = NAME_LINE.exec(lines[i]);
    if (match) {
      const sourceName = match[1];
      const body = [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n");
      return { sourceName, body };
    }
    // First non-blank line is not a name line: no source name.
    return { body: rawContent };
  }
  return { body: rawContent };
}

/**
 * Parse a plain-text decklist body via the shared Deck_Parser and attach an
 * optional source name. Empty results (no card with quantity >= 1) map to a
 * retrieval failure (Req 4.5).
 */
function parseTextBody(rawContent: string): Result<ImportedDeck> {
  const { sourceName, body } = extractSourceName(rawContent);
  const parsed = parseTextDeck(body);
  if (!parsed.ok) {
    // Unparseable content is treated as a retrieval failure (Req 4.5).
    return err(retrievalFailure(parsed.error.message));
  }
  if (!hasCard(parsed.value)) {
    return err(
      retrievalFailure(
        "Retrieved content contained no cards with a quantity of one or more.",
      ),
    );
  }
  return ok(
    sourceName === undefined
      ? { deck: parsed.value }
      : { deck: parsed.value, sourceName },
  );
}

/**
 * A JSON-shaped source body: `{ "name"?: string, "cards": { "<code>": qty } }`
 * or `{ "name"?: string, "cards": [ { "code": "<code>", "count": qty } ] }`.
 * Provides a source name via the optional top-level `name` field (Reqs 4.6, 4.7).
 */
interface JsonDeckBody {
  name?: unknown;
  cards?: unknown;
}

/**
 * Parse a JSON decklist body into an {@link ImportedDeck}. Accepts either a
 * `{ code: qty }` object map or an array of `{ code, count }` entries under the
 * `cards` field. Any card with quantity >= 1 is retained; a `name` field, when
 * a non-empty string, becomes the source name.
 */
function parseJsonBody(rawContent: string): Result<ImportedDeck> {
  let data: JsonDeckBody;
  try {
    data = JSON.parse(rawContent) as JsonDeckBody;
  } catch {
    return err(retrievalFailure("Retrieved content was not valid JSON."));
  }
  if (data === null || typeof data !== "object") {
    return err(retrievalFailure("Retrieved JSON was not a deck object."));
  }

  const deck: StructuredDeck = new Map();
  const cards = data.cards;
  if (Array.isArray(cards)) {
    for (const entry of cards) {
      if (entry && typeof entry === "object") {
        const code = (entry as Record<string, unknown>).code;
        const count = (entry as Record<string, unknown>).count;
        if (typeof code === "string" && typeof count === "number") {
          addCard(deck, code, count);
        }
      }
    }
  } else if (cards && typeof cards === "object") {
    for (const [code, count] of Object.entries(cards as Record<string, unknown>)) {
      if (typeof count === "number") {
        addCard(deck, code, count);
      }
    }
  }

  if (!hasCard(deck)) {
    return err(
      retrievalFailure(
        "Retrieved content contained no cards with a quantity of one or more.",
      ),
    );
  }

  const sourceName =
    typeof data.name === "string" && data.name.trim() !== ""
      ? data.name
      : undefined;
  return ok(sourceName === undefined ? { deck } : { deck, sourceName });
}

/**
 * Add a card/quantity to a deck, summing duplicates and ignoring non-positive
 * or non-integer counts.
 */
function addCard(deck: StructuredDeck, code: string, count: number): void {
  if (!Number.isInteger(count) || count < 1) {
    return;
  }
  deck.set(code, (deck.get(code) ?? 0) + count);
}

/**
 * Generic plain-text decklist adapter.
 *
 * Matches any `http`/`https` URL whose path ends in `.txt` or `.text`, or whose
 * host is `raw.githubusercontent.com` (a common home for raw text decklists).
 * Parses the body via the shared Deck_Parser.
 */
const textDecklistAdapter: SourceAdapter = {
  name: "text-decklist",
  matches(url: URL): boolean {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    if (url.hostname === "raw.githubusercontent.com") {
      return true;
    }
    return /\.(txt|text)$/i.test(url.pathname);
  },
  parse(rawContent: string): Result<ImportedDeck> {
    return parseTextBody(rawContent);
  },
};

/**
 * Generic JSON decklist adapter (Piltover-Archive-style).
 *
 * Matches any `http`/`https` URL whose path ends in `.json`. Parses a JSON body
 * carrying a `cards` map/array and an optional `name` field for the source
 * deck name.
 */
const jsonDecklistAdapter: SourceAdapter = {
  name: "json-decklist",
  matches(url: URL): boolean {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return /\.json$/i.test(url.pathname);
  },
  parse(rawContent: string): Result<ImportedDeck> {
    return parseJsonBody(rawContent);
  },
};

/**
 * The source adapter registry. Adapters are consulted in order; the first whose
 * `matches` returns true handles the URL.
 */
export const registry: { adapters: SourceAdapter[] } = {
  adapters: [jsonDecklistAdapter, textDecklistAdapter],
};

/**
 * Find the first adapter that handles the given URL, or `undefined` when the
 * source is unsupported (Req 4.2 is enforced by the caller when none matches).
 */
export function findAdapter(url: URL): SourceAdapter | undefined {
  return registry.adapters.find((adapter) => adapter.matches(url));
}
