/**
 * Integration tests for the client-side Link_Importer (task 11.2).
 *
 * These exercise `createLinkImporter` with a mock `fetch` (vi.fn) so no real
 * network is touched. They cover: client-side URL validation before any
 * request (Req 4.2), retrieval failures from the proxy (Reqs 4.4, 4.5), and
 * successful imports with and without a source-provided deck name (Reqs 4.1,
 * 4.6, 4.7).
 */

import { describe, expect, it, vi } from "vitest";
import { createLinkImporter } from "./importer.js";

/**
 * Build a minimal `Response`-like object with just the fields the importer
 * reads (`ok`, `status`, `json`). Cast to `Response` to satisfy the fetch type
 * without pulling in the full DOM Response surface.
 */
function mockResponse(init: {
  ok: boolean;
  status: number;
  body?: unknown;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => init.body,
  } as unknown as Response;
}

describe("Link_Importer (client half)", () => {
  describe("URL validation before any request (Req 4.2)", () => {
    it("rejects a non-URL string as UNSUPPORTED_SOURCE without calling fetch", async () => {
      const mockFetch = vi.fn();
      const importer = createLinkImporter(mockFetch);

      const result = await importer.import("not a url");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED_SOURCE");
        expect(result.error.inputMethod).toBe("link");
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects an unsupported scheme (ftp) as UNSUPPORTED_SOURCE without calling fetch", async () => {
      const mockFetch = vi.fn();
      const importer = createLinkImporter(mockFetch);

      const result = await importer.import("ftp://x/y");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED_SOURCE");
      }
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("proxy error mapping (Reqs 4.2, 4.4, 4.5)", () => {
    it("maps a 415 response to UNSUPPORTED_SOURCE", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 415,
          body: {
            error: { code: "UNSUPPORTED_SOURCE", message: "unsupported source" },
          },
        }),
      );
      const importer = createLinkImporter(mockFetch);

      const result = await importer.import("https://decks.example.com/abc");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNSUPPORTED_SOURCE");
      }
    });

    it("maps a rejected fetch (network failure) to RETRIEVAL_FAILURE (Req 4.4)", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("network down"));
      const importer = createLinkImporter(mockFetch);

      const result = await importer.import("https://decks.example.com/abc");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("RETRIEVAL_FAILURE");
        expect(result.error.inputMethod).toBe("link");
      }
    });

    it("maps a non-ok 502 response to RETRIEVAL_FAILURE (Reqs 4.4, 4.5)", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 502,
          body: {
            error: { code: "RETRIEVAL_FAILURE", message: "upstream failed" },
          },
        }),
      );
      const importer = createLinkImporter(mockFetch);

      const result = await importer.import("https://decks.example.com/abc");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("RETRIEVAL_FAILURE");
      }
    });
  });

  describe("successful import (Reqs 4.1, 4.6, 4.7)", () => {
    it("reconstructs the deck and attaches the source name when present (Reqs 4.1, 4.6)", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          body: {
            deck: [
              ["OGN-007a", 3],
              ["VEN-SP1", 1],
            ],
            sourceName: "My Deck",
          },
        }),
      );
      const importer = createLinkImporter(mockFetch);

      const result = await importer.import("https://decks.example.com/abc");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deck).toBeInstanceOf(Map);
        expect(result.value.deck.get("OGN-007a")).toBe(3);
        expect(result.value.deck.get("VEN-SP1")).toBe(1);
        expect(result.value.deck.size).toBe(2);
        expect(result.value.sourceName).toBe("My Deck");
      }
    });

    it("produces the deck with no source name when the proxy omits it (Req 4.7)", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          body: {
            deck: [["OGN-007a", 2]],
          },
        }),
      );
      const importer = createLinkImporter(mockFetch);

      const result = await importer.import("https://decks.example.com/abc");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deck).toBeInstanceOf(Map);
        expect(result.value.deck.get("OGN-007a")).toBe(2);
        expect(result.value.deck.size).toBe(1);
        expect(result.value.sourceName).toBeUndefined();
      }
    });
  });
});
