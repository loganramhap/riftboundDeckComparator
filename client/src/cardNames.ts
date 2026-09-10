/**
 * Card-name resolution (client-side).
 *
 * Turns a normalized card identity (e.g. "SFD-145") into a human-readable name
 * (e.g. "Switcheroo") using the bundled `card-names.json` map, which is keyed by
 * normalized identity (`SET-[prefix]number`, variant removed) — the same key the
 * comparison engine uses.
 *
 * Regenerate the data with `node client/scripts/build-card-names.mjs` from the
 * source CSV. Vite bundles the JSON into the client build, so this needs no
 * runtime file access.
 *
 * Resolution never fails: an unknown identity resolves to itself, so the UI can
 * always show something (falling back to the code). Name-based text lists carry
 * readable names as their identity already and pass through unchanged.
 */

import {
  normalizedIdentityKey,
  parseCardCode,
  type Section,
} from "@riftbound/shared";
import cardNames from "./card-names.json";
import canonicalIdentity from "./canonical-identity.json";
import cardSections from "./card-sections.json";

const NAME_BY_IDENTITY: Record<string, string> = cardNames;

/**
 * Alias map collapsing every printing that shares a card name (alternate arts,
 * "overnumbered" reprints, cross-set reprints) to a single canonical identity,
 * so mechanically-identical cards compare as one.
 */
const CANONICAL_BY_IDENTITY: Record<string, string> = canonicalIdentity;

/**
 * A fixed {@link Section} implied by a card's type (Legend, Battlefield, Rune),
 * keyed by identity (and canonical identity). Cards whose type dictates a
 * section belong there regardless of which deck-code zone or list header they
 * appeared under; other cards (units, spells, gear) are not listed here.
 */
const SECTION_BY_IDENTITY: Record<string, Section> = cardSections as Record<
  string,
  Section
>;

/**
 * The section a card's type forces it into (Legend / Battlefields / Runes), or
 * `undefined` when the card's type implies no fixed section. Card codes are
 * normalized and canonicalized before lookup.
 */
export function sectionForCard(identityOrKey: string): Section | undefined {
  const identity = toIdentity(identityOrKey);
  const canonical = CANONICAL_BY_IDENTITY[identity] ?? identity;
  return SECTION_BY_IDENTITY[canonical] ?? SECTION_BY_IDENTITY[identity];
}

/** Normalize a card code to its identity; non-codes (names) pass through. */
function toIdentity(identityOrKey: string): string {
  const parsed = parseCardCode(identityOrKey);
  return parsed.ok ? normalizedIdentityKey(parsed.value) : identityOrKey;
}

/**
 * Collapse a card key to its canonical identity: the card code is normalized to
 * its printing-independent identity, then mapped through the same-name alias
 * table. Cards that share a name (regardless of collector number or art)
 * resolve to one identity. Unknown identities and free-text names pass through
 * unchanged.
 */
export function canonicalizeIdentity(identityOrKey: string): string {
  const identity = toIdentity(identityOrKey);
  return CANONICAL_BY_IDENTITY[identity] ?? identity;
}

/**
 * Resolve a card identity or raw key to a display name. Card codes are
 * normalized before lookup; anything not found resolves to itself.
 */
export function resolveCardName(identityOrKey: string): string {
  const identity = toIdentity(identityOrKey);
  const canonical = CANONICAL_BY_IDENTITY[identity] ?? identity;
  return NAME_BY_IDENTITY[canonical] ?? NAME_BY_IDENTITY[identity] ?? identityOrKey;
}

/**
 * Whether a bundled card name exists for the given identity/key (as opposed to
 * falling back to the identity itself). Lets the UI show the raw code as a
 * secondary label only when a name was actually found.
 */
export function hasCardName(identityOrKey: string): boolean {
  const identity = toIdentity(identityOrKey);
  return Object.prototype.hasOwnProperty.call(NAME_BY_IDENTITY, identity);
}
