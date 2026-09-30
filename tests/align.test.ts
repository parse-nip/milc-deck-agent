import { describe, expect, it } from "vitest";
import { alignPlate } from "../src/align.js";

describe("alignPlate", () => {
  it("canonicalizes OCR to required terms and drops junk", () => {
    const result = alignPlate(
      {
        file: "a.jpg",
        boxes: [
          { x: 1, y: 1, width: 10, height: 10, label: "Frontal bone", conf: 90 },
          { x: 2, y: 2, width: 10, height: 10, label: "Figure 7.4", conf: 88 },
          { x: 3, y: 3, width: 10, height: 10, label: "Parietal bones", conf: 85 },
        ],
      },
      ["Frontal bone", "Parietal bone", "Occipital bone"]
    );
    expect(result.boxes.map((b) => b.label).sort()).toEqual(["Frontal bone", "Parietal bone"]);
    expect(result.unmatchedOcr).toContain("Figure 7.4");
  });
});
