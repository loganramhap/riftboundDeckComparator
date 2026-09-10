export * from "./types.js";
export * from "./cardCode.js";
export * from "./normalizer.js";
export * from "./parser.js";
export * from "./nameResolver.js";
export * from "./comparison.js";
export * from "./share.js";
export * as deckCode from "./deckCode.js";
// The Comparator's `compare` collides with the Comparison_Engine's `compare`
// re-exported above, so the Comparator's flavor is re-exported under a distinct
// name; its types and factory come through the wildcard.
export {
  createComparator,
  compare as compareRequest,
  type Comparator,
  type CompareRequest,
  type DeckInput,
  type ComparisonView,
  type LinkImporter,
  type ImportedDeck,
} from "./comparator.js";
