/**
 * Build script: convert the "All Card Data" CSV into a normalized-identity ->
 * card-name JSON map bundled with the client.
 *
 * Usage:
 *   node client/scripts/build-card-names.mjs [path/to/cards.csv]
 *
 * Defaults to the CSV in the repo root. Writes client/src/card-names.json.
 *
 * The CSV has a header row with at least `ID` and `Name` columns. IDs look like
 * `ogn-001`, `ven-r01`, `ven-sp1`, `ogn-030a`. Each ID is normalized to the
 * app's identity key: uppercased, variant suffix stripped, set + full number
 * (including any R/SP prefix) retained — e.g. `ogn-030a` -> `OGN-030`,
 * `ven-sp1` -> `VEN-SP1`. When multiple printings share an identity, the first
 * name seen wins (they are the same card).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const csvPath =
  process.argv[2] ?? resolve(repoRoot, "data/all-card-data.csv");
const namesOutPath = resolve(here, "../src/card-names.json");
const canonicalOutPath = resolve(here, "../src/canonical-identity.json");
const sectionsOutPath = resolve(here, "../src/card-sections.json");

/**
 * Card types whose section is fixed by the card itself, regardless of which
 * deck-code zone or list header it appeared under. Units/Spells/Gear have no
 * fixed section (they follow the source zone / header).
 */
const SECTION_BY_TYPE = {
  Legend: "Legend",
  Battlefield: "Battlefields",
  Rune: "Runes",
};

/** Minimal RFC-4180-ish CSV parser (handles quoted fields with commas/newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Normalize a raw card code (e.g. "ogn-030a") to its identity ("OGN-030"). */
const CARD_CODE = /^([A-Z]{3})-(SP|R|)([0-9]+)([A-Z*]?)$/;
function toIdentity(rawId) {
  const code = rawId.trim().toUpperCase();
  const m = CARD_CODE.exec(code);
  if (!m) return null;
  const [, set, prefix, number] = m;
  return `${set}-${prefix}${number}`;
}

const csv = readFileSync(csvPath, "utf8");
const rows = parseCsv(csv);
if (rows.length === 0) {
  throw new Error(`CSV appears empty: ${csvPath}`);
}

const header = rows[0].map((h) => h.trim().toLowerCase());
const idCol = header.indexOf("id");
const nameCol = header.indexOf("name");
const typeCol = header.indexOf("card type");
if (idCol < 0 || nameCol < 0) {
  throw new Error(
    `CSV must have "ID" and "Name" columns; found: ${header.join(", ")}`,
  );
}

// identity -> name (first name seen for an identity wins) and
// name -> list of identities (to collapse same-named printings, incl.
// "overnumbered" reprints, to one canonical identity).
const nameByIdentity = {};
const identitiesByName = new Map();
// identity -> fixed Section implied by the card's type (Legend/Battlefield/Rune).
const sectionByIdentity = {};
for (let r = 1; r < rows.length; r++) {
  const cols = rows[r];
  const rawId = (cols[idCol] ?? "").trim();
  const name = (cols[nameCol] ?? "").trim();
  const type = typeCol >= 0 ? (cols[typeCol] ?? "").trim() : "";
  if (!rawId || !name) continue;
  const identity = toIdentity(rawId);
  if (!identity) continue;
  if (!(identity in nameByIdentity)) {
    nameByIdentity[identity] = name;
  }
  const fixedSection = SECTION_BY_TYPE[type];
  if (fixedSection && !(identity in sectionByIdentity)) {
    sectionByIdentity[identity] = fixedSection;
  }
  let list = identitiesByName.get(name);
  if (!list) {
    list = [];
    identitiesByName.set(name, list);
  }
  if (!list.includes(identity)) list.push(identity);
}

// Choose a canonical identity per name: the lexicographically-smallest identity
// (deterministic and stable). Every identity that shares a name maps to it, so
// alternate arts and overnumbered reprints collapse to one card for comparison.
const canonicalByIdentity = {};
for (const [, identities] of identitiesByName) {
  const canonical = [...identities].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0];
  for (const identity of identities) {
    if (identity !== canonical) {
      canonicalByIdentity[identity] = canonical;
    }
  }
}

// Emit sorted keys for stable diffs.
const sortEntries = (obj) =>
  Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

// Re-key the type-based section map by canonical identity, so it applies after
// same-name reprints collapse (e.g. a rune reprinted across sets).
const sectionByCanonical = {};
for (const [identity, section] of Object.entries(sectionByIdentity)) {
  const canonical = canonicalByIdentity[identity] ?? identity;
  if (!(canonical in sectionByCanonical)) {
    sectionByCanonical[canonical] = section;
  }
  // Keep the raw identity too, so lookups work whether or not canonicalized.
  sectionByIdentity[identity] = section;
}
const mergedSections = { ...sectionByIdentity, ...sectionByCanonical };

writeFileSync(
  namesOutPath,
  JSON.stringify(sortEntries(nameByIdentity), null, 2) + "\n",
  "utf8",
);
writeFileSync(
  canonicalOutPath,
  JSON.stringify(sortEntries(canonicalByIdentity), null, 2) + "\n",
  "utf8",
);
writeFileSync(
  sectionsOutPath,
  JSON.stringify(sortEntries(mergedSections), null, 2) + "\n",
  "utf8",
);
console.log(
  `Wrote ${Object.keys(nameByIdentity).length} card names to ${namesOutPath}`,
);
console.log(
  `Wrote ${Object.keys(canonicalByIdentity).length} identity aliases to ${canonicalOutPath}`,
);
console.log(
  `Wrote ${Object.keys(mergedSections).length} type-based sections to ${sectionsOutPath}`,
);
