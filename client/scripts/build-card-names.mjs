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
const outPath = resolve(here, "../src/card-names.json");

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
if (idCol < 0 || nameCol < 0) {
  throw new Error(
    `CSV must have "ID" and "Name" columns; found: ${header.join(", ")}`,
  );
}

const map = {};
let count = 0;
for (let r = 1; r < rows.length; r++) {
  const cols = rows[r];
  const rawId = (cols[idCol] ?? "").trim();
  const name = (cols[nameCol] ?? "").trim();
  if (!rawId || !name) continue;
  const identity = toIdentity(rawId);
  if (!identity) continue;
  // First name seen for an identity wins (printings share a name).
  if (!(identity in map)) {
    map[identity] = name;
    count++;
  }
}

// Emit sorted keys for stable diffs.
const sorted = Object.fromEntries(
  Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
);
writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n", "utf8");
console.log(`Wrote ${count} card names to ${outPath}`);
