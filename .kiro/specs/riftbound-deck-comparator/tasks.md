# Implementation Plan: Riftbound Deck Comparator

## Overview

This plan builds the Riftbound Deck Comparator as a TypeScript monorepo: a shared pure-logic domain library, a React + Vite client, and a thin Node/Fastify server (static assets + link-import proxy). Work proceeds bottom-up: project scaffolding and shared types first, then each pure domain component (parser, decoder, normalizer, comparison engine, share service) with its property-based tests, then the Comparator orchestration and name resolution, then the client UI and rendering, and finally the server proxy and Link_Importer integration. Each step builds on prior steps and ends by wiring the piece into the running application.

Property-based tests use fast-check under Vitest, minimum 100 iterations, one test per design property, each tagged `Feature: riftbound-deck-comparator, Property {n}: ...`.

## Tasks

- [x] 1. Set up project structure, tooling, and shared types
  - [x] 1.1 Scaffold workspace, tooling, and core shared types
    - Initialize a TypeScript workspace with three packages: `shared` (domain logic), `client` (React + Vite), `server` (Node/Fastify)
    - Configure Vitest and fast-check as dev dependencies at the workspace root
    - Add `@piltoverarchive/riftbound-deck-codes` as a dependency of the `shared` package
    - Define core shared types in `shared/src/types.ts`: `Result<T, E>`, `DeckError`, `InputMethod`, `StructuredDeck`, `NormalizedDeck`, `CardEntry`, `ComparisonResult`, `CardCodeParts`
    - Add `ok`/`err` helper constructors for `Result`
    - _Requirements: 1.1_

- [x] 2. Implement card code grammar and Deck_Normalizer
  - [x] 2.1 Implement card code parsing helpers
    - In `shared/src/cardCode.ts`, implement a parser/matcher for the grammar `SET-[prefix]number[variant]` (set `[A-Z]{3}`, prefix `"" | R | SP`, number `[0-9]+`, variant `[a-z*]`)
    - Implement `parseCardCode(code): Result<CardCodeParts>` and `normalizedIdentityKey(parts): string` producing `SET-[prefix]number`
    - _Requirements: 5.1, 5.2_

  - [x] 2.2 Implement Deck_Normalizer
    - In `shared/src/normalizer.ts`, implement `normalize(deck: StructuredDeck): Result<NormalizedDeck>` that strips variants, retains set + full number (incl. R/SP prefix), and sums quantities across printings of the same identity
    - Reject the deck with a malformed-code error naming the offending card code when a code does not match the grammar
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.3 Write property test for variant-independent normalized identity
    - **Property 5: Normalized identity is variant-independent**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 2.4 Write property test for summing across printings
    - **Property 6: Normalization sums quantities across printings**
    - **Validates: Requirements 5.4**

  - [x] 2.5 Write unit test for malformed card code rejection
    - A deck containing one code not matching the grammar is rejected, naming the code
    - _Requirements: 5.5_

- [x] 3. Implement Deck_Parser
  - [x] 3.1 Implement text deck list parse and format
    - In `shared/src/parser.ts`, implement `parse(text): Result<StructuredDeck>` accepting lines `"<qty> <CardCode>"` and `"<qty>x <CardName>"`, quantity 1–99, summing duplicates capped at 99, ignoring blank/whitespace lines, excluding zero-quantity entries
    - On a malformed line, reject the whole submission with the failing line number and content
    - Implement `format(deck): string` emitting one canonical `"<qty> <CardCode>"` line per card code
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Write property test for parse/format round trip
    - **Property 1: Text parse/format round trip**
    - **Validates: Requirements 2.1, 2.2, 2.6, 2.7**

  - [x] 3.3 Write property test for duplicate summing and cap at 99
    - **Property 2: Duplicate quantities sum and cap at 99**
    - **Validates: Requirements 2.3**

  - [x] 3.4 Write property test for whitespace invariance and no zero entries
    - **Property 3: Blank and whitespace lines are ignored and no zero entries**
    - **Validates: Requirements 2.4**

  - [x] 3.5 Write unit test for parse rejection reporting
    - A single malformed line at a known position reports its line number and content
    - _Requirements: 2.5_

