/**
 * Unit tests for Share_Service invalid-link handling (Req 9.4).
 *
 * A corrupted or unreconstructable Shareable Link must cause `resolveLink` to
 * return an invalid-link error (`code === "INVALID_LINK"`) and must NOT yield a
 * partial or altered comparison: the failed result carries no `value` field.
 *
 * These are example/edge-case tests (not property tests); the share round-trip
 * property is covered separately by Property 12.
 */

import { describe, it, expect } from "vitest";
import { createLink, resolveLink } from "./share.js";
import type { SharePayload } from "./types.js";

/** A small, valid payload used to derive a real link for corruption cases. */
function samplePayload(): SharePayload {
  return {
    first: new Map([
      ["OGN-007a", 3],
      ["VEN-SP1", 2],
    ]),
    second: new Map([["RAD-R05", 1]]),
    firstName: "Aggro",
    secondName: "Control",
  };
}

/**
 * Assert that a resolveLink result is an invalid-link failure with no partial
 * payload. A `Result` union only carries `value` on success, so a failed
 * result must not expose one.
 */
function expectInvalidLink(result: ReturnType<typeof resolveLink>): void {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected resolveLink to reject the link");
  }
  expect(result.error.code).toBe("INVALID_LINK");
  // No partial or altered comparison: the failed result has no `value`.
  expect("value" in result).toBe(false);
}

describe("Share_Service resolveLink invalid-link handling (Req 9.4)", () => {
  it("rejects a link with no fragment at all", () => {
    expectInvalidLink(resolveLink("https://example.com/"));
  });

  it("rejects a bare empty string", () => {
    expectInvalidLink(resolveLink(""));
  });

  it("rejects a fragment missing the `c=` payload key", () => {
    // Fragment present, but under the wrong key.
    expectInvalidLink(resolveLink("https://example.com/#x=abc123"));
  });

  it("rejects a fragment with the `c` key but an empty value", () => {
    expectInvalidLink(resolveLink("https://example.com/#c="));
  });

  it("rejects garbage base64 in the payload", () => {
    // "!!!!" is not valid base64url and cannot be decoded/inflated.
    expectInvalidLink(resolveLink("#c=!!!!not-valid-base64!!!!"));
  });

  it("rejects a base64url string of invalid length (unreconstructable)", () => {
    // Length %4 === 1 is not a valid base64url length; decoding throws.
    expectInvalidLink(resolveLink("#c=A"));
  });

  it("rejects a truncated payload derived from a real link", () => {
    const link = createLink(samplePayload());
    // Chop the encoded payload in half so inflate/JSON parse fails.
    const eq = link.indexOf("=");
    const key = link.slice(0, eq + 1); // "#c="
    const encoded = link.slice(eq + 1);
    const truncated = key + encoded.slice(0, Math.floor(encoded.length / 2));

    expectInvalidLink(resolveLink(truncated));
  });

  it("rejects a payload whose bytes are valid base64url but not deflate data", () => {
    // "aGVsbG8" is base64url for "hello" — decodes fine, but is not a valid
    // deflate stream, so inflate throws and the link is rejected.
    expectInvalidLink(resolveLink("#c=aGVsbG8"));
  });

  it("does not reconstruct any partial deck from a corrupted link", () => {
    const result = resolveLink("#c=totally-corrupted-payload-data");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected resolveLink to reject the link");
    }
    // Nothing that could feed a partial comparison leaks through.
    expect("value" in result).toBe(false);
    expect(result.error.message.length).toBeGreaterThan(0);
  });
});
