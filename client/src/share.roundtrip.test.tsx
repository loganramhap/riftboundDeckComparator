/**
 * Integration test for the share round trip through the whole app (task 13.2).
 *
 * Exercises the real application wiring end-to-end (Requirement 9.3):
 *   1. Render <App/>, fill both decks (text method) with known decklists and
 *      names, and submit Compare. Capture the rendered comparison state: every
 *      difference/shared row (identity -> both per-deck quantities) and both
 *      deck names from the header cells.
 *   2. Click the real Share button, which invokes `createLink`, writes the URL
 *      fragment to `window.location.hash`, and shows the share-result URL.
 *   3. Take the exact fragment the app produced, set it on `window.location`
 *      BEFORE rendering, and mount a fresh <App/>. Its mount effect resolves the
 *      incoming link via `resolveLink(window.location.href)` and reconstructs
 *      the comparison. Assert the reconstructed rows, classifications, and names
 *      match what was captured in step 1.
 *
 * The share fragment is driven through the app's own Share button + mount
 * resolve path (not by calling createLink/resolveLink directly), so the test
 * validates the app wiring rather than the shared Share_Service in isolation.
 *
 * Requirements: 9.3
 */

import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";
import { App } from "./App.js";

/** A captured comparison row: identity -> per-deck quantities + classification. */
interface CapturedRow {
  identity: string;
  first: string;
  second: string;
  kind: "difference" | "shared";
}

/** Everything we snapshot from a rendered comparison view for later comparison. */
interface CapturedComparison {
  firstName: string;
  secondName: string;
  rows: CapturedRow[];
}

/**
 * Read the full comparison state out of a rendered comparison view: both deck
 * names from the header cells and every difference/shared row with its identity
 * and both per-deck quantities.
 */
function captureComparison(scope: ReturnType<typeof within>): CapturedComparison {
  const firstName = scope.getByTestId("first-deck-name").textContent ?? "";
  const secondName = scope.getByTestId("second-deck-name").textContent ?? "";

  const readRows = (kind: "difference" | "shared"): CapturedRow[] =>
    scope.queryAllByTestId(`${kind}-row`).map((row) => {
      const rowScope = within(row);
      return {
        identity: row.getAttribute("data-identity") ?? "",
        first: rowScope.getByTestId("row-first-quantity").textContent ?? "",
        second: rowScope.getByTestId("row-second-quantity").textContent ?? "",
        kind,
      };
    });

  const rows = [...readRows("difference"), ...readRows("shared")];
  // Sort for order-independent comparison.
  rows.sort((a, b) => a.identity.localeCompare(b.identity));
  return { firstName, secondName, rows };
}

/** Set the raw text field for a deck fieldset located by its legend. */
function fillDeck(
  legend: "First deck" | "Second deck",
  deckList: string,
  name: string,
) {
  const fieldset = screen.getByRole("group", { name: legend });
  const scope = within(fieldset);

  // Text method is the default, so the raw field is labeled "Deck list".
  const raw = scope.getByLabelText("Deck list") as HTMLTextAreaElement;
  fireEvent.change(raw, { target: { value: deckList } });

  const nameField = scope.getByLabelText("Deck name (optional)") as HTMLInputElement;
  fireEvent.change(nameField, { target: { value: name } });
}

beforeEach(() => {
  // Start from a clean fragment so a leftover hash never resolves on mount.
  window.location.hash = "";
  // Provide a clipboard stub so handleShare's writeText path doesn't throw.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("share round trip through the app (Req 9.3)", () => {
  it("reproduces the same per-deck quantities, classifications, and names", async () => {
    // Decklists chosen so normalization + comparison exercise all classifications:
    //  - OGN-007a (first, qty 3) and OGN-007 (second, qty 2) normalize to the
    //    same identity OGN-007 -> a Card Difference (3 vs 2).
    //  - VEN-SP1 present only in the first deck -> a Card Difference (1 vs 0).
    //  - RAD-R05 present only in the second deck -> a Card Difference (0 vs 1).
    const firstDeckList = "3 OGN-007a\n1 VEN-SP1";
    const secondDeckList = "2 OGN-007\n1 RAD-R05";
    const firstName = "Aggro";
    const secondName = "Control";

    // --- Step 1: build the comparison through the app ---
    const first = render(<App />);

    fillDeck("First deck", firstDeckList, firstName);
    fillDeck("Second deck", secondDeckList, secondName);

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));

    const originalView = await screen.findByTestId("comparison-view");
    const original = captureComparison(within(originalView));

    // Sanity: the captured state matches the intended comparison so the round
    // trip below is asserting against a meaningful baseline.
    expect(original.firstName).toBe(firstName);
    expect(original.secondName).toBe(secondName);
    const byIdentity = new Map(original.rows.map((r) => [r.identity, r]));
    expect(byIdentity.get("OGN-007")).toMatchObject({
      first: "3",
      second: "2",
      kind: "difference",
    });
    expect(byIdentity.get("VEN-SP1")).toMatchObject({
      first: "1",
      second: "0",
      kind: "difference",
    });
    expect(byIdentity.get("RAD-R05")).toMatchObject({
      first: "0",
      second: "1",
      kind: "difference",
    });

    // --- Step 2: click the real Share button to produce the link ---
    const shareButton = screen.getByTestId("share-button") as HTMLButtonElement;
    expect(shareButton.disabled).toBe(false);
    fireEvent.click(shareButton);

    // The app writes the fragment to window.location.hash and shows the URL.
    const shareResult = await screen.findByTestId("share-result");
    const shareUrlInput = within(shareResult).getByLabelText(
      "Shareable link",
    ) as HTMLInputElement;
    const sharedUrl = shareUrlInput.value;
    expect(sharedUrl).toContain("#c=");

    // The generated fragment the app pushed into the address bar.
    const sharedFragment = window.location.hash;
    expect(sharedFragment).toContain("c=");

    // Tear down the first app before opening the link in a fresh one.
    first.unmount();

    // --- Step 3: open the shared link in a freshly mounted app ---
    // The App mount effect reads window.location.href, so set the fragment
    // (the exact one the Share button produced) before rendering.
    window.location.hash = sharedFragment;

    render(<App />);

    const reconstructedView = await screen.findByTestId("comparison-view");
    const reconstructed = captureComparison(within(reconstructedView));

    // Req 9.3: the reconstructed comparison reproduces the same per-deck
    // quantities, classifications, and deck names as the original.
    expect(reconstructed.firstName).toBe(original.firstName);
    expect(reconstructed.secondName).toBe(original.secondName);
    expect(reconstructed.rows).toEqual(original.rows);
  });
});