- [x] 4. Implement Deck_Code_Decoder
  - [x] 4.1 Implement deck code decode/encode wrapper
    - In `shared/src/deckCode.ts`, implement `decode(code): Result<StructuredDeck>` wrapping `getDeckFromCode`, mapping `mainDeck` entries to a `StructuredDeck`; catch library errors and return an invalid-code error without throwing
    - Implement `encode(deck): Result<string>` wrapping `getCodeFromDeck`; catch throws on non-positive/non-integer counts and return an error
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 4.2 Write property test for deck code canonical round trip
    - **Property 4: Deck code canonical round trip**
    - **Validates: Requirements 3.1, 3.3, 3.4**

  - [x] 4.3 Write unit test for invalid deck code handling
    - Empty and garbage codes return invalid-code errors without throwing
    - _Requirements: 3.2_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Comparison_Engine
  - [x] 6.1 Implement deck comparison
    - In `shared/src/comparison.ts`, implement `compare(first, second): ComparisonResult` recording per-identity quantities from both decks (0 where absent), classifying Shared when equal and Card Difference when different, handling empty decks
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7_

  - [x] 6.2 Write property test for comparison correctness
    - **Property 7: Comparison correctness**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.7**

  - [x] 6.3 Write property test for order symmetry
    - **Property 8: Comparison is order-symmetric**
    - **Validates: Requirements 6.5**

  - [x] 6.4 Write property test for self-comparison zero differences
    - **Property 9: Comparing a deck with itself yields zero differences**
    - **Validates: Requirements 6.4**

- [x] 7. Implement Share_Service
  - [x] 7.1 Implement share link create/resolve
    - In `shared/src/share.ts`, implement `createLink(payload): string` serializing `SharePayload` (both decks, both names) to JSON, compressing, and base64url-encoding into a URL fragment `#c=...`
    - Implement `resolveLink(url): Result<SharePayload>` reversing the process, preserving each name verbatim; return an invalid-link error for malformed or unreconstructable links with no partial payload
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 7.2 Write property test for share link round trip
    - **Property 12: Share link round trip**
    - **Validates: Requirements 9.1, 9.2, 9.3**

  - [x] 7.3 Write unit test for invalid share link handling
    - Corrupted link strings return an invalid-link error with no partial comparison
    - _Requirements: 9.4_

- [x] 8. Implement name resolution and Comparator orchestration
  - [x] 8.1 Implement deck name resolution
    - In `shared/src/nameResolver.ts`, implement resolution precedence: trimmed user-entered name with a non-whitespace character wins; else source name truncated to 100 chars; else position default (`Deck 1`/`Deck 2`)
    - Reject a user name over 100 characters with a max-length error and signal retention of the prior name
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.2 Write property test for name resolution precedence
    - **Property 10: Name resolution precedence**
    - **Validates: Requirements 8.2, 8.3, 8.4**

  - [x] 8.3 Write unit test for name length boundaries
    - Names of length 1 and 100 accepted; length 101 rejected and prior name retained
    - _Requirements: 8.1, 8.5_

  - [x] 8.4 Implement Comparator orchestration
    - In `shared/src/comparator.ts`, implement `compare(request): Promise<Result<ComparisonView>>` that validates presence (missing-input error naming the deck), routes each deck to its producer by `InputMethod`, attributes format errors to the deck/method, normalizes both decks, runs the comparison, and resolves both names
    - Return a missing-deck error when a deck is unavailable or cannot be normalized; allow mixed input methods
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 6.6_

  - [x] 8.5 Write unit tests for Comparator input routing and errors
    - Mixed-method comparison succeeds; missing input names the deck; format mismatch identifies method; unavailable normalized deck returns missing-deck error
    - _Requirements: 1.5, 1.6, 1.7, 6.6_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement server layer (static serving + link-import proxy)
  - [x] 10.1 Implement Fastify server with static serving and proxy endpoint
    - In `server/src/index.ts`, set up Fastify to serve the built client bundle
    - Implement a `/api/import` proxy endpoint that performs an outbound HTTP GET with a 30-second abortable timeout and returns retrieved content or a failure status
    - _Requirements: 4.1, 4.3, 4.4_

  - [x] 10.2 Implement source adapter registry and parsers
    - In `server/src/sources/`, implement a registry of source adapters, each with a URL matcher and a parser from raw content to `{ deck, sourceName? }`, reusing shared parsing where applicable
    - Treat content yielding no card with quantity ≥ 1 as a retrieval failure
    - _Requirements: 4.1, 4.5, 4.6, 4.7_

  - [x] 10.3 Write integration tests for the import proxy with mocked adapters
    - Successful import; source name present/absent; 30s timeout abort; retrieval failure; unparseable content; unsupported/malformed source
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 11. Implement Link_Importer client half
  - [x] 11.1 Implement client-side Link_Importer
    - In `client/src/importer.ts`, implement `import(url): Promise<Result<ImportedDeck>>` that validates URL well-formedness and supported source (unsupported-source error otherwise), calls the `/api/import` proxy, and maps failures to retrieval-failure errors
    - Attach `sourceName` when present; omit when absent
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.7_

  - [x] 11.2 Write integration tests for the client importer with mocked proxy
    - Unsupported/malformed URL, retrieval failure, and successful import with/without source name
    - _Requirements: 4.1, 4.2, 4.4, 4.6, 4.7_

