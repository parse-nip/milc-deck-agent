import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { lintManifest } from "./lint.js";
import { plateSizeProblems, type DeckManifest } from "./pack.js";

export interface QaReport {
  manifestHash: string;
  /** Boxes without grounding: no source, or source=vision without evidence. Must be empty. */
  groundingIssues: string[];
  /** Boxes placed by vision: each needs its own per-box review (a crop was rendered for it). */
  visionBoxes: Array<{ plate: string; index: number; label: string; crop: string }>;
  lintOk: boolean;
  lintIssues: number;
  sizeProblems: string[];
  overlays: Array<{ plate: string; boxes: number; file: string }>;
}

export function manifestHash(manifestPath: string): string {
  return createHash("sha256").update(readFileSync(manifestPath)).digest("hex").slice(0, 16);
}

function magick(args: string[]) {
  for (const bin of [["magick"], ["convert"]]) {
    try {
      execFileSync(bin[0], [...bin.slice(1), ...args], { stdio: "ignore" });
      return;
    } catch {
      /* try next */
    }
  }
  throw new Error("ImageMagick not found. Run: sudo apt-get install -y imagemagick");
}

/** Every box must say where it came from; vision boxes must say why they are THIS structure. */
export function groundingIssues(manifest: DeckManifest): string[] {
  const issues: string[] = [];
  for (const plate of manifest.plates) {
    plate.boxes.forEach((box, i) => {
      const where = `${plate.id}#${i + 1} "${box.label}"`;
      if (box.source === "ocr") return;
      if (box.source !== "vision") {
        issues.push(`${where}: no source — let align create it, or set source:"vision" with evidence`);
      } else if ((box.evidence ?? "").trim().length < 20) {
        issues.push(`${where}: source=vision needs evidence (what makes this box this structure: printed label, leader line to what)`);
      }
    });
  }
  return issues;
}

