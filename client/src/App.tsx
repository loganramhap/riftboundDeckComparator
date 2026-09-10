/**
 * Root application component — wires the whole client together (task 13.1).
 *
 * Responsibilities:
 * - Render the two-deck input UI ({@link DeckInputForm}) and, on submit, run the
 *   Comparator (with the client {@link linkImporter} injected) to produce a
 *   {@link ComparisonView}, which is rendered graphically (Reqs 1.x).
 * - Surface any blocking error (missing input, format mismatch, invalid link)
 *   attributed to the correct deck and input method (Reqs 1.6, 1.7, 9.4).
 * - Provide a Share button that encodes the current comparison state into a
 *   self-contained link via `createLink`, updates the URL fragment, and copies
 *   the full URL to the clipboard (Reqs 9.1, 9.2).
 * - On load, resolve an incoming share link (`resolveLink`) and reconstruct +
 *   re-run the comparison from the resolved decks and names (Reqs 9.2, 9.4).
 *
 * Design note — deriving the structured decks for sharing:
 * The Comparator consumes raw {@link CompareRequest} input and returns only the
 * normalized {@link ComparisonView}; it does not expose the intermediate
 * {@link StructuredDeck}s. A share link, however, stores the *structured* decks
 * (see {@link SharePayload}). Rather than refactor the shared Comparator to leak
 * its intermediates, this component re-derives the two structured decks from the
 * same raw inputs using the same producers the Comparator uses internally
 * (text → `parse`, code → `deckCode.decode`, link → `linkImporter.import`). This
 * keeps a single source of truth for how each input method maps to a structured
 * deck. Since a comparison only succeeds when both decks produced cleanly, this
 * re-derivation succeeds for exactly the states in which Share is offered.
 *
 * When a comparison is reconstructed from a resolved share link, we already hold
 * the structured decks (they are the payload), so we normalize + compare them
 * directly with the shared `normalize`/`compare` engine and reuse the payload's
 * names verbatim to build the {@link ComparisonView}.
 */

import { useEffect, useState } from "react";
import {
  compare as compareDecks,
  createComparator,
  createLink,
  deckCode,
  normalize,
  normalizedIdentityKey,
  parseCardCode,
  parseWithSections,
  resolveLink,
  withSections,
  type CompareRequest,
  type ComparisonView as ComparisonViewModel,
  type DeckError,
  type DeckInput,
  type Section,
  type SectionMap,
  type SharePayload,
  type StructuredDeck,
} from "@riftbound/shared";
import { linkImporter } from "./importer.js";
import { ComparisonView } from "./components/ComparisonView.js";
import { DeckInputForm, emptyCompareRequest } from "./components/DeckInputForm.js";

/**
 * A completed comparison together with the structured decks and names it was
 * built from, so a shareable link can be generated without re-running anything.
 */
interface ActiveComparison {
  view: ComparisonViewModel;
  first: StructuredDeck;
  second: StructuredDeck;
  firstName: string;
  secondName: string;
}

/** The current status of the share action, surfaced to the user. */
interface ShareState {
  /** The full shareable URL, once generated. */
  url: string;
  /** Whether the URL was successfully copied to the clipboard. */
  copied: boolean;
}

/**
 * Re-derive a single deck's {@link StructuredDeck} from its raw input using the
 * same producer the Comparator uses internally. Returns an attributed error on
 * failure (mirroring the Comparator's own attribution) so callers can surface a
 * precise message, though in practice this is only invoked for inputs that have
 * already compared successfully.
 */
async function deriveStructuredDeck(
  input: DeckInput,
): Promise<{ deck: StructuredDeck; sections: SectionMap } | null> {
  switch (input.method) {
    case "text": {
      // Text lists may carry section headers; capture them.
      const parsed = parseWithSections(input.raw);
      return parsed.ok ? parsed.value : null;
    }
    case "code": {
      const decoded = deckCode.decode(input.raw);
      return decoded.ok ? { deck: decoded.value, sections: new Map() } : null;
    }
    case "link": {
      const imported = await linkImporter.import(input.raw);
      return imported.ok
        ? { deck: imported.value.deck, sections: new Map() }
        : null;
    }
    default: {
      // Exhaustiveness guard.
      const _never: never = input.method;
      void _never;
      return null;
    }
  }
}

