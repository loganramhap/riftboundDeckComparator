/**
 * Share_Service: creates and resolves self-contained shareable comparison links.
 *
 * The full comparison state (both decks and both names) is serialized to JSON,
 * compressed, and base64url-encoded into a URL fragment of the form `#c=...`.
 * Because the payload lives in the fragment it never reaches the server, and
 * because the comparison result is deterministic from the two decks the link
 * stores only the decks and names and recomputes the result on open.
 *
 * See the design document sections "Share_Service" and "ShareableLink Encoding".
 *
 * Compression uses `fflate` (a tiny, dependency-free, isomorphic library) so the
 * same code runs unchanged in both the browser and Node without relying on
 * environment-specific APIs like `zlib` or the DOM `CompressionStream`.
 */

import { deflateSync, inflateSync, strToU8, strFromU8 } from "fflate";
import type { StructuredDeck, SharePayload } from "./types.js";
import { type Result, ok, err } from "./types.js";

/** The fragment key under which the encoded payload is stored: `#c=...`. */
const FRAGMENT_KEY = "c";

/**
 * The wire form of a {@link SharePayload}. `Map` is not JSON-serializable, so
 * each {@link StructuredDeck} is represented as an array of `[cardCode, qty]`
 * entry tuples. A version tag guards against future format changes.
 */
interface WirePayload {
  /** Wire format version. */
  v: 1;
  /** First deck as [cardCode, quantity] entries. */
  a: Array<[string, number]>;
  /** Second deck as [cardCode, quantity] entries. */
  b: Array<[string, number]>;
  /** First deck name, verbatim. */
  na: string;
  /** Second deck name, verbatim. */
  nb: string;
}

/**
 * Encode the full comparison state into a shareable link fragment.
 *
 * The returned value is the fragment portion (`#c=<encoded>`); callers combine
 * it with their own origin/path to form a complete URL. (Req 9.1)
 */
export function createLink(payload: SharePayload): string {
  const wire: WirePayload = {
    v: 1,
    a: [...payload.first.entries()],
    b: [...payload.second.entries()],
    na: payload.firstName,
    nb: payload.secondName,
  };

  const json = JSON.stringify(wire);
  const compressed = deflateSync(strToU8(json));
  const encoded = toBase64Url(compressed);
  return `#${FRAGMENT_KEY}=${encoded}`;
}

/**
 * Reconstruct a {@link SharePayload} from a shareable link.
 *
 * Accepts either a full URL or a bare fragment string. Reverses the encoding
 * process, preserving each deck name verbatim. Any malformed or
 * unreconstructable link yields an invalid-link error with no partial payload.
 * (Reqs 9.2, 9.4)
 */
export function resolveLink(url: string): Result<SharePayload> {
  const encoded = extractEncoded(url);
  if (encoded === null) {
    return invalidLink("The shareable link is missing its comparison data.");
  }

  let wire: unknown;
  try {
    const compressed = fromBase64Url(encoded);
    const json = strFromU8(inflateSync(compressed));
    wire = JSON.parse(json);
  } catch {
    return invalidLink("The shareable link could not be decoded.");
  }

  if (!isWirePayload(wire)) {
    return invalidLink("The shareable link's contents are not a valid comparison.");
  }

  const first = entriesToDeck(wire.a);
  const second = entriesToDeck(wire.b);
  if (first === null || second === null) {
    return invalidLink("The shareable link contains malformed deck data.");
  }

  return ok({
    first,
    second,
    firstName: wire.na,
    secondName: wire.nb,
  });
}

/**
 * Extract the base64url-encoded payload from a full URL or bare fragment.
 * Returns null when no `c=` fragment parameter is present.
 */
function extractEncoded(url: string): string | null {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : url;
  if (fragment.length === 0) {
    return null;
  }
  // The fragment may contain multiple `key=value` pairs separated by `&`.
  for (const part of fragment.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0) {
      continue;
    }
    if (part.slice(0, eq) === FRAGMENT_KEY) {
      const value = part.slice(eq + 1);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Rebuild a {@link StructuredDeck} from wire entries, validating that every
 * entry is a `[string, positive-integer]` tuple. Returns null on any malformed
 * entry so the whole link is rejected with no partial payload.
 */
function entriesToDeck(entries: Array<[string, number]>): StructuredDeck | null {
  const deck: StructuredDeck = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return null;
    }
    const [code, qty] = entry;
    if (typeof code !== "string" || code.length === 0) {
      return null;
    }
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) {
      return null;
    }
    deck.set(code, qty);
  }
  return deck;
}

/** Structural type guard for a decoded {@link WirePayload}. */
function isWirePayload(value: unknown): value is WirePayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const w = value as Record<string, unknown>;
  return (
    w.v === 1 &&
    Array.isArray(w.a) &&
    Array.isArray(w.b) &&
    typeof w.na === "string" &&
    typeof w.nb === "string"
  );
}

/** Build an invalid-link error result. (Req 9.4) */
function invalidLink(message: string): Result<SharePayload> {
  return err({ code: "INVALID_LINK", message });
}

/** Encode raw bytes as URL-safe base64 (base64url) without padding. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode a URL-safe base64 (base64url) string back into raw bytes. */
function fromBase64Url(encoded: string): Uint8Array {
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad === 2) {
    base64 += "==";
  } else if (pad === 3) {
    base64 += "=";
  } else if (pad === 1) {
    // Not a valid base64 length; caller treats the resulting error as invalid.
    throw new Error("Invalid base64url length");
  }

  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, "base64"));
}
