/**
 * Tests for card-name resolution and canonical-identity collapsing.
 *
 * Cards that share a name (alternate arts, "overnumbered" reprints, cross-set
 * reprints) must collapse to a single canonical identity so they compare as the
 * same card, and resolve to the same display name.
 */

import { describe, it, expect } from "vitest";
import { canonicalizeIdentity, resolveCardName } from "./cardNames.js";

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
