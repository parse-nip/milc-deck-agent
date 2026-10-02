import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import { qaReviewProblem, type QaReport } from "../src/qa.js";

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
});
