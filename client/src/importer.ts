/**
 * Client-side Link_Importer (Link_Importer client half).
 *
 * The Link_Importer is split across the client and the server proxy (design:
 * Components and Interfaces / Link_Importer). This client half:
 *  - Validates URL well-formedness up front and rejects malformed or
 *    unsupported-scheme URLs with an unsupported-source error, before any
 *    network activity (Req 4.2).
 *  - Calls the server `/api/import` proxy, which performs the outbound HTTP GET
 *    with the authoritative 30-second timeout and the source-support check.
 *  - Maps any proxy failure (network, HTTP error, timeout, unparseable content)
 *    to a retrieval-failure error, and a 415 (unsupported source) to an
 *    unsupported-source error (Reqs 4.4, 4.5, 4.2).
 *  - On success, reconstructs the deck from the wire `[code, qty]` entries and
 *    attaches the source name only when the proxy supplied one (Reqs 4.1, 4.6,
 *    4.7).
 *
 * The concrete importer is exposed as {@link linkImporter} and, for testing,
 * via {@link createLinkImporter} so a mock `fetch` can be injected.
 */

import {
  err,
  ok,
  type ImportedDeck,
  type LinkImporter,
  type Result,
  type StructuredDeck,
} from "@riftbound/shared";

/** The proxy endpoint the client half calls (task 10.1). */
const IMPORT_ENDPOINT = "/api/import";

/**
 * The wire shape returned by a successful `/api/import` (mirrors the server's
 * `ImportSuccessBody`). The deck is emitted as `[cardCode, quantity]` entries
 * because a `Map` does not survive `JSON.stringify`; it is reconstructed here
 * with `new Map(deck)`.
 */
interface ImportSuccessBody {
  deck?: Array<[string, number]>;
  sourceName?: string;
}

/**
 * The wire shape returned by a failed `/api/import` (mirrors the server's
 * `ImportErrorBody`): a single machine-readable error object.
 */
interface ImportErrorBody {
  error?: {
    code?: string;
    message?: string;
    inputMethod?: "link";
  };
}

/** The `fetch` implementation the importer uses; injectable for tests. */
type FetchImpl = typeof fetch;

/** Build an unsupported-source error (Req 4.2). */
function unsupportedSourceError(message: string): Result<ImportedDeck> {
  return err({
    code: "UNSUPPORTED_SOURCE",
    message,
    inputMethod: "link",
  });
}

/** Build a retrieval-failure error (Reqs 4.4, 4.5). */
function retrievalFailureError(message: string): Result<ImportedDeck> {
  return err({
    code: "RETRIEVAL_FAILURE",
    message,
    inputMethod: "link",
  });
}

/**
 * Validate a URL client-side: it must parse and use the `http`/`https` scheme.
 * Anything else is an unsupported source (Req 4.2). The authoritative
 * source-support check remains server-side (a 415 response).
 */
function validateUrl(url: string): Result<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return err({
      code: "UNSUPPORTED_SOURCE",
      message: "The url is not well-formed.",
      inputMethod: "link",
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return err({
      code: "UNSUPPORTED_SOURCE",
      message: "Only http and https urls are supported.",
      inputMethod: "link",
    });
  }
  return ok(parsed);
}

/**
 * Reconstruct a {@link StructuredDeck} from the wire `[code, qty]` entries,
 * keeping only well-formed entries with an integer quantity of one or more.
 */
function reconstructDeck(
  entries: Array<[string, number]> | undefined,
): StructuredDeck {
  const deck: StructuredDeck = new Map();
  if (!Array.isArray(entries)) {
    return deck;
  }
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }
    const [code, quantity] = entry;
    if (typeof code === "string" && Number.isInteger(quantity) && quantity >= 1) {
      deck.set(code, quantity);
    }
  }
  return deck;
}

/** Safely read the JSON body of a response, or `undefined` if it is not JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Create a {@link LinkImporter} bound to a `fetch` implementation.
 *
 * Defaults to the global `fetch`; tests inject a mock so no network is touched.
 */
export function createLinkImporter(fetchImpl: FetchImpl = fetch): LinkImporter {
  return {
    async import(url: string): Promise<Result<ImportedDeck>> {
      // Req 4.2: reject malformed or unsupported-scheme URLs before any request.
      const validated = validateUrl(url);
      if (!validated.ok) {
        return validated;
      }

      // Delegate to the proxy, which owns the 30s timeout and the authoritative
      // source-support check. Any thrown error (network failure, etc.) is a
      // retrieval failure with no deck (Req 4.4).
      let response: Response;
      try {
        response = await fetchImpl(IMPORT_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });
      } catch {
        return retrievalFailureError(
          "The decklist could not be retrieved from the source.",
        );
      }

      if (!response.ok) {
        // Map the proxy's error body when present, otherwise a generic failure.
        const body = (await readJson(response)) as ImportErrorBody | undefined;
        const message =
          body?.error?.message ??
          "The decklist could not be retrieved from the source.";
        // A 415 means the server rejected the source as unsupported (Req 4.2);
        // surface that distinctly. All other statuses are retrieval failures
        // (Reqs 4.3, 4.4, 4.5).
        if (response.status === 415) {
          return unsupportedSourceError(message);
        }
        return retrievalFailureError(message);
      }

      // Success: reconstruct the deck and attach the source name only when the
      // proxy supplied one (Reqs 4.1, 4.6, 4.7).
      const body = (await readJson(response)) as ImportSuccessBody | undefined;
      const deck = reconstructDeck(body?.deck);

      // Defensive parity with the proxy's Req 4.5 guarantee: a body with no
      // usable cards is a retrieval failure rather than an empty success.
      if (deck.size === 0) {
        return retrievalFailureError(
          "Retrieved content contained no cards with a quantity of one or more.",
        );
      }

      const sourceName =
        typeof body?.sourceName === "string" ? body.sourceName : undefined;

      return ok(
        sourceName === undefined ? { deck } : { deck, sourceName },
      );
    },
  };
}

/**
 * The default client Link_Importer, using the global `fetch`. Wire this into
 * the Comparator (task 13.1) as the injected {@link LinkImporter}.
 */
export const linkImporter: LinkImporter = createLinkImporter();
