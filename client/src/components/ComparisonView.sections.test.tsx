/**
 * Unit tests for section grouping in the comparison view.
 *
 * Entries carrying a `section` are rendered grouped under section headings in
 * canonical order (Legend, Chosen Champion, Battlefields, Main Deck, Runes,
 * Sideboard); only sections with entries appear.
 */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { withSections, type ComparisonResult, type Section } from "@riftbound/shared";
import { ComparisonView } from "./ComparisonView.js";

afterEach(() => {
  cleanup();
});

describe("ComparisonView section grouping", () => {
  it("renders section headings in canonical order and only for non-empty sections", () => {
    const result: ComparisonResult = {
      differences: [
        { identity: "Traveling Merchant", firstQuantity: 3, secondQuantity: 2, section: "Main Deck" },
        { identity: "Kennen, Heart of the Tempest", firstQuantity: 1, secondQuantity: 0, section: "Legend" },
      ],
      shared: [
        { identity: "Chaos Rune", firstQuantity: 9, secondQuantity: 9, section: "Runes" },
      ],
    };

    const { container } = render(
      <ComparisonView firstName="A" secondName="B" result={result} />,
    );

    const headings = within(container)
      .getAllByTestId("section-heading")
      .map((el) => el.textContent);

    // Canonical order: Legend before Main Deck before Runes; Chosen Champion,
    // Battlefields, Sideboard omitted (no entries).
    expect(headings).toEqual(["Legend", "Main Deck", "Runes"]);
  });

  it("places each card under its section's group", () => {
    const result: ComparisonResult = {
      differences: [
        { identity: "Minefield", firstQuantity: 1, secondQuantity: 0, section: "Battlefields" },
      ],
      shared: [
        { identity: "Gust", firstQuantity: 1, secondQuantity: 1, section: "Sideboard" },
      ],
    };

    const { container } = render(
      <ComparisonView firstName="A" secondName="B" result={result} />,
    );

    const groupFor = (section: Section) =>
      container.querySelector(`[data-testid="section-group"][data-section="${section}"]`);

    const battlefields = groupFor("Battlefields");
    const sideboard = groupFor("Sideboard");
    expect(battlefields).not.toBeNull();
    expect(sideboard).not.toBeNull();

    expect(within(battlefields as HTMLElement).getByText("Minefield")).toBeTruthy();
    expect(within(sideboard as HTMLElement).getByText("Gust")).toBeTruthy();
  });

  it("defaults entries with no section to Main Deck (via withSections)", () => {
    const base: ComparisonResult = {
      differences: [{ identity: "OGN-007", firstQuantity: 3, secondQuantity: 1 }],
      shared: [],
    };
    // Empty lookup -> everything falls to the default section.
    const annotated = withSections(base, new Map());

    const { container } = render(
      <ComparisonView firstName="A" secondName="B" result={annotated} />,
    );

    const heading = within(container).getByTestId("section-heading");
    expect(heading.textContent).toBe("Main Deck");
  });
});
