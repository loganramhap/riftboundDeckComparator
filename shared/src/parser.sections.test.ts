/**
 * Unit tests for section-aware text parsing (parseWithSections).
 *
 * Section headers set the active section for the cards that follow; header
 * variants map to the canonical section labels; cards before any header or
 * under an unrecognized header fall to the default section ("Main Deck").
 */

import { describe, it, expect } from "vitest";
import { parseWithSections } from "./parser.js";
import type { Section } from "./types.js";

/** Extract the section assigned to a given card key. */
function sectionOf(
  result: ReturnType<typeof parseWithSections>,
  key: string,
): Section | undefined {
  if (!result.ok) {
    throw new Error(`expected parse to succeed: ${result.error.message}`);
  }
  return result.value.sections.get(key);
}

describe("parseWithSections", () => {
  it("assigns each card to the canonical section from its header", () => {
    const text = [
      "Legend:",
      "1 Kennen, Heart of the Tempest",
      "Chosen Champion:",
      "1 Kennen, Storm of Shuriken",
      "Battlefields:",
      "1 Minefield",
      "Main Deck:",
      "3 Traveling Merchant",
      "Runes:",
      "9 Chaos Rune",
      "Sideboard:",
      "1 Gust",
    ].join("\n");

    const result = parseWithSections(text);

    expect(sectionOf(result, "Kennen, Heart of the Tempest")).toBe("Legend");
    expect(sectionOf(result, "Kennen, Storm of Shuriken")).toBe(
      "Chosen Champion",
    );
    expect(sectionOf(result, "Minefield")).toBe("Battlefields");
    expect(sectionOf(result, "Traveling Merchant")).toBe("Main Deck");
    expect(sectionOf(result, "Chaos Rune")).toBe("Runes");
    expect(sectionOf(result, "Gust")).toBe("Sideboard");
  });

  it("recognizes common header variants", () => {
    const text = [
      "Champion:", // -> Chosen Champion
      "1 Kennen, Storm of Shuriken",
      "MainDeck:", // -> Main Deck (no space)
      "3 Traveling Merchant",
      "Rune Pool:", // -> Runes
      "9 Chaos Rune",
    ].join("\n");

    const result = parseWithSections(text);

    expect(sectionOf(result, "Kennen, Storm of Shuriken")).toBe(
      "Chosen Champion",
    );
    expect(sectionOf(result, "Traveling Merchant")).toBe("Main Deck");
    expect(sectionOf(result, "Chaos Rune")).toBe("Runes");
  });

  it("defaults cards before any header to Main Deck", () => {
    const text = ["3 Traveling Merchant", "2 Stacked Deck"].join("\n");
    const result = parseWithSections(text);

    expect(sectionOf(result, "Traveling Merchant")).toBe("Main Deck");
    expect(sectionOf(result, "Stacked Deck")).toBe("Main Deck");
  });

  it("leaves the active section unchanged under an unrecognized header", () => {
    const text = [
      "Runes:",
      "9 Chaos Rune",
      "Notes:", // unrecognized -> section stays "Runes"
      "3 Order Rune",
    ].join("\n");
    const result = parseWithSections(text);

    expect(sectionOf(result, "Chaos Rune")).toBe("Runes");
    expect(sectionOf(result, "Order Rune")).toBe("Runes");
  });

  it("keeps the first section seen when a card appears twice", () => {
    const text = [
      "Main Deck:",
      "2 Gust",
      "Sideboard:",
      "1 Gust", // same card; first section (Main Deck) wins
    ].join("\n");
    const result = parseWithSections(text);

    // Quantities still sum across occurrences.
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.deck.get("Gust")).toBe(3);
    expect(result.value.sections.get("Gust")).toBe("Main Deck");
  });
});
