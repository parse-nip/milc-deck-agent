import { describe, expect, it } from "vitest";
import { lintManifest, stripBadBoxes } from "../src/lint.js";
import type { DeckManifest } from "../src/pack.js";

const base: DeckManifest = {
  deck: { name: "T" },
  plates: [
    {
      id: "p1",
      file: "p1.jpg",
      width: 1000,
      height: 800,
      boxes: [
        { x: 10, y: 10, width: 80, height: 20, label: "Good" },
        { x: 10, y: 100, width: 900, height: 30, label: "Bar" },
      ],
    },
  ],
};

describe("lintManifest", () => {
  it("flags full-width bars", () => {
    const result = lintManifest(base);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "too_wide" && i.label === "Bar")).toBe(true);
    expect(result.issues.some((i) => i.label === "Good")).toBe(false);
  });

  it("stripBadBoxes removes offenders", () => {
    const { manifest, removed } = stripBadBoxes(base);
    expect(removed.length).toBeGreaterThan(0);
    expect(manifest.plates[0]!.boxes.map((b) => b.label)).toEqual(["Good"]);
    expect(lintManifest(manifest).ok).toBe(true);
  });
});
