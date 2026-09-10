/**
 * Unit tests for card-name resolution in the comparison view.
 *
 * A card code with a known name renders as the name (with the code as a
 * secondary label); an unknown code falls back to the code itself; a free-text
 * name identity renders verbatim.
 */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { ComparisonResult } from "@riftbound/shared";
import { ComparisonView } from "./ComparisonView.js";
import { resolveCardName } from "../cardNames.js";

afterEach(() => {
  cleanup();
});

describe("ComparisonView card names", () => {
  it("renders a known card code as its resolved name", () => {
    // SFD-145 is "Switcheroo" in the bundled data.
    const known = resolveCardName("SFD-145");
    expect(known).toBe("Switcheroo");

    const result: ComparisonResult = {
      differences: [
        { identity: "SFD-145", firstQuantity: 3, secondQuantity: 2, section: "Main Deck" },
      ],
      shared: [],
    };

    const { container } = render(
      <ComparisonView firstName="A" secondName="B" result={result} />,
    );

    const row = container.querySelector('[data-identity="SFD-145"]');
    expect(row).not.toBeNull();
    const scope = within(row as HTMLElement);
    // Name shown as the primary label...
    expect(scope.getByText("Switcheroo")).toBeTruthy();
    // ...with the raw code as a secondary label.
    expect(scope.getByText("SFD-145")).toBeTruthy();
  });

  it("falls back to the code when no name is known", () => {
    const result: ComparisonResult = {
      differences: [
        { identity: "ZZZ-999", firstQuantity: 1, secondQuantity: 0, section: "Main Deck" },
      ],
      shared: [],
    };

    const { container } = render(
      <ComparisonView firstName="A" secondName="B" result={result} />,
    );

    const row = container.querySelector('[data-identity="ZZZ-999"]');
    expect(within(row as HTMLElement).getByText("ZZZ-999")).toBeTruthy();
  });

  it("renders a free-text name identity verbatim", () => {
    const result: ComparisonResult = {
      differences: [],
      shared: [
        { identity: "Traveling Merchant", firstQuantity: 3, secondQuantity: 3, section: "Main Deck" },
      ],
    };

    const { container } = render(
      <ComparisonView firstName="A" secondName="B" result={result} />,
    );

    expect(within(container).getByText("Traveling Merchant")).toBeTruthy();
  });
});