/**
 * Build a lookup from normalized card identity to {@link Section}, merged from
 * both decks' section maps. Each card key is normalized the same way the
 * comparison engine keys cards (card code -> printing-independent identity;
 * a free-text name -> itself). The first deck's section for an identity wins,
 * then the second deck's; identities with no section fall to the default.
 */
function buildSectionLookup(
  first: SectionMap,
  second: SectionMap,
): Map<string, Section> {
  const lookup = new Map<string, Section>();
  const add = (sections: SectionMap) => {
    for (const [key, section] of sections) {
      const parsed = parseCardCode(key);
      const identity = parsed.ok ? normalizedIdentityKey(parsed.value) : key;
      if (!lookup.has(identity)) {
        lookup.set(identity, section);
      }
    }
  };
  add(first);
  add(second);
  return lookup;
}

/**
 * Build a {@link ComparisonViewModel} from a resolved {@link SharePayload} by
 * normalizing both decks and running the comparison engine directly, reusing
 * the payload's names verbatim (Reqs 9.2, 9.3). Returns an invalid-link error
 * if either deck fails to normalize, so a corrupt payload never renders a
 * partial comparison (Req 9.4).
 */
function viewFromPayload(payload: SharePayload): {
  ok: true;
  active: ActiveComparison;
} | {
  ok: false;
  error: DeckError;
} {
  const firstNorm = normalize(payload.first);
  if (!firstNorm.ok) {
    return {
      ok: false,
      error: {
        code: "INVALID_LINK",
        message: "The shareable link contains a deck that could not be reconstructed.",
      },
    };
  }
  const secondNorm = normalize(payload.second);
  if (!secondNorm.ok) {
    return {
      ok: false,
      error: {
        code: "INVALID_LINK",
        message: "The shareable link contains a deck that could not be reconstructed.",
      },
    };
  }

  const result = compareDecks(firstNorm.value, secondNorm.value);
  return {
    ok: true,
    active: {
      view: {
        firstName: payload.firstName,
        secondName: payload.secondName,
        result,
      },
      first: payload.first,
      second: payload.second,
      firstName: payload.firstName,
      secondName: payload.secondName,
    },
  };
}

/**
 * Format a {@link DeckError} for display, including the deck and input method it
 * is attributed to when present (Reqs 1.6, 1.7).
 */
function ErrorBanner({ error }: { error: DeckError }) {
  const parts: string[] = [];
  if (error.deck) {
    parts.push(error.deck === "first" ? "First deck" : "Second deck");
  }
  if (error.inputMethod) {
    const methodLabel =
      error.inputMethod === "text"
        ? "text list"
        : error.inputMethod === "code"
          ? "deck code"
          : "link";
    parts.push(methodLabel);
  }
  const attribution = parts.length > 0 ? `${parts.join(" · ")}: ` : "";

  return (
    <div className="app__error" role="alert" data-testid="error-banner">
      <span className="app__error-message">
        {attribution}
        {error.message}
      </span>
      {typeof error.lineNumber === "number" && (
        <span className="app__error-line" data-testid="error-line">
          {" "}
          (line {error.lineNumber}
          {error.lineContent !== undefined ? `: "${error.lineContent}"` : ""})
        </span>
      )}
    </div>
  );
}

/**
 * The root application component.
 */
