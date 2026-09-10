/**
 * Comparison view renderer.
 *
 * Renders the comparison as a two-column diff: each card is shown once with its
 * quantity in the left (first) deck and the right (second) deck side by side,
 * grouped by deck section, with shared cards visually distinct from cards that
 * differ. Cards are labeled by their resolved name (falling back to the card
 * code when no name is known). Both deck names head their columns, and a
 * no-differences state is shown when the two decks match exactly.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
import {
  SECTION_ORDER,
  DEFAULT_SECTION,
  type CardEntry,
  type ComparisonResult,
  type Section,
} from "@riftbound/shared";
import { resolveCardName, hasCardName } from "../cardNames.js";

export interface ComparisonViewProps {
  /** The first (left) deck's resolved display name. */
  firstName: string;
  /** The second (right) deck's resolved display name. */
  secondName: string;
  /** The computed comparison result. */
  result: ComparisonResult;
}

/** Whether an entry's two quantities differ. */
function isDifference(entry: CardEntry): boolean {
  return entry.firstQuantity !== entry.secondQuantity;
}

/** The section an entry belongs to, defaulting when unspecified. */
function sectionOf(entry: CardEntry): Section {
  return entry.section ?? DEFAULT_SECTION;
}

/** Resolve the display label and optional secondary code for a card. */
function cardLabel(identity: string): { name: string; code?: string } {
  const name = resolveCardName(identity);
  // Show the raw code as a secondary label only when we actually resolved a
  // name (so a code that has no name doesn't show itself twice).
  return hasCardName(identity) ? { name, code: identity } : { name };
}

/**
 * A single card row: the card label plus its left/right quantities. The row is
 * marked shared vs. different, and each side is highlighted as higher/lower/
 * absent so the diff reads at a glance.
 */
function CardRow({ entry }: { entry: CardEntry }) {
  const diff = isDifference(entry);
  const kind = diff ? "difference" : "shared";
  const { name, code } = cardLabel(entry.identity);

  const sideClass = (mine: number, other: number): string => {
    if (mine === 0) return "qty qty--absent";
    if (diff && mine > other) return "qty qty--more";
    if (diff && mine < other) return "qty qty--less";
    return "qty";
  };

  return (
    <tr
      className={`card-row card-row--${kind}`}
      data-kind={kind}
      data-testid={`${kind}-row`}
      data-identity={entry.identity}
    >
      <td className="card-row__marker" data-testid="row-indicator" aria-label={kind}>
        {diff ? "≠" : "="}
      </td>
      <td className="card-row__card">
        <span className="card-row__name" data-testid="row-identity">
          {name}
        </span>
        {code && <span className="card-row__code">{code}</span>}
      </td>
      <td
        className={`card-row__qty card-row__qty--first ${sideClass(entry.firstQuantity, entry.secondQuantity)}`}
        data-deck="first"
        data-testid="row-first-quantity"
      >
        {entry.firstQuantity}
      </td>
      <td
        className={`card-row__qty card-row__qty--second ${sideClass(entry.secondQuantity, entry.firstQuantity)}`}
        data-deck="second"
        data-testid="row-second-quantity"
      >
        {entry.secondQuantity}
      </td>
    </tr>
  );
}

/**
 * Group entries by canonical section. Within each section, differing cards are
 * listed before shared cards, each sorted by display name. Only sections with
 * at least one entry are returned, in canonical display order.
 */
function groupBySection(
  result: ComparisonResult,
): Array<{ section: Section; rows: CardEntry[] }> {
  const all = [...result.differences, ...result.shared];
  const byName = (a: CardEntry, b: CardEntry) =>
    resolveCardName(a.identity).localeCompare(resolveCardName(b.identity));

  return SECTION_ORDER.map((section) => {
    const inSection = all.filter((e) => sectionOf(e) === section);
    const rows = [
      ...inSection.filter(isDifference).sort(byName),
      ...inSection.filter((e) => !isDifference(e)).sort(byName),
    ];
    return { section, rows };
  }).filter((group) => group.rows.length > 0);
}

/** Count how many cards differ, for the summary line. */
function summarize(result: ComparisonResult): {
  differing: number;
  shared: number;
} {
  return {
    differing: result.differences.length,
    shared: result.shared.length,
  };
}

export function ComparisonView({
  firstName,
  secondName,
  result,
}: ComparisonViewProps) {
  const hasDifferences = result.differences.length > 0;
  const groups = groupBySection(result);
  const { differing, shared } = summarize(result);

  return (
    <section className="comparison-view" data-testid="comparison-view">
      <div className="comparison-summary">
        <span className="comparison-summary__diff" data-testid="summary">
          {differing} card{differing === 1 ? "" : "s"} differ
        </span>
        <span className="comparison-summary__shared">{shared} shared</span>
      </div>

      <table className="comparison-table">
        <thead>
          <tr>
            <th scope="col" aria-label="indicator" />
            <th scope="col">Card</th>
            <th scope="col" data-deck="first" data-testid="first-deck-name">
              {firstName}
            </th>
            <th scope="col" data-deck="second" data-testid="second-deck-name">
              {secondName}
            </th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody
            key={group.section}
            data-testid="section-group"
            data-section={group.section}
          >
            <tr className="section-heading-row">
              <th
                scope="colgroup"
                colSpan={4}
                className="section-heading"
                data-testid="section-heading"
              >
                {group.section}
              </th>
            </tr>
            {group.rows.map((entry) => (
              <CardRow key={entry.identity} entry={entry} />
            ))}
          </tbody>
        ))}
      </table>

      {!hasDifferences && (
        <p className="comparison-view__no-differences" data-testid="no-differences">
          The two decks have no card differences.
        </p>
      )}
    </section>
  );
}
