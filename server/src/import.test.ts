/**
 * Integration tests for the `/api/import` proxy endpoint (task 10.3).
 *
 * These drive the real Fastify application built by `buildServer()` via
 * `app.inject(...)`, which exercises routing, the source adapter registry, the
 * 30-second abortable timeout wiring, and the wire-shape serialization without
 * binding a socket.
 *
 * The outbound `fetch` is stubbed on `globalThis` for every case so no real
 * network activity occurs: each test controls exactly what the "source" returns
 * (a body, a non-2xx status, a network rejection, or an AbortError standing in
 * for the 30-second timeout firing).
 *
 * Requirements covered: 4.1 (produce a structured deck from a supported
 * source), 4.2 (reject malformed / unsupported sources), 4.3 (abort after 30s),
 * 4.4 (retrieval failure), 4.5 (unparseable content is a retrieval failure),
 * 4.6 (attach source name when present), 4.7 (attach none when absent).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";

/** A card code matching the shared grammar `SET-[prefix]number[variant]`. */
const CARD_CODE = "OGN-007";
const CARD_CODE_VARIANT = "OGN-007a";

/** A supported text-decklist URL (matched by the `.txt` extension rule). */
const TEXT_URL = "https://example.com/decks/mydeck.txt";
/** A supported text-decklist URL (matched by the raw.githubusercontent host). */
const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/owner/repo/main/deck.txt";
/** A supported JSON-decklist URL (matched by the `.json` extension rule). */
const JSON_URL = "https://example.com/decks/mydeck.json";

/**
 * Build a stub `Response`-like object for the success/non-2xx paths. Only the
 * fields the server reads (`ok`, `status`, `text()`) are populated.
 */
function textResponse(body: string, status = 200): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  };
}

/** Install a fetch stub that resolves the given response for any URL. */
function stubFetchResolving(response: Partial<Response>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response as Response),
  );
}

/** Install a fetch stub that rejects with the given error for any URL. */
function stubFetchRejecting(error: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw error;
    }),
  );
}

