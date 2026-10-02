import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import { groundingIssues, qaReviewProblem, type QaReport } from "../src/qa.js";
import type { DeckManifest } from "../src/pack.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs.length = 0;
});

function jobWithQa(overlays: string[]): { dir: string; report: QaReport } {
  const dir = join(tmpdir(), `qa-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  const report: QaReport = {
    manifestHash: "abc123hash",
    lintOk: true,
    lintIssues: 0,
    sizeProblems: [],
    overlays: overlays.map((plate) => ({ plate, boxes: 1, file: join(dir, "qa", `${plate}.png`) })),
  };
  writeFileSync(join(dir, "qa.json"), JSON.stringify(report, null, 2));
  return { dir, report };
}

describe("qaReviewProblem", () => {
  it("requires qa-review.json after overlays exist", () => {
    const { dir, report } = jobWithQa(["plate-a"]);
    expect(qaReviewProblem(dir, report)).toMatch(/qa-review\.json/);
  });

  it("accepts a complete review", () => {
    const { dir, report } = jobWithQa(["plate-a", "plate-b"]);
    writeFileSync(
      join(dir, "qa-review.json"),
      JSON.stringify({
        manifestHash: report.manifestHash,
        plates: [
          { plate: "plate-a", ok: true, note: "box on printed Proximal phalanx of thumb" },
          { plate: "plate-b", ok: true, note: "box on printed Distal phalanx of thumb" },
        ],
      })
    );
    expect(qaReviewProblem(dir, report)).toBeNull();
  });

  it("rejects ok:false or short notes", () => {
    const { dir, report } = jobWithQa(["plate-a"]);
    writeFileSync(
      join(dir, "qa-review.json"),
      JSON.stringify({
        manifestHash: report.manifestHash,
        plates: [{ plate: "plate-a", ok: false, note: "wrong bone — will fix" }],
      })
    );
    expect(qaReviewProblem(dir, report)).toMatch(/not ok/);
  });

  it("requires a per-box review for every vision-placed box", () => {
    const { dir, report } = jobWithQa(["plate-a"]);
    report.visionBoxes = [{ plate: "plate-a", index: 2, label: "Distal phalanx of thumb", crop: "x.png" }];
    const base = { manifestHash: report.manifestHash, plates: [{ plate: "plate-a", ok: true, note: "checked every box" }] };
    writeFileSync(join(dir, "qa-review.json"), JSON.stringify(base));
    expect(qaReviewProblem(dir, report)).toMatch(/boxes\[\] entry for plate-a#2/);

    const echo = { ...base, boxes: [{ plate: "plate-a", index: 2, ok: true, seen: "Distal phalanx of thumb" }] };
    writeFileSync(join(dir, "qa-review.json"), JSON.stringify(echo));
    expect(qaReviewProblem(dir, report)).toMatch(/what the box actually covers/);

    const real = { ...base, boxes: [{ plate: "plate-a", index: 2, ok: true, seen: "the tip of the thumb; leader line from the printed label ends here" }] };
    writeFileSync(join(dir, "qa-review.json"), JSON.stringify(real));
    expect(qaReviewProblem(dir, report)).toBeNull();
  });
});

describe("groundingIssues", () => {
  const manifest = (boxes: DeckManifest["plates"][number]["boxes"]): DeckManifest => ({
    deck: { name: "t" },
    plates: [{ id: "p", file: "p.jpg", width: 100, height: 100, boxes }],
  });
  const box = { x: 1, y: 1, width: 10, height: 10, label: "Thumb" };

  it("accepts OCR boxes and evidenced vision boxes", () => {
    expect(groundingIssues(manifest([{ ...box, source: "ocr" }, { ...box, source: "vision", evidence: "printed 'Pollex' with leader line ending at this tip" }]))).toEqual([]);
  });
  it("flags freehand boxes: no source, or vision without evidence", () => {
    expect(groundingIssues(manifest([box, { ...box, source: "vision", evidence: "looks right" }]))).toHaveLength(2);
  });
});
