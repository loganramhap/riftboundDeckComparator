/**
 * Container that manages the two-deck input state and assembles a
 * {@link CompareRequest}.
 *
 * This renders two {@link DeckInput} controls — one per deck — and holds their
 * combined state (Req 1.1: exactly two decks, first and second). Each deck may
 * independently choose its input method (Req 1.5). The assembled request is
 * surfaced to the parent two ways:
 *
 * - `onChange(request)` fires on every edit, for callers that want to observe
 *   the live request (e.g. to enable/disable a Compare button).
 * - `onCompare(request)` fires when the user submits the form, for callers that
 *   want to run the comparison.
 *
 * This component intentionally does NOT know about the Comparator, the
 * Link_Importer, or the Share_Service — task 13.1 wires those in. It is a
 * controlled/uncontrolled hybrid: it can run fully uncontrolled from an initial
 * value, or be driven by a parent that passes `value` + `onChange`.
 */

import { useState } from "react";
import type { CompareRequest, DeckInput as DeckInputValue } from "@riftbound/shared";
import { DeckInput } from "./DeckInput.js";

/** A blank deck input: text method, empty raw, no name. */
function emptyDeckInput(): DeckInputValue {
  return { method: "text", raw: "" };
}

/** A blank compare request with two empty decks. */
export function emptyCompareRequest(): CompareRequest {
  return { first: emptyDeckInput(), second: emptyDeckInput() };
}

export interface DeckInputFormProps {
  /**
   * The current request (controlled mode). When provided, the component renders
   * this value and reports edits via {@link DeckInputFormProps.onChange};
   * it holds no internal state.
   */
  value?: CompareRequest;
  /**
   * The initial request when running uncontrolled. Ignored when `value` is
   * provided. Defaults to two empty text-input decks.
   */
  initialValue?: CompareRequest;
  /** Called with the full request on every edit. */
  onChange?: (request: CompareRequest) => void;
  /** Called with the full request when the user submits the form. */
  onCompare?: (request: CompareRequest) => void;
  /**
   * Whether the Compare control is disabled (e.g. while a comparison is in
   * flight). Presentation only; the parent owns the meaning.
   */
  disabled?: boolean;
}

/**
 * The two-deck input form. Renders a {@link DeckInput} for the first and second
 * decks and assembles their combined {@link CompareRequest}.
 */
export function DeckInputForm({
  value,
  initialValue,
  onChange,
  onCompare,
  disabled = false,
}: DeckInputFormProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<CompareRequest>(
    () => initialValue ?? emptyCompareRequest(),
  );

  const request = isControlled ? value : internal;

  const update = (next: CompareRequest) => {
    if (!isControlled) {
      setInternal(next);
    }
    onChange?.(next);
  };

  const handleFirstChange = (first: DeckInputValue) => {
    update({ ...request, first });
  };

  const handleSecondChange = (second: DeckInputValue) => {
    update({ ...request, second });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onCompare?.(request);
  };

  return (
    <form className="deck-input-form" onSubmit={handleSubmit}>
      <div className="deck-input-form__decks">
        <DeckInput
          label="First deck"
          value={request.first}
          onChange={handleFirstChange}
        />
        <DeckInput
          label="Second deck"
          value={request.second}
          onChange={handleSecondChange}
        />
      </div>
      <button type="submit" className="deck-input-form__compare" disabled={disabled}>
        Compare
      </button>
    </form>
  );
}
