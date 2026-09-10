/**
 * Deck name resolution for the Riftbound Deck Comparator.
 *
 * The Comparator applies name resolution when constructing each deck's display
 * name. Two concerns live here:
 *
 * - {@link validateName} enforces the 1-100 character bound on a user-submitted
 *   name, rejecting names longer than 100 characters so the caller can retain
 *   the deck's prior name (Req 8.5).
 * - {@link resolveName} applies the resolution precedence between a user-entered
 *   name, a source name, and a position default (Reqs 8.1-8.4).
 *
 * See the design document sections "Deck Name Resolution" and "Deck Name".
 */

import { err, ok, type DeckError, type Result } from "./types.js";

/** The maximum allowed length, in characters, of a resolved deck name. */
export const MAX_NAME_LENGTH = 100;

/**
 * The position of a deck within a comparison, used to select the default name.
 */
export type DeckPosition = "first" | "second";

/**
 * The default name assigned to a deck at the given position when no
 * user-entered or source name is available.
 *
 * Requirements: 8.4
 */
export function defaultName(position: DeckPosition): string {
  return position === "first" ? "Deck 1" : "Deck 2";
}

/**
 * Validate a user-submitted deck name against the maximum-length bound.
 *
 * Returns `ok` with the name unchanged when it does not exceed
 * {@link MAX_NAME_LENGTH} characters. Returns `err` with a `NAME_TOO_LONG`
 * error otherwise, signalling that the caller should retain the deck's prior
 * name rather than applying the rejected value.
 *
 * Length is measured after no transformation (the raw submitted value), so a
 * name is rejected purely for exceeding the character limit; trimming for
 * resolution happens separately in {@link resolveName}.
 *
 * Requirements: 8.1, 8.5
 */
export function validateName(name: string): Result<string> {
  if (name.length > MAX_NAME_LENGTH) {
    const error: DeckError = {
      code: "NAME_TOO_LONG",
      message: `Deck name exceeds the maximum length of ${MAX_NAME_LENGTH} characters; the previous name is retained.`,
    };
    return err(error);
  }
  return ok(name);
}

/**
 * Resolve a deck's display name from an optional user-entered name, an optional
 * source name, and the deck position.
 *
 * Precedence (design "Deck Name Resolution"):
 * 1. A user-entered name with at least one non-whitespace character wins,
 *    trimmed of leading and trailing whitespace (Req 8.3).
 * 2. Otherwise, a source name from a link, truncated to
 *    {@link MAX_NAME_LENGTH} characters (Req 8.2).
 * 3. Otherwise, the position default `Deck 1` / `Deck 2` (Req 8.4).
 *
 * This function assumes any user-entered name has already passed
 * {@link validateName}; it does not itself reject over-length input.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */
export function resolveName(
  userName: string | undefined,
  sourceName: string | undefined,
  position: DeckPosition,
): string {
  if (userName !== undefined && userName.trim().length > 0) {
    return userName.trim();
  }

  if (sourceName !== undefined) {
    return sourceName.slice(0, MAX_NAME_LENGTH);
  }

  return defaultName(position);
}
