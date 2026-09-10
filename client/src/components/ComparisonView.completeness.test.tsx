/**
 * Feature: riftbound-deck-comparator, Property 11: Graphical view includes all
 * differences with full detail
 *
 * For any comparison result, the rendered graphical view contains, for every
 * Card Difference, its Normalized Card Identity and both its first-deck and
 * second-deck quantities each attributed to the correct deck, and also displays
 * both deck names.
 *
 * Validates: Requirements 7.1, 7.3, 7.4, 7.5
 */

import { describe, expect, it, afterEach } from "vitest";
import * as fc from "fast-check";
import { cleanup, render, within } from "@testing-library/react";
import type { CardEntry, ComparisonResult } from "@riftbound/shared";
import { ComparisonView } from "./ComparisonView.js";

afterEach(() => {
  cleanup();
});

/** Recognized set identifiers from the deck-code specification. */
const SETS = ["OGN", "OGS", "ARC", "SFD", "UNL", "VEN", "RAD"] as const;

/**
 * Generator for a normalized card identity key `SET-[prefix]number`. A small
 * number pool keeps identities colliding so the two decks share cards, but the
 * dedup step below guarantees each identity appears at most once overall.
 */
const identityArb: fc.Arbitrary<string> = fc
  .record({
    set: fc.constantFrom(...SETS),
    prefix: fc.constantFrom("", "R", "SP"),
    number: fc.integer({ min: 1, max: 40 }).map((n) => String(n)),
  })
  .map(({ set, prefix, number }) => `${set}-${prefix}${number}`);

/**
 * Generator for a CardEntry with distinct, positive per-deck quantities so the
 * entry is unambiguously a Card Difference (firstQuantity !== secondQuantity),
 * including the absent-from-one-deck case (a zero quantity).
 */
const cardEntryArb: fc.Arbitrary<CardEntry> = fc
  .record({
    identity: identityArb,
    firstQuantity: fc.integer({ min: 0, max: 99 }),
    secondQuantity: fc.integer({ min: 0, max: 99 }),
  })
  .filter((e) => e.firstQuantity !== e.secondQuantity);

/** An entry whose quantities are equal (a Shared Card). */
const sharedEntryArb: fc.Arbitrary<CardEntry> = fc
  .record({
    identity: identityArb,
    quantity: fc.integer({ min: 1, max: 99 }),
  })
  .map(({ identity, quantity }) => ({
    identity,
    firstQuantity: quantity,
    secondQuantity: quantity,
  }));

/**
 * Generator for a full ComparisonResult. Differences and shared entries are
 * generated independently, then identities are de-duplicated across the whole
 * result (a given identity classifies as exactly one of shared/difference).
 */
const comparisonResultArb: fc.Arbitrary<ComparisonResult> = fc
  .record({
    differences: fc.array(cardEntryArb, { minLength: 0, maxLength: 25 }),
    shared: fc.array(sharedEntryArb, { minLength: 0, maxLength: 15 }),
  })
  .map(({ differences, shared }) => {
    const seen = new Set<string>();
    const dedupedDiffs: CardEntry[] = [];
    for (const entry of differences) {
      if (!seen.has(entry.identity)) {
        seen.add(entry.identity);
        dedupedDiffs.push(entry);
      }
    }
    const dedupedShared: CardEntry[] = [];
    for (const entry of shared) {
      if (!seen.has(entry.identity)) {
        seen.add(entry.identity);
        dedupedShared.push(entry);
      }
    }
    return { differences: dedupedDiffs, shared: dedupedShared };
  });

/** A non-empty deck name generator (1-100 chars). */
const deckNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

describe("Property 11: Graphical view includes all differences with full detail", () => {
  it("renders every difference's identity, both attributed quantities, and both deck names", () => {
    fc.assert(
      fc.property(
        comparisonResultArb,
        deckNameArb,
        deckNameArb,
        (result, firstName, secondName) => {
          const { container } = render(
            <ComparisonView
              firstName={firstName}
              secondName={secondName}
              result={result}
            />,
          );
          const scope = within(container);

          // 7.5: both deck names are displayed, each associated with its deck.
          const firstHeader = scope.getByTestId("first-deck-name");
          const secondHeader = scope.getByTestId("second-deck-name");
          expect(firstHeader.textContent).toBe(firstName);
          expect(secondHeader.textContent).toBe(secondName);

          // 7.1: every Card Difference is present in the view. There is exactly
          // one difference row per difference identity.
          const diffRows = container.querySelectorAll(
            '[data-testid="difference-row"]',
          );
          expect(diffRows.length).toBe(result.differences.length);

          for (const entry of result.differences) {
            // 7.3: the card is identified by its Normalized Card Identity.
            const row = container.querySelector(
              `[data-testid="difference-row"][data-identity="${entry.identity}"]`,
            );
            expect(row).not.toBeNull();

            const rowScope = within(row as HTMLElement);

            // 7.4: first-deck quantity, attributed to the first deck.
            const firstCell = rowScope.getByTestId("row-first-quantity");
            expect(firstCell.getAttribute("data-deck")).toBe("first");
            expect(firstCell.textContent).toBe(String(entry.firstQuantity));

            // 7.4: second-deck quantity, attributed to the second deck.
            const secondCell = rowScope.getByTestId("row-second-quantity");
            expect(secondCell.getAttribute("data-deck")).toBe("second");
            expect(secondCell.textContent).toBe(String(entry.secondQuantity));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