export function App() {
  const [request, setRequest] = useState<CompareRequest>(() => emptyCompareRequest());
  const [comparison, setComparison] = useState<ActiveComparison | null>(null);
  const [error, setError] = useState<DeckError | null>(null);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<ShareState | null>(null);

  // On mount, resolve any incoming share link and reconstruct the comparison.
  // A malformed or unreconstructable link shows an invalid-link error and does
  // NOT render a partial comparison (Reqs 9.2, 9.4).
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("c=")) {
      return;
    }
    const resolved = resolveLink(window.location.href);
    if (!resolved.ok) {
      setError(resolved.error);
      setComparison(null);
      return;
    }
    const built = viewFromPayload(resolved.value);
    if (!built.ok) {
      setError(built.error);
      setComparison(null);
      return;
    }
    setComparison(built.active);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run a comparison from the current raw request via the Comparator, with the
  // client Link_Importer injected. On success, also re-derive the structured
  // decks so a shareable link can be generated (see the design note above).
  const handleCompare = async (submitted: CompareRequest) => {
    setBusy(true);
    setError(null);
    setShare(null);

    const comparator = createComparator(linkImporter);
    const outcome = await comparator.compare(submitted);

    if (!outcome.ok) {
      // Surface the attributed error (Reqs 1.6, 1.7); clear any prior result so
      // a stale comparison is never shown alongside an error.
      setError(outcome.error);
      setComparison(null);
      setBusy(false);
      return;
    }

    // Re-derive the structured decks (and their sections) for sharing and for
    // grouping the view. This uses the same producers as the Comparator, so it
    // succeeds for the same inputs that just compared.
    const first = await deriveStructuredDeck(submitted.first);
    const second = await deriveStructuredDeck(submitted.second);

    // Annotate the comparison result with each card's section, grouped later by
    // the view. Sections come from the text lists; code/link decks contribute
    // none and fall to the default section.
    const sectionLookup = buildSectionLookup(
      first?.sections ?? new Map(),
      second?.sections ?? new Map(),
    );

    setComparison({
      view: {
        ...outcome.value,
        result: withSections(outcome.value.result, sectionLookup),
      },
      // Fall back to empty maps only if re-derivation somehow fails; Share is
      // gated on both being present, so an empty map simply disables sharing.
      first: first?.deck ?? new Map(),
      second: second?.deck ?? new Map(),
      firstName: outcome.value.firstName,
      secondName: outcome.value.secondName,
    });
    setBusy(false);
  };

  // Generate a shareable link for the current comparison, update the URL
  // fragment, and copy the full URL to the clipboard when available (Req 9.1).
  const handleShare = async () => {
    if (!comparison) {
      return;
    }
    const payload: SharePayload = {
      first: comparison.first,
      second: comparison.second,
      firstName: comparison.firstName,
      secondName: comparison.secondName,
    };
    const fragment = createLink(payload);

    // Reflect the shareable state in the address bar without reloading.
    window.location.hash = fragment.startsWith("#") ? fragment.slice(1) : fragment;

    const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const fullUrl = `${base}${fragment}`;

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
        copied = true;
      }
    } catch {
      copied = false;
    }
    setShare({ url: fullUrl, copied });
  };

  // Share is available only when a comparison is shown and both structured
  // decks are present to build the payload.
  const canShare =
    comparison !== null && comparison.first.size > 0 && comparison.second.size > 0;

  return (
    <main className="app">
      <h1 className="app__title">Riftbound Deck Comparator</h1>

      <DeckInputForm
        value={request}
        onChange={setRequest}
        onCompare={handleCompare}
        disabled={busy}
      />

      {error && <ErrorBanner error={error} />}

      {comparison && (
        <section className="app__result">
          <div className="app__result-actions">
            <button
              type="button"
              className="app__share"
              onClick={handleShare}
              disabled={!canShare}
              data-testid="share-button"
            >
              Share this comparison
            </button>
            {share && (
              <div className="app__share-result" data-testid="share-result">
                <label htmlFor="share-url">Shareable link</label>
                <input
                  id="share-url"
                  type="text"
                  readOnly
                  value={share.url}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <span className="app__share-status" role="status">
                  {share.copied ? "Copied to clipboard" : "Copy this link to share"}
                </span>
              </div>
            )}
          </div>

          <ComparisonView {...comparison.view} />
        </section>
      )}
    </main>
  );
}
