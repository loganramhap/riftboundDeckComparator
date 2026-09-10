/**
 * Deck_Parser: parses and formats text deck lists.
 *
 * Pure, no I/O. See the design document (Components and Interfaces /
 * Deck_Parser) for the authoritative parsing rules.
 *
 * Accepted line forms (Req 2.2):
 *   - "<quantity> <CardCode>"   e.g. "3 OGN-007a"
 *   - "<quantity>x <CardName>"  e.g. "3x Some Card Name"
 *   - "<quantity> <CardName>"   e.g. "3 Traveling Merchant"
 * where quantity is an integer 1..99 and a card code matches the grammar
 *   cardCode := set "-" numberPrefix number variant?
 *   set          := [A-Z]{3}
 *   numberPrefix := "" | "R" | "SP"
 *   number       := [0-9]+
 *   variant      := [a-z*]
 *
 * Section headers commonly emitted by deckbuilders — a label ending in ":" with
 * no quantity, e.g. "Legend:", "Main Deck:", "Runes:", "Sideboard:" — set the
 * active section for the cards that follow. {@link parse} pools all cards into a
 * flat deck; {@link parseWithSections} additionally returns which section each
 * card was listed under.
 */

import {
  type Result,
  type StructuredDeck,
  type SectionMap,
  type Section,
  type DeckError,
  DEFAULT_SECTION,
  ok,
  err,
} from "./types.js";

/** Maximum quantity permitted per line and per card code total. */
const MAX_QUANTITY = 99;

/**
 * Recognized section-header labels mapped to canonical {@link Section}s. The
 * lookup key is the header text lowercased with all non-alphanumeric characters
 * removed, so variants like "Main Deck", "MainDeck", and "main_deck" all match.
 * Unrecognized headers leave subsequent cards in the current/default section.
 */
const SECTION_ALIASES: Record<string, Section> = {
  legend: "Legend",
  champion: "Chosen Champion",
  chosenchampion: "Chosen Champion",
  battlefield: "Battlefields",
  battlefields: "Battlefields",
  maindeck: "Main Deck",
  main: "Main Deck",
  deck: "Main Deck",
  rune: "Runes",
  runes: "Runes",
  runepool: "Runes",
  sideboard: "Sideboard",
};

/**
 * Normalize a header label to its canonical {@link Section}, or `null` if it is
 * not a recognized section name (in which case it is still consumed as a header
 * but does not change the active section).
 */