/** Draw every box + its label on each plate so the agent can LOOK at placement (vision QA). */
export function renderQaOverlays(manifest: DeckManifest, manifestPath: string): QaReport {
  const baseDir = dirname(resolve(manifestPath));
  const qaDir = join(baseDir, "qa");
  mkdirSync(qaDir, { recursive: true });
  const overlays: QaReport["overlays"] = [];
  for (const plate of manifest.plates) {
    const src = isAbsolute(plate.file) ? plate.file : join(baseDir, plate.file);
    const out = join(qaDir, `${plate.id}.png`);
    const draw: string[] = [];
    plate.boxes.forEach((b, i) => {
      draw.push(
        "-fill", "rgba(255,0,0,0.25)", "-stroke", "red", "-strokewidth", "2",
        "-draw", `rectangle ${b.x},${b.y} ${b.x + b.width},${b.y + b.height}`,
        "-fill", "blue", "-stroke", "none", "-pointsize", "16",
        "-annotate", `+${b.x + 2}+${Math.max(14, b.y - 2)}`, `${i + 1}:${b.label.replace(/[\\"']/g, "")}`
      );
    });
    magick([src, ...draw, out]);
    overlays.push({ plate: plate.id, boxes: plate.boxes.length, file: out });
  }
  // A zoomed crop for every vision-placed box, so "is this the thumb?" is judged on the box, not the whole plate.
  const visionBoxes: QaReport["visionBoxes"] = [];
  for (const plate of manifest.plates) {
    const src = isAbsolute(plate.file) ? plate.file : join(baseDir, plate.file);
    plate.boxes.forEach((b, i) => {
      if (b.source !== "vision") return;
      const pad = Math.round(Math.max(b.width, b.height) * 1.5 + 60);
      const x = Math.max(0, Math.round(b.x - pad));
      const y = Math.max(0, Math.round(b.y - pad));
      const w = Math.min(plate.width - x, Math.round(b.width + pad * 2));
      const h = Math.min(plate.height - y, Math.round(b.height + pad * 2));
      mkdirSync(join(qaDir, plate.id), { recursive: true });
      const crop = join(qaDir, plate.id, `box-${i + 1}.png`);
      magick([
        src,
        "-fill", "none", "-stroke", "red", "-strokewidth", "3",
        "-draw", `rectangle ${b.x},${b.y} ${b.x + b.width},${b.y + b.height}`,
        "-crop", `${w}x${h}+${x}+${y}`, "+repage", crop,
      ]);
      visionBoxes.push({ plate: plate.id, index: i + 1, label: b.label, crop });
    });
  }
  const lint = lintManifest(manifest);
  const report: QaReport = {
    groundingIssues: groundingIssues(manifest),
    visionBoxes,
    manifestHash: manifestHash(resolve(manifestPath)),
    lintOk: lint.ok,
    lintIssues: lint.issues.length,
    sizeProblems: plateSizeProblems(manifest, baseDir),
    overlays,
  };
  writeFileSync(join(baseDir, "qa.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export type QaReviewPlate = { plate: string; ok: boolean; note: string };
export type QaReviewBox = { plate: string; index: number; ok: boolean; seen: string };
export type QaReview = {
  /** One entry per vision-placed box, written after opening its crop. */
  boxes?: QaReviewBox[];
  /** Must match qa.json / current manifest hash. */
  manifestHash: string;
  /** One entry per overlay plate — written AFTER opening each qa/*.png with vision. */
  plates: QaReviewPlate[];
};

/** Evidence gate for `deck step qa done` / pack: overlays rendered for the CURRENT manifest, lint + size clean. */
export function qaDoneProblem(jobDir: string): string | null {
  let report: QaReport;
  try {
    report = JSON.parse(readFileSync(join(jobDir, "qa.json"), "utf8")) as QaReport;
  } catch {
    return "run `deck qa work/<id>/manifest.json` and open each overlay in qa/ before marking qa done";
  }
  if (report.manifestHash !== manifestHash(join(jobDir, "manifest.json"))) {
    return "manifest.json changed since the last `deck qa` — re-run it and re-check the overlays";
  }
  if (report.groundingIssues?.length) return `ungrounded boxes: ${report.groundingIssues.slice(0, 5).join("; ")}`;
  if (!report.lintOk) return `lint has ${report.lintIssues} issue(s) — fix boxes, re-run \`deck qa\``;
  if (report.sizeProblems.length) return `size mismatch: ${report.sizeProblems.join("; ")}`;

  const reviewProblem = qaReviewProblem(jobDir, report);
  if (reviewProblem) return reviewProblem;
  return null;
}

/**
 * After vision, agent writes work/<id>/qa-review.json proving it looked at each overlay.
 * Example:
 * { "manifestHash": "<from qa.json>", "plates": [
 *   { "plate": "openstax-hand-wrist", "ok": true, "note": "boxes on thumb proximal + distal phalanx labels" }
 * ]}
 */
export function qaReviewProblem(jobDir: string, report?: QaReport): string | null {
  let qa = report;
  if (!qa) {
    try {
      qa = JSON.parse(readFileSync(join(jobDir, "qa.json"), "utf8")) as QaReport;
    } catch {
      return "missing qa.json — run `deck qa` first";
    }
  }
  let review: QaReview;
  try {
    review = JSON.parse(readFileSync(join(jobDir, "qa-review.json"), "utf8")) as QaReview;
  } catch {
    return (
      "write qa-review.json after OPENing every qa/*.png (vision): " +
      `{ "manifestHash": "${qa.manifestHash}", "plates": [{ "plate": "<id>", "ok": true, "note": "what you checked" }, ...] }`
    );
  }
  if (review.manifestHash !== qa.manifestHash) {
    return "qa-review.json manifestHash mismatch — re-check overlays after the latest `deck qa`";
  }
  if (!Array.isArray(review.plates) || !review.plates.length) {
    return "qa-review.json needs a plates[] entry per overlay";
  }
  const byId = new Map(review.plates.map((p) => [p.plate, p]));
  for (const ov of qa.overlays) {
    const row = byId.get(ov.plate);
    if (!row) return `qa-review.json missing plate "${ov.plate}" — open qa/${ov.plate}.png and record it`;
    if (typeof row.note !== "string" || row.note.trim().length < 8) {
      return `qa-review.json plate "${ov.plate}" needs a real note (what you saw)`;
    }
    if (row.ok !== true) {
      return `qa-review.json plate "${ov.plate}" is not ok — fix manifest, re-run deck qa, update review`;
    }
  }
  const seen = new Map((review.boxes ?? []).map((b) => [`${b.plate}#${b.index}`, b]));
  for (const vb of qa.visionBoxes ?? []) {
    const row = seen.get(`${vb.plate}#${vb.index}`);
    if (!row) {
      return `qa-review.json needs boxes[] entry for ${vb.plate}#${vb.index} "${vb.label}" — open ${vb.crop} and say what the red box covers`;
    }
    const said = (row.seen ?? "").trim();
    if (row.ok !== true || said.length < 20 || said.toLowerCase() === vb.label.toLowerCase()) {
      return `qa-review.json box ${vb.plate}#${vb.index} "${vb.label}": ok must be true and "seen" must describe what the box actually covers (20+ chars, not just the label)`;
    }
  }
  return null;
}
