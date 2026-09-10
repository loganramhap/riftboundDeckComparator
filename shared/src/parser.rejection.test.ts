/**
 * Unit tests for Deck_Parser rejection reporting (Req 2.5).
 *
 * A single malformed line at a known position, placed among valid lines,
 * must cause `parse` to reject the whole submission and report the failing
 * line's 1-based number and content, without producing a structured deck.
 */

import { describe, it, expect } from "vitest";
import { parse } from "./parser.js";

describe("Deck_Parser parse rejection reporting (Req 2.5)", () => {
  it("reports the line number and content of a malformed line among valid lines", () => {
    // Valid lines at 1 and 2, malformed line at position 3, valid line at 4.
    const malformed = "not a valid line";
    const text = ["3 OGN-007a", "2 VEN-SP1", malformed, "1 RAD-R05"].join("\n");

    const result = parse(text);

    // No structured deck is produced.
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected parse to reject the submission");
    }

    expect(result.error.code).toBe("PARSE_LINE");
    expect(result.error.lineNumber).toBe(3);
    expect(result.error.lineContent).toBe(malformed);
  });

  it("reports the first malformed line when it appears at position 1", () => {
    const malformed = "@@@ garbage";
    const text = [malformed, "3 OGN-007a"].join("\n");

    const result = parse(text);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected parse to reject the submission");
    }
    expect(result.error.lineNumber).toBe(1);
    expect(result.error.lineContent).toBe(malformed);
  });

  it("reports a line whose quantity is out of the 1-99 range", () => {
    // Quantity 0 is outside 1..99, so this line is malformed (Req 2.5).
    const malformed = "0 OGN-007a";
    const text = ["2 VEN-SP1", malformed].join("\n");

    const result = parse(text);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected parse to reject the submission");
    }
    expect(result.error.lineNumber).toBe(2);
    expect(result.error.lineContent).toBe(malformed);
  });

  it("reports a line that has no quantity and is not a section header", () => {
    // A bare word with no leading quantity is neither a card line nor a
    // section header (no trailing ":"), so it is malformed.
    const malformed = "Sorcery";
    const text = ["1 RAD-R05", "3 OGN-007a", malformed].join("\n");

    const result = parse(text);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected parse to reject the submission");
    }
    expect(result.error.lineNumber).toBe(3);
    expect(result.error.lineContent).toBe(malformed);
  });

  it("accepts a quantity followed by a free-text card name", () => {
    // With name lists supported, "3 Traveling Merchant" is a valid line keyed
    // by the verbatim card name (a token that is not a valid card code is a
    // name, not an error).
    const text = ["3 Traveling Merchant", "1 Kennen, Heart of the Tempest"].join(
      "\n",
    );

    const result = parse(text);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected parse to succeed: ${result.error.message}`);
    }
    expect(result.value.get("Traveling Merchant")).toBe(3);
    expect(result.value.get("Kennen, Heart of the Tempest")).toBe(1);
  });

  it("ignores section headers and pools cards across sections", () => {
    const text = [
      "Legend:",
      "1 Kennen, Heart of the Tempest",
      "MainDeck:",
      "3 Traveling Merchant",
      "Rune Pool:",
      "9 Chaos Rune",
    ].join("\n");

    const result = parse(text);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected parse to succeed: ${result.error.message}`);
    }
    // Headers contribute no entries; cards are keyed by name.
    expect(result.value.size).toBe(3);
    expect(result.value.get("Chaos Rune")).toBe(9);
  });
});
