/**
 * Comparison view renderer (task 12.2).
 *
 * Renders a comparison result graphically: every Card Difference with its
 * Normalized Card Identity and both per-deck quantities attributed to the
 * correct deck by name, a distinguishing indicator separating differences from
 * shared cards, both deck names, and a no-differences indication when the
 * comparison has zero differences.
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

/**
 * Props for {@link ComparisonView}. Either pass the flattened fields, or a
 * single `view` object of the shared `ComparisonView` shape.
 */
export interface ComparisonViewProps {
  /** The first deck's resolved display name. */
  firstName: string;
  /** The second deck's resolved display name. */
  secondName: string;
  /** The computed comparison result. */
  result: ComparisonResult;
}

/**
 * A single row for one card entry. `kind` drives the distinguishing indicator
 * that separates differences from shared cards (Requirement 7.2). Each quantity
 * cell is attributed to the deck it belongs to via its label and a
 * `data-deck` attribute (Requirements 7.4, 7.5).
 */
function CardRow({
  entry,
  kind,
  firstName,
  secondName,
}: {
  entry: CardEntry;
  kind: "difference" | "shared";
  firstName: string;
  secondName: string;
}) {
  const marker = kind === "difference" ? "≠" : "=";
  return (
    <tr
      className={`card-row card-row--${kind}`}
      data-kind={kind}
      data-testid={`${kind}-row`}
      data-identity={entry.identity}
    >
      <td className="card-row__marker" data-testid="row-indicator" aria-label={kind}>
        {marker}
      </td>
      <td className="card-row__identity" data-testid="row-identity">
        {entry.identity}
      </td>
      <td
        className="card-row__qty card-row__qty--first"
        data-deck="first"
        data-deck-name={firstName}
        data-testid="row-first-quantity"
      >
        {entry.firstQuantity}
      </td>
      <td
        className="card-row__qty card-row__qty--second"
        data-deck="second"
        data-deck-name={secondName}
        data-testid="row-second-quantity"
      >
        {entry.secondQuantity}
      </td>
    </tr>
  );
}

/**
 * The graphical comparison view.
 */
/** The section an entry belongs to, defaulting when unspecified. */
function sectionOf(entry: CardEntry): Section {
  return entry.section ?? DEFAULT_SECTION;
}

/**
 * Group the comparison entries by canonical section. Within each section,
 * differences are listed before shared cards. Only sections that contain at
 * least one entry are returned, in canonical display order.
 */
function groupBySection(
  result: ComparisonResult,
): Array<{ section: Section; differences: CardEntry[]; shared: CardEntry[] }> {
  return SECTION_ORDER.map((section) => ({
    section,
    differences: result.differences.filter((e) => sectionOf(e) === section),
    shared: result.shared.filter((e) => sectionOf(e) === section),
  })).filter((group) => group.differences.length + group.shared.length > 0);
}

export function ComparisonView({
  firstName,
  secondName,
  result,
}: ComparisonViewProps) {
  const hasDifferences = result.differences.length > 0;
  const groups = groupBySection(result);

  return (
    <section className="comparison-view" data-testid="comparison-view">
      <table className="comparison-table">
        <thead>
          <tr>
            <th scope="col" aria-label="indicator" />
            <th scope="col">Card</th>
            {/* Both deck names as column headers, associated with their
                per-deck quantity columns (Requirement 7.5). */}
            <th scope="col" data-deck="first" data-testid="first-deck-name">
              {firstName}
            </th>
            <th scope="col" data-deck="second" data-testid="second-deck-name">
              {secondName}
            </th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.section} data-testid="section-group" data-section={group.section}>
            {/* Section heading spanning the table (Legend, Chosen Champion,
                Battlefields, Main Deck, Runes, Sideboard). */}
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
            {/* Differences first (distinguishing indicator), then shared cards
                (Requirements 7.1–7.4, 7.2). */}
            {group.differences.map((entry) => (
              <CardRow
                key={`diff-${entry.identity}`}
                entry={entry}
                kind="difference"
                firstName={firstName}
                secondName={secondName}
              />
            ))}
            {group.shared.map((entry) => (
              <CardRow
                key={`shared-${entry.identity}`}
                entry={entry}
                kind="shared"
                firstName={firstName}
                secondName={secondName}
              />
            ))}
          </tbody>
        ))}
      </table>

      {/* No-differences indication when there are zero Card Differences
          (Requirement 7.6). */}
      {!hasDifferences && (
        <p className="comparison-view__no-differences" data-testid="no-differences">
          The two decks have no card differences.
        </p>
      )}
    </section>
  );
}
