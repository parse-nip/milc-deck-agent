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

  const hand = [
    "Proximal phalanx of thumb",
    "Distal phalanx of thumb",
    "Proximal phalanx of index finger",
    "Distal phalanx of index finger",
  ];
  const ocr = (label: string) => ({ file: "h.jpg", boxes: [{ x: 5, y: 5, width: 40, height: 10, label, conf: 90 }] });

  it("does not guess when a printed label fits several terms (every 'Distal phalanx')", () => {
    const result = alignPlate(ocr("Distal phalanx"), hand);
    expect(result.boxes).toEqual([]);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].candidates).toEqual(["Distal phalanx of thumb", "Distal phalanx of index finger"]);
  });

  it("does not box a label that is less specific than the term", () => {
    const result = alignPlate(ocr("Distal phalanx"), ["Distal phalanx of thumb"]);
    expect(result.boxes).toEqual([]);
    expect(result.ambiguous[0].reason).toBe("label_less_specific_than_term");
  });

  it("boxes an exact printed match and records where it came from", () => {
    const result = alignPlate(ocr("Distal phalanx of thumb"), hand);
    expect(result.boxes).toHaveLength(1);
    expect(result.boxes[0]).toMatchObject({ label: "Distal phalanx of thumb", source: "ocr", ocrLabel: "Distal phalanx of thumb" });
    expect(result.ambiguous).toEqual([]);
  });
});
