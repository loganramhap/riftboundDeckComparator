/**
 * Presentational, controlled input for a single deck.
 *
 * Renders the three per-deck controls required by Requirement 1:
 * - an input-method selector (text / code / link) — Reqs 1.2, 1.3, 1.4
 * - a raw input field for the pasted text, deck code, or URL
 * - an optional name field (1–100 chars) — Req 8.1
 *
 * The component is fully controlled: it owns no state and reports every change
 * through {@link DeckInputProps.onChange} as a shared {@link DeckInputValue}
 * (the `DeckInput` type from `@riftbound/shared`). The two decks may each pick
 * their own method independently (Req 1.5); this component simply renders one
 * deck and leaves that coordination to the parent form.
 *
 * Naming/validation of the entered name (trimming, precedence, the 100-char
 * limit) is the Comparator's responsibility (Reqs 8.2–8.5) and is wired in
 * task 13.1; here the name is passed through verbatim as `userName`.
 */

import { useId } from "react";
import type { DeckInput as DeckInputValue, InputMethod } from "@riftbound/shared";

/** The maximum length the UI lets a user type for a deck name (Req 8.1, 8.5). */
export const MAX_DECK_NAME_LENGTH = 100;

/** The ordered set of input methods offered to the user (Reqs 1.2–1.4). */
const INPUT_METHODS: readonly { value: InputMethod; label: string }[] = [
  { value: "text", label: "Text list" },
  { value: "code", label: "Deck code" },
  { value: "link", label: "Link" },
];

/**
 * Per-method presentation: the label and placeholder for the raw input field,
 * and whether that field should render as a multi-line textarea. Text lists are
 * multi-line; a deck code or URL is a single line.
 */
const RAW_FIELD_PRESENTATION: Record<
  InputMethod,
  { label: string; placeholder: string; multiline: boolean }
> = {
  text: {
    label: "Deck list",
    placeholder: "e.g.\n3 OGN-001\n2 OGN-007a",
    multiline: true,
  },
  code: {
    label: "Deck code",
    placeholder: "Paste a Piltover Archive deck code",
    multiline: false,
  },
  link: {
    label: "Decklist URL",
    placeholder: "https://…",
    multiline: false,
  },
};

export interface DeckInputProps {
  /**
   * A human-facing label for this deck used to build accessible field labels,
   * e.g. "First deck" or "Second deck".
   */
  label: string;
  /** The current value of this deck's input (controlled). */
  value: DeckInputValue;
  /** Called with the next value whenever any control changes. */
  onChange: (next: DeckInputValue) => void;
}

/**
 * Controlled input for a single deck: method selector, raw input, and optional
 * name. Emits the whole {@link DeckInputValue} on every change.
 */
export function DeckInput({ label, value, onChange }: DeckInputProps) {
  // Unique id prefix so multiple instances (first/second deck) don't collide,
  // and so <label htmlFor> associations are correct for accessibility.
  const baseId = useId();
  const methodGroupId = `${baseId}-method`;
  const rawId = `${baseId}-raw`;
  const nameId = `${baseId}-name`;

  const presentation = RAW_FIELD_PRESENTATION[value.method];

  const handleMethodChange = (method: InputMethod) => {
    onChange({ ...value, method });
  };

  const handleRawChange = (raw: string) => {
    onChange({ ...value, raw });
  };

  const handleNameChange = (userName: string) => {
    // Preserve the entered text verbatim (including whitespace); the Comparator
    // applies trimming and precedence rules (Reqs 8.2–8.4). An empty string is
    // stored as `undefined` so "no name entered" is distinct from "" downstream.
    onChange({ ...value, userName: userName === "" ? undefined : userName });
  };

  return (
    <fieldset className="deck-input">
      <legend>{label}</legend>

      {/* Input-method selector (Reqs 1.2–1.4). A radiogroup keeps the choice
          keyboard-accessible and screen-reader friendly. */}
      <div role="radiogroup" aria-labelledby={`${methodGroupId}-legend`}>
        <span id={`${methodGroupId}-legend`} className="deck-input__group-label">
          Input method
        </span>
        {INPUT_METHODS.map((method) => {
          const inputId = `${methodGroupId}-${method.value}`;
          return (
            <label key={method.value} htmlFor={inputId} className="deck-input__method">
              <input
                id={inputId}
                type="radio"
                name={methodGroupId}
                value={method.value}
                checked={value.method === method.value}
                onChange={() => handleMethodChange(method.value)}
              />
              {method.label}
            </label>
          );
        })}
      </div>

      {/* Raw input: pasted text, deck code, or URL. Presentation adapts to the
          selected method. */}
      <div className="deck-input__raw">
        <label htmlFor={rawId}>{presentation.label}</label>
        {presentation.multiline ? (
          <textarea
            id={rawId}
            value={value.raw}
            placeholder={presentation.placeholder}
            rows={8}
            onChange={(e) => handleRawChange(e.target.value)}
          />
        ) : (
          <input
            id={rawId}
            type="text"
            value={value.raw}
            placeholder={presentation.placeholder}
            onChange={(e) => handleRawChange(e.target.value)}
          />
        )}
      </div>

      {/* Optional deck name (Req 8.1). Capped at 100 chars in the UI; the
          Comparator enforces the same bound and its error handling (Req 8.5). */}
      <div className="deck-input__name">
        <label htmlFor={nameId}>Deck name (optional)</label>
        <input
          id={nameId}
          type="text"
          value={value.userName ?? ""}
          maxLength={MAX_DECK_NAME_LENGTH}
          placeholder="Optional"
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </div>
    </fieldset>
  );
}