describe("/api/import proxy", () => {
  let app: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    app = buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    // Restore the real global fetch after each case (Req: no leaked stubs).
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Req 4.1: a supported source produces a structured deck with quantities.
  it("returns 200 with deck entries for a supported text URL (Req 4.1)", async () => {
    stubFetchResolving(textResponse(`3 ${CARD_CODE}\n2 ${CARD_CODE_VARIANT}`));

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(TEXT_URL)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      deck: Array<[string, number]>;
      sourceName?: string;
    };
    expect(Array.isArray(body.deck)).toBe(true);
    expect(body.deck.length).toBeGreaterThan(0);
    // Every entry is a [code, quantity] pair with quantity >= 1.
    for (const [code, qty] of body.deck) {
      expect(typeof code).toBe("string");
      expect(qty).toBeGreaterThanOrEqual(1);
    }
  });

  // Req 4.1 (POST route parity): the same success via the POST body form.
  it("returns 200 for a supported URL submitted via POST body (Req 4.1)", async () => {
    stubFetchResolving(textResponse(`4 ${CARD_CODE}`));

    const response = await app.inject({
      method: "POST",
      url: "/api/import",
      payload: { url: GITHUB_RAW_URL },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { deck: Array<[string, number]> };
    expect(body.deck.length).toBeGreaterThan(0);
    expect(body.deck[0][1]).toBeGreaterThanOrEqual(1);
  });

  // Req 4.6: a source that includes a deck name has it associated.
  it("attaches sourceName when the source declares one (Req 4.6)", async () => {
    stubFetchResolving(
      textResponse(`# name: My Aggro Deck\n3 ${CARD_CODE}\n1 ${CARD_CODE_VARIANT}`),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(TEXT_URL)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { sourceName?: string };
    expect(body.sourceName).toBe("My Aggro Deck");
  });

  // Req 4.6 (JSON source): a JSON body `name` field becomes the source name.
  it("attaches sourceName from a JSON source name field (Req 4.6)", async () => {
    stubFetchResolving(
      textResponse(
        JSON.stringify({ name: "JSON Control", cards: { [CARD_CODE]: 3 } }),
      ),
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(JSON_URL)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      deck: Array<[string, number]>;
      sourceName?: string;
    };
    expect(body.sourceName).toBe("JSON Control");
    expect(body.deck.length).toBeGreaterThan(0);
  });

  // Req 4.7: a source with no deck name yields no sourceName on the wire.
  it("omits sourceName when the source declares none (Req 4.7)", async () => {
    stubFetchResolving(textResponse(`3 ${CARD_CODE}\n2 ${CARD_CODE_VARIANT}`));

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(TEXT_URL)}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { sourceName?: string };
    expect(body.sourceName).toBeUndefined();
    // The key is omitted from the serialized body entirely.
    expect(Object.prototype.hasOwnProperty.call(body, "sourceName")).toBe(false);
  });

  // Req 4.3: the 30-second abort firing surfaces as a 504 retrieval failure.
  // The abort is simulated directly (an AbortError rejection) rather than
  // waiting 30 seconds.
  it("returns 504 RETRIEVAL_FAILURE when retrieval aborts on timeout (Req 4.3)", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    stubFetchRejecting(abortError);

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(TEXT_URL)}`,
    });

    expect(response.statusCode).toBe(504);
    const body = response.json() as {
      error: { code: string; inputMethod: string };
    };
    expect(body.error.code).toBe("RETRIEVAL_FAILURE");
    expect(body.error.inputMethod).toBe("link");
  });

  // Req 4.4: a network-level failure surfaces as a 502 retrieval failure.
  it("returns 502 RETRIEVAL_FAILURE on a network error (Req 4.4)", async () => {
    stubFetchRejecting(new Error("ECONNREFUSED"));

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(TEXT_URL)}`,
    });

    expect(response.statusCode).toBe(502);
    const body = response.json() as {
      error: { code: string; inputMethod: string };
    };
    expect(body.error.code).toBe("RETRIEVAL_FAILURE");
    expect(body.error.inputMethod).toBe("link");
  });

  // Req 4.4: a non-2xx upstream status is also a retrieval failure.
  it("returns 502 RETRIEVAL_FAILURE on a non-2xx upstream status (Req 4.4)", async () => {
    stubFetchResolving(textResponse("Not Found", 404));

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(TEXT_URL)}`,
    });

    expect(response.statusCode).toBe(502);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe("RETRIEVAL_FAILURE");
  });

  // Req 4.5: content that yields no card with quantity >= 1 is a retrieval
  // failure, surfaced with a 502.
  it("returns 502 RETRIEVAL_FAILURE for unparseable content (Req 4.5)", async () => {
    stubFetchResolving(textResponse("this is not a decklist at all !@#$"));

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(TEXT_URL)}`,
    });

    expect(response.statusCode).toBe(502);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe("RETRIEVAL_FAILURE");
  });

  // Req 4.5: empty content likewise has no cards -> retrieval failure.
  it("returns 502 RETRIEVAL_FAILURE for empty content (Req 4.5)", async () => {
    stubFetchResolving(textResponse("   \n  \n"));

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent(TEXT_URL)}`,
    });

    expect(response.statusCode).toBe(502);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe("RETRIEVAL_FAILURE");
  });

  // Req 4.2: a well-formed URL with no supporting adapter is unsupported (415).
  // No network activity should occur for an unsupported source.
  it("returns 415 for a well-formed but unsupported source URL (Req 4.2)", async () => {
    const fetchSpy = vi.fn(async () => textResponse("ignored") as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent("https://example.com/decks/mydeck.pdf")}`,
    });

    expect(response.statusCode).toBe(415);
    const body = response.json() as {
      error: { code: string; inputMethod: string };
    };
    expect(body.error.code).toBe("UNSUPPORTED_SOURCE");
    expect(body.error.inputMethod).toBe("link");
    // Unsupported sources are rejected before any outbound fetch.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Req 4.2: a syntactically malformed URL is rejected with a 400.
  it("returns 400 for a malformed URL (Req 4.2)", async () => {
    const fetchSpy = vi.fn(async () => textResponse("ignored") as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent("not a url")}`,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNSUPPORTED_SOURCE");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Req 4.2: a non-http(s) protocol URL is rejected with a 400.
  it("returns 400 for a non-http(s) protocol URL (Req 4.2)", async () => {
    const fetchSpy = vi.fn(async () => textResponse("ignored") as Response);
    vi.stubGlobal("fetch", fetchSpy);

    const response = await app.inject({
      method: "GET",
      url: `/api/import?url=${encodeURIComponent("ftp://example.com/deck.txt")}`,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe("UNSUPPORTED_SOURCE");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Req 4.2 (missing url half): no url at all is a 400 with MISSING_URL.
  it("returns 400 MISSING_URL when no url is provided (Req 4.2)", async () => {
    const response = await app.inject({ method: "GET", url: "/api/import" });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe("MISSING_URL");
  });
});
