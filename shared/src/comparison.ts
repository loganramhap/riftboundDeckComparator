/**
 * Comparison_Engine: diffs two normalized decks into a {@link ComparisonResult}.
 *
 * See the design document (Components and Interfaces / Comparison_Engine) for
 * the authoritative behavior. This is a pure, deterministic transformation.
 */

import type { CardEntry, ComparisonResult, NormalizedDeck } from "./types.js";

/**
 * Compare two normalized decks.
 *
 * For every normalized card identity present in either deck, records the
 * quantity in each deck (0 where absent). An identity is classified as a
 * Shared Card when its per-deck quantities are equal, and as a Card Difference
 * when they differ (which includes any identity present in only one deck).
 *
 * The result is order-symmetric: comparing (first, second) and (second, first)
 * yields the same sets of identities, with each per-deck quantity attributed to
 * the deck it originated from. Empty decks are handled naturally — every
 * identity in the non-empty deck becomes a Card Difference with quantity 0 for
 * the empty deck.
 *
 * @param first The first normalized deck.
 * @param second The second normalized deck.
 * @returns The comparison result (Requirements 6.1, 6.2, 6.3, 6.4, 6.7).
 */
export function compare(
  first: NormalizedDeck,
  second: NormalizedDeck,
): ComparisonResult {
  const shared: CardEntry[] = [];
  const differences: CardEntry[] = [];

  // The union of identities present in either deck. Using a Set keeps each
  // identity exactly once regardless of which deck(s) it appears in.
  const identities = new Set<string>([...first.keys(), ...second.keys()]);

  for (const identity of identities) {
    const firstQuantity = first.get(identity) ?? 0;
    const secondQuantity = second.get(identity) ?? 0;

    const entry: CardEntry = { identity, firstQuantity, secondQuantity };

    if (firstQuantity === secondQuantity) {
      shared.push(entry);
    } else {
      differences.push(entry);
    }
  }

  return { shared, differences };
}