function sectionForHeader(label: string): Section | null {
  const key = label.replace(/:$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECTION_ALIASES[key] ?? null;
}

/**
 * Matches the "<quantity>x <CardName>" form. The quantity is captured, the
 * trailing token after the "x " is the card name (any non-empty run of
 * characters, trimmed).
 */
const NAME_LINE = /^(\d{1,2})x\s+(\S.*)$/;

/**
 * Matches a "<quantity> <rest>" line where <rest> is any non-empty run of
 * characters. The <rest> is then classified as either a card code (if it
 * matches the grammar) or a free-text card name.
 */
const QTY_LINE = /^(\d{1,2})\s+(\S.*)$/;

/**
 * A section header: a non-numeric label ending in ":" (optionally with trailing
 * text on the same line is NOT allowed — a header is just the label). Examples:
 * "Legend:", "Champion:", "MainDeck:", "Battlefields:", "Rune Pool:",
 * "Sideboard:". These are organizational and ignored during parsing.
 */
const SECTION_HEADER = /^[^\d].*:$/;

/**
 * Build a parse error for a malformed line (Req 2.5).
 */
function parseLineError(lineNumber: number, lineContent: string): DeckError {
  return {
    code: "PARSE_LINE",
    message: `Line ${lineNumber} could not be parsed: "${lineContent}"`,
    inputMethod: "text",
    lineNumber,
    lineContent,
  };
}

/**
 * The outcome of parsing a single line: a blank line to skip, a section header
 * (carrying its canonical section, or `null` when unrecognized), or a card
 * entry with its key and quantity.
 */
type LineOutcome =
  | { kind: "skip" }
  | { kind: "header"; section: Section | null }
  | { kind: "card"; key: string; quantity: number };

/**
 * Parse a single line into a {@link LineOutcome}, or an error describing the
 * failure. The card `key` is the card code for the code form, or the card name
 * for the name forms.
 */
function parseLine(line: string, lineNumber: number): Result<LineOutcome> {
  // Ignore blank and whitespace-only lines (Req 2.4).
  if (line.trim() === "") {
    return ok({ kind: "skip" });
  }

  const trimmed = line.trim();

  // Section headers like "Main Deck:" / "Rune Pool:". Checked before the
  // quantity forms so a header is never mistaken for a card. An unrecognized
  // header is still consumed (section stays as-is).
  if (SECTION_HEADER.test(trimmed)) {
    return ok({ kind: "header", section: sectionForHeader(trimmed) });
  }

  // "<quantity>x <CardName>" form. Checked first because "3x Foo" would
  // otherwise be read as quantity 3 with name "x Foo" by the general form.
  const nameMatch = NAME_LINE.exec(trimmed);
  if (nameMatch) {
    const quantity = Number(nameMatch[1]);
    const name = nameMatch[2].trim();
    if (quantity < 1 || quantity > MAX_QUANTITY) {
      return err(parseLineError(lineNumber, line));
    }
    return ok({ kind: "card", key: name, quantity });
  }

  // General "<quantity> <rest>" form. The <rest> is a card code when it matches
  // the grammar, otherwise it is treated verbatim as a card name (e.g.
  // "Traveling Merchant", "Kennen, Heart of the Tempest").
  const qtyMatch = QTY_LINE.exec(trimmed);
  if (qtyMatch) {
    const quantity = Number(qtyMatch[1]);
    const rest = qtyMatch[2].trim();
    if (quantity < 1 || quantity > MAX_QUANTITY) {
      return err(parseLineError(lineNumber, line));
    }
    // Keyed by the verbatim token/name. A valid card code (e.g. "OGN-007a")
    // keys by that code; a free-text name (e.g. "Traveling Merchant") keys by
    // the name. Comparison then matches identical strings.
    return ok({ kind: "card", key: rest, quantity });
  }

  return err(parseLineError(lineNumber, line));
}

/**
 * Parse a text deck list into a {@link StructuredDeck}. (Reqs 2.1–2.5)
 *
 * - Each non-blank line is parsed into a key and integer quantity 1..99.
 * - Duplicate keys have their quantities summed, capped at 99 (Req 2.3).
 * - Blank/whitespace-only lines are ignored; zero-quantity entries are
 *   excluded (Req 2.4). (Summed quantities are always >= 1, so no zero
 *   entries arise, but the invariant is enforced defensively.)
 * - Any malformed line rejects the whole submission with the failing line
 *   number and content, without producing a structured deck (Req 2.5).
 */
export function parse(text: string): Result<StructuredDeck> {
  const parsed = parseWithSections(text);
  return parsed.ok ? ok(parsed.value.deck) : parsed;
}

/**
 * A parsed text deck list together with the section each card was listed under.
 */
export interface ParsedDeck {
  /** The structured deck (card key -> total quantity). */
  deck: StructuredDeck;
  /** Card key -> the {@link Section} it was listed under. */
  sections: SectionMap;
}

/**
 * Parse a text deck list into a {@link StructuredDeck} plus a {@link SectionMap}
 * recording which section each card was listed under. (Reqs 2.1–2.5)
 *
 * Section headers (e.g. "Main Deck:", "Runes:") set the active section for the
 * cards that follow. Cards before any header, or under an unrecognized header,
 * fall to the default section ("Main Deck"). When the same card key appears in
 * more than one section, the first section seen wins.
 *
 * Parsing rules are otherwise identical to {@link parse}: quantities 1..99,
 * duplicates summed and capped at 99, blank lines ignored, and any malformed
 * line rejects the whole submission with the failing line number and content.
 */
export function parseWithSections(text: string): Result<ParsedDeck> {
  const deck: StructuredDeck = new Map();
  const sections: SectionMap = new Map();
  const lines = text.split(/\r\n|\r|\n/);

  let currentSection: Section = DEFAULT_SECTION;

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const result = parseLine(lines[i], lineNumber);
    if (!result.ok) {
      return result;
    }
    const outcome = result.value;

    if (outcome.kind === "skip") {
      continue;
    }
    if (outcome.kind === "header") {
      // A recognized header switches the active section; an unrecognized one
      // leaves it unchanged.
      if (outcome.section !== null) {
        currentSection = outcome.section;
      }
      continue;
    }

    const { key, quantity } = outcome;
    const current = deck.get(key) ?? 0;
    deck.set(key, Math.min(MAX_QUANTITY, current + quantity));
    // First section seen for a given card key wins.
    if (!sections.has(key)) {
      sections.set(key, currentSection);
    }
  }

  // Exclude any entry with quantity zero (Req 2.4). Defensive: summed positive
  // quantities never reach zero.
  for (const [key, quantity] of deck) {
    if (quantity <= 0) {
      deck.delete(key);
      sections.delete(key);
    }
  }

  return ok({ deck, sections });
}

/**
 * Format a {@link StructuredDeck} into canonical text: one
 * "<quantity> <CardCode>" line per card code. (Req 2.6)
 *
 * Lines are emitted in the deck's iteration order, joined by newlines.
 */
export function format(deck: StructuredDeck): string {
  const lines: string[] = [];
  for (const [code, quantity] of deck) {
    lines.push(`${quantity} ${code}`);
  }
  return lines.join("\n");
}
