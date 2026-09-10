/**
 * Deck_Parser: parses and formats text deck lists.
 *
 * Pure, no I/O. See the design document (Components and Interfaces /
 * Deck_Parser) for the authoritative parsing rules.
 *
 * Accepted line forms (Req 2.2):
 *   - "<quantity> <CardCode>"   e.g. "3 OGN-007a"
 *   - "<quantity>x <CardName>"  e.g. "3x Some Card Name"
 * where quantity is an integer 1..99 and a card code matches the grammar
 *   cardCode := set "-" numberPrefix number variant?
 *   set          := [A-Z]{3}
 *   numberPrefix := "" | "R" | "SP"
 *   number       := [0-9]+
 *   variant      := [a-z*]
 */

import { type Result, type StructuredDeck, type DeckError, ok, err } from "./types.js";

/** Maximum quantity permitted per line and per card code total. */
const MAX_QUANTITY = 99;

/**
 * Matches the "<quantity>x <CardName>" form. The quantity is captured, the
 * trailing token after the "x " is the card name (any non-empty run of
 * characters, trimmed).
 */
const NAME_LINE = /^(\d{1,2})x\s+(\S.*)$/;

/**
 * Matches the "<quantity> <CardCode>" form. The quantity and card code are
 * captured; the card code is validated separately against the grammar.
 */
const CODE_LINE = /^(\d{1,2})\s+(\S+)$/;

/**
 * The card code grammar: SET-[prefix]number[variant].
 */
const CARD_CODE = /^[A-Z]{3}-(?:R|SP)?[0-9]+[a-z*]?$/;

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
 * Parse a single line into a `[key, quantity]` pair, or `null` if the line is
 * blank/whitespace-only (to be ignored), or an error describing the failure.
 *
 * The `key` is the card code for the "<qty> <CardCode>" form, or the card name
 * for the "<qty>x <CardName>" form.
 */
function parseLine(
  line: string,
  lineNumber: number,
): Result<[string, number] | null> {
  // Ignore blank and whitespace-only lines (Req 2.4).
  if (line.trim() === "") {
    return ok(null);
  }

  const trimmed = line.trim();

  // "<quantity>x <CardName>" form. Checked first because "3x Foo" would
  // otherwise be partially matched by the code form.
  const nameMatch = NAME_LINE.exec(trimmed);
  if (nameMatch) {
    const quantity = Number(nameMatch[1]);
    const name = nameMatch[2].trim();
    if (quantity < 1 || quantity > MAX_QUANTITY) {
      return err(parseLineError(lineNumber, line));
    }
    return ok([name, quantity]);
  }

  // "<quantity> <CardCode>" form.
  const codeMatch = CODE_LINE.exec(trimmed);
  if (codeMatch) {
    const quantity = Number(codeMatch[1]);
    const code = codeMatch[2];
    if (quantity < 1 || quantity > MAX_QUANTITY) {
      return err(parseLineError(lineNumber, line));
    }
    if (!CARD_CODE.test(code)) {
      return err(parseLineError(lineNumber, line));
    }
    return ok([code, quantity]);
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
  const deck: StructuredDeck = new Map();
  const lines = text.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const result = parseLine(lines[i], lineNumber);
    if (!result.ok) {
      return result;
    }
    const entry = result.value;
    if (entry === null) {
      continue;
    }
    const [key, quantity] = entry;
    const current = deck.get(key) ?? 0;
    deck.set(key, Math.min(MAX_QUANTITY, current + quantity));
  }

  // Exclude any entry with quantity zero (Req 2.4). Defensive: summed
  // positive quantities never reach zero.
  for (const [key, quantity] of deck) {
    if (quantity <= 0) {
      deck.delete(key);
    }
  }

  return ok(deck);
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
