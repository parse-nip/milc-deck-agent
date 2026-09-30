import { describe, expect, it } from "vitest";
import { catalogSearch } from "../src/catalog.js";
import { missingTerms, normalizeTerm } from "../src/missing.js";
import type { DeckManifest } from "../src/pack.js";

describe("catalogSearch", () => {
  it("finds skull plates", () => {
    const hits = catalogSearch("skull");
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits.every((h) => h.license.includes("CC"))).toBe(true);
  });
});

describe("missingTerms", () => {
  it("reports gaps", () => {
    const manifest: DeckManifest = {
      deck: { name: "Test" },
      plates: [
        {
          id: "a",
          file: "a.jpg",
          width: 100,
          height: 100,
          boxes: [
            { x: 1, y: 1, width: 10, height: 10, label: "Frontal bone" },
            { x: 2, y: 2, width: 10, height: 10, label: "Parietal bone" },
          ],
        },
      ],
    };
    const result = missingTerms(manifest, ["Frontal bone", "Occipital bone"]);
    expect(result.present).toEqual(["Frontal bone"]);
    expect(result.missing).toEqual(["Occipital bone"]);
    expect(normalizeTerm("Frontal_bone")).toBe("frontal bone");
  });
});
