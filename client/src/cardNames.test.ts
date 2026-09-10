/**
 * Tests for card-name resolution and canonical-identity collapsing.
 *
 * Cards that share a name (alternate arts, "overnumbered" reprints, cross-set
 * reprints) must collapse to a single canonical identity so they compare as the
 * same card, and resolve to the same display name.
 */

import { describe, it, expect } from "vitest";
import {
  canonicalizeIdentity,
  resolveCardName,
  sectionForCard,
} from "./cardNames.js";

describe("canonicalizeIdentity", () => {
  it("collapses an overnumbered reprint to the base identity", () => {
    // VEN-155 and VEN-197 are both "Heart of the Tempest".
    const a = canonicalizeIdentity("VEN-155");
    const b = canonicalizeIdentity("VEN-197");
    expect(a).toBe(b);
  });

  it("collapses cross-set reprints of the same card", () => {
    // OGN-007 and VEN-R01 are both "Fury Rune".
    expect(canonicalizeIdentity("OGN-007")).toBe(canonicalizeIdentity("VEN-R01"));
  });

  it("collapses across printing variants (art suffix) too", () => {
    // A variant suffix normalizes away first, then canonicalizes.
    expect(canonicalizeIdentity("VEN-197a")).toBe(canonicalizeIdentity("VEN-155"));
  });

  it("leaves an unknown code as its own identity", () => {
    expect(canonicalizeIdentity("ZZZ-999")).toBe("ZZZ-999");
  });

  it("passes a free-text card name through unchanged", () => {
    expect(canonicalizeIdentity("Traveling Merchant")).toBe("Traveling Merchant");
  });
});

describe("resolveCardName", () => {
  it("resolves both printings of a reprint to the same name", () => {
    expect(resolveCardName("VEN-155")).toBe("Heart of the Tempest");
    expect(resolveCardName("VEN-197")).toBe("Heart of the Tempest");
  });
});

describe("sectionForCard", () => {
  it("places legends in the Legend section", () => {
    // VEN-155 is "Heart of the Tempest", a Legend.
    expect(sectionForCard("VEN-155")).toBe("Legend");
    // ...including its overnumbered reprint via canonicalization.
    expect(sectionForCard("VEN-197")).toBe("Legend");
  });

  it("places runes in the Runes section", () => {
    expect(sectionForCard("OGN-166")).toBe("Runes"); // Chaos Rune
    expect(sectionForCard("OGN-007")).toBe("Runes"); // Fury Rune
  });

  it("places battlefields in the Battlefields section", () => {
    expect(sectionForCard("OGN-275")).toBe("Battlefields");
  });

  it("returns undefined for units/spells/gear (no forced section)", () => {
    // OGN-001 "Blazing Scorcher" is a Unit.
    expect(sectionForCard("OGN-001")).toBeUndefined();
  });
});
