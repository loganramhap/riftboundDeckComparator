/**
 * Unit tests for rendering indicators (task 12.4).
 *
 * Example/edge-case tests (not property tests) verifying:
 * - A Card Difference renders with a distinguishing indicator that sets it
 *   apart from a Shared Card in the graphical view (Requirement 7.2).
 * - A comparison result with zero Card Differences shows the no-differences
 *   indication (Requirement 7.6).
 * - A comparison result with differences does NOT show the no-differences
 *   indication (Requirement 7.6).
 *
 * Requirements: 7.2, 7.6
 */

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { CardEntry, ComparisonResult } from "@riftbound/shared";
import { ComparisonView } from "./ComparisonView.js";

afterEach(() => {
  cleanup();
});

const difference: CardEntry = {
  identity: "OGN-007",
  firstQuantity: 3,
  secondQuantity: 1,
};

const shared: CardEntry = {
  identity: "VEN-SP1",
  firstQuantity: 2,
  secondQuantity: 2,
};

describe("ComparisonView rendering indicators", () => {
  it("renders a Card Difference with an indicator distinct from a Shared Card (Req 7.2)", () => {
    const result: ComparisonResult = {
      differences: [difference],
      shared: [shared],
    };

    const { container } = render(
      <ComparisonView firstName="Deck A" secondName="Deck B" result={result} />,
    );
    const scope = within(container);

    // The difference row carries the difference classification.
    const diffRow = scope.getByTestId("difference-row");
    expect(diffRow.getAttribute("data-kind")).toBe("difference");
    expect(diffRow.className).toContain("card-row--difference");

    // The shared row carries the shared classification.
    const sharedRow = scope.getByTestId("shared-row");
    expect(sharedRow.getAttribute("data-kind")).toBe("shared");
    expect(sharedRow.className).toContain("card-row--shared");

    // The two rows are visually distinguished: their kind classification and
    // their marker indicators differ.
    expect(diffRow.getAttribute("data-kind")).not.toBe(
      sharedRow.getAttribute("data-kind"),
    );

    const diffMarker = within(diffRow).getByTestId("row-indicator");
    const sharedMarker = within(sharedRow).getByTestId("row-indicator");
    expect(diffMarker.textContent).toBe("≠");
    expect(sharedMarker.textContent).toBe("=");
    expect(diffMarker.textContent).not.toBe(sharedMarker.textContent);
  });

  it("shows the no-differences indication for a zero-difference result (Req 7.6)", () => {
    const result: ComparisonResult = {
      differences: [],
      shared: [shared],
    };

    const { container } = render(
      <ComparisonView firstName="Deck A" secondName="Deck B" result={result} />,
    );
    const scope = within(container);

    const indication = scope.getByTestId("no-differences");
    expect(indication).not.toBeNull();
    expect(indication.textContent).toBe(
      "The two decks have no card differences.",
    );
  });

  it("does NOT show the no-differences indication when differences exist (Req 7.6)", () => {
    const result: ComparisonResult = {
      differences: [difference],
      shared: [shared],
    };

    const { container } = render(
      <ComparisonView firstName="Deck A" secondName="Deck B" result={result} />,
    );
    const scope = within(container);

    expect(scope.queryByTestId("no-differences")).toBeNull();
  });
});