- [x] 12. Implement React client UI and comparison rendering
  - [x] 12.1 Implement deck input and naming UI
    - In `client/src/components/`, build the two-deck input UI: input-method selector (text/code/link), raw input field, and optional name field per deck, wired to a `CompareRequest`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1_

  - [x] 12.2 Implement comparison view renderer
    - Build the graphical comparison view rendering every Card Difference with its Normalized Card Identity and both per-deck quantities attributed to the correct deck, a distinguishing indicator for differences vs. shared cards, both deck names, and a no-differences indication when there are zero differences
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 12.3 Write property test for graphical view completeness
    - **Property 11: Graphical view includes all differences with full detail**
    - **Validates: Requirements 7.1, 7.3, 7.4, 7.5**

  - [x] 12.4 Write unit tests for rendering indicators
    - Differences render with a distinguishing indicator vs. shared cards; a zero-difference result shows the no-differences indication
    - _Requirements: 7.2, 7.6_

- [x] 13. Wire the application together
  - [x] 13.1 Wire Comparator, importer, and Share_Service into the app
    - In `client/src/App.tsx`, connect the input UI to the Comparator (injecting the client Link_Importer), render the resulting `ComparisonView`, add a Share button invoking `createLink`, and resolve an incoming share link on load via `resolveLink` to reconstruct and re-run the comparison
    - Surface errors (missing input, format, invalid link) in the UI attributed to the correct deck/method
    - _Requirements: 1.6, 1.7, 9.1, 9.2, 9.4_

  - [x] 13.2 Write integration test for share round trip through the app
    - Building a comparison, creating a link, and resolving it reproduces the same per-deck quantities, classifications, and names
    - _Requirements: 9.3_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements (or a design property) for traceability.
- Property tests use fast-check under Vitest at a minimum of 100 iterations, one test per design property (Properties 1–12), each tagged `Feature: riftbound-deck-comparator, Property {n}: ...`.
- Link_Importer is covered by integration tests with mocked adapters rather than property tests, since it depends on external HTTP retrieval.
- Checkpoints ensure incremental validation at natural boundaries.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "6.1", "7.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.3", "3.4", "3.5", "4.2", "4.3", "6.2", "6.3", "6.4", "7.2", "7.3", "8.2", "8.3"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "8.4", "10.1", "10.2"] },
    { "id": 4, "tasks": ["8.5", "10.3", "11.1", "12.1", "12.2"] },
    { "id": 5, "tasks": ["11.2", "12.3", "12.4", "13.1"] },
    { "id": 6, "tasks": ["13.2"] }
  ]
}
```
