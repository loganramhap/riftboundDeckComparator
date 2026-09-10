/**
 * Server entry point for the Riftbound Deck Comparator.
 *
 * Responsibilities (design: "Architecture" / "Server Layer"):
 *  1. Serve the built client bundle (static assets) produced by Vite.
 *  2. Expose a single `/api/import` proxy endpoint that performs an outbound
 *     HTTP GET on behalf of the browser (avoiding CORS) with a hard 30-second
 *     abortable timeout, then hands the retrieved content to the source
 *     adapter registry (`./sources`) for parsing.
 *
 * The process is a single Node server suitable for an LXC container: no
 * database, no external services beyond the outbound fetch it proxies. Share
 * links live entirely in the URL fragment, so nothing here is stateful.
 *
 * Requirements: 4.1 (produce a structured deck from a supported source), 4.3
 * (abort retrieval after 30 seconds), 4.4 (report retrieval failures without a
 * deck). Unsupported-source (4.2) and no-parseable-cards (4.5) handling live in
 * the registry and are relayed here.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Fastify, { type FastifyReply } from "fastify";
import fastifyStatic from "@fastify/static";
import type { StructuredDeck } from "@riftbound/shared";
import { findAdapter } from "./sources/index.js";

/** Hard cap on outbound retrieval time (requirement 4.3). */
const IMPORT_TIMEOUT_MS = 30_000;

/**
 * The wire shape returned by a successful `/api/import`.
 *
 * A {@link StructuredDeck} is a `Map`, which `JSON.stringify` serializes to an
 * empty object, so the deck is emitted as an array of `[cardCode, quantity]`
 * entries. The client importer (task 11.1) reconstructs the deck with
 * `new Map(deck)`. `sourceName` is present only when the source supplied one
 * (Reqs 4.6, 4.7).
 */
interface ImportSuccessBody {
  /** `[cardCode, quantity]` entries; reconstruct with `new Map(deck)`. */
  deck: Array<[string, number]>;
  /** Source-provided deck name, when present. */
  sourceName?: string;
}

/**
 * The wire shape returned by a failed `/api/import`: a single machine-readable
 * error object mirroring the shared `DeckError` contract.
 */
interface ImportErrorBody {
  error: {
    code: string;
    message: string;
    inputMethod: "link";
  };
}

/**
 * Resolve the directory containing built client assets.
 *
 * At runtime this file lives at `server/dist/index.js`, so the client bundle
 * (`client/dist`) sits at `../../client/dist` relative to it. This can be
 * overridden with the `CLIENT_DIST` environment variable, which is useful when
 * the LXC container lays the files out differently.
 */
function resolveClientDist(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return process.env.CLIENT_DIST ?? resolve(here, "../../client/dist");
}

/** Query/body shape accepted by `/api/import`. */
interface ImportQuery {
  url?: string;
}
interface ImportBody {
  url?: string;
}

/** Build a `link`-attributed error body for a given code and message. */
function importError(code: string, message: string): ImportErrorBody {
  return { error: { code, message, inputMethod: "link" } };
}

/** Whether a thrown fetch error represents an abort (the 30s timeout firing). */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      (error as { code?: string }).code === "ABORT_ERR")
  );
}

/**
 * Perform an outbound GET with a 30-second abortable timeout.
 *
 * Resolves with the response body text. Throws on network failure, a non-2xx
 * HTTP status, or an abort (timeout). The `AbortController` is always cleaned
 * up via the `finally` clearing of the timer.
 */
async function fetchWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/html,application/json,text/plain,*/*" },
    });
    if (!response.ok) {
      throw new Error(`upstream responded with status ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Serialize a {@link StructuredDeck} (a `Map`) into JSON-safe `[code, qty]`
 * entries. See {@link ImportSuccessBody} for the reconstruction contract.
 */
function serializeDeck(deck: StructuredDeck): Array<[string, number]> {
  return [...deck.entries()];
}

/**
 * Core `/api/import` handler shared by the GET and POST routes.
 *
 * Status mapping:
 *   400  malformed / missing URL (Req 4.2, well-formedness half)
 *   415  no supported source adapter matched the URL (Req 4.2)
 *   502  retrieval failed / content had no parseable cards (Reqs 4.4, 4.5)
 *   504  retrieval exceeded the 30-second timeout (Req 4.3)
 *   200  a structured deck was produced (Req 4.1)
 */
async function handleImport(
  rawUrl: string | undefined,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (!rawUrl || rawUrl.trim() === "") {
    return reply
      .code(400)
      .send(importError("MISSING_URL", "A url is required."));
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return reply
      .code(400)
      .send(importError("UNSUPPORTED_SOURCE", "The url is not well-formed."));
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return reply
      .code(400)
      .send(
        importError(
          "UNSUPPORTED_SOURCE",
          "Only http and https urls are supported.",
        ),
      );
  }

  // Req 4.2: an unsupported source is rejected before any network activity.
  const adapter = findAdapter(parsedUrl);
  if (!adapter) {
    return reply
      .code(415)
      .send(
        importError(
          "UNSUPPORTED_SOURCE",
          "The url does not reference a supported decklist source.",
        ),
      );
  }

  // Reqs 4.3 / 4.4: proxy the outbound GET with a 30s abort; any failure is a
  // retrieval failure with no deck.
  let rawContent: string;
  try {
    rawContent = await fetchWithTimeout(parsedUrl.toString());
  } catch (error) {
    if (isAbortError(error)) {
      return reply
        .code(504)
        .send(
          importError(
            "RETRIEVAL_FAILURE",
            "Retrieval exceeded the 30 second limit.",
          ),
        );
    }
    return reply
      .code(502)
      .send(
        importError(
          "RETRIEVAL_FAILURE",
          "The decklist could not be retrieved from the source.",
        ),
      );
  }

  // The adapter returns a discriminated Result. Empty/unparseable content is
  // already mapped to a RETRIEVAL_FAILURE by the registry (Req 4.5).
  const parsed = adapter.parse(rawContent);
  if (!parsed.ok) {
    return reply.code(502).send({
      error: {
        code: parsed.error.code,
        message: parsed.error.message,
        inputMethod: "link" as const,
      },
    });
  }

  // Req 4.1: a structured deck was produced. Emit it as JSON-safe entries.
  const body: ImportSuccessBody = {
    deck: serializeDeck(parsed.value.deck),
    ...(parsed.value.sourceName !== undefined
      ? { sourceName: parsed.value.sourceName }
      : {}),
  };
  return reply.code(200).send(body);
}

/**
 * Build and configure the Fastify application. Exported so tests (task 10.3)
 * can drive it with `app.inject(...)` without binding a socket.
 */
export function buildServer() {
  const app = Fastify({ logger: true });

  // Serve the built client bundle. The `/api/*` routes are registered after
  // and take precedence over the static wildcard for their exact paths.
  app.register(fastifyStatic, {
    root: resolveClientDist(),
    prefix: "/",
  });

  app.get<{ Querystring: ImportQuery }>(
    "/api/import",
    async (request, reply) => handleImport(request.query.url, reply),
  );

  app.post<{ Body: ImportBody }>("/api/import", async (request, reply) =>
    handleImport(request.body?.url, reply),
  );

  return app;
}

/** Start listening when run directly (not when imported by tests). */
async function start(): Promise<void> {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

// Only auto-start when this module is the process entry point.
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void start();
}
