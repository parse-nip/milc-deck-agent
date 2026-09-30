import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export type OcrBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  conf: number;
};

/** Run system tesseract TSV and merge nearby word boxes into labels. */
export function ocrWithTesseract(imagePath: string): {
  file: string;
  boxes: OcrBox[];
  width?: number;
  height?: number;
} {
  const dir = mkdtempSync(join(tmpdir(), "milc-ocr-"));
  const outBase = join(dir, "out");
  try {
    execFileSync("tesseract", [imagePath, outBase, "--psm", "11", "tsv"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const tsv = readFileSync(`${outBase}.tsv`, "utf8");
    const boxes = mergeTsvWords(tsv);
    return { file: imagePath, boxes };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function ocrMany(paths: string[]): Array<ReturnType<typeof ocrWithTesseract>> {
  return paths.map((p) => {
    try {
      return ocrWithTesseract(p);
    } catch (err) {
      return {
        file: p,
        boxes: [],
        error: err instanceof Error ? err.message : String(err),
      } as ReturnType<typeof ocrWithTesseract> & { error?: string };
    }
  });
}

function mergeTsvWords(tsv: string): OcrBox[] {
  const lines = tsv.split(/\r?\n/).slice(1);
  type Word = { left: number; top: number; width: number; height: number; conf: number; text: string };
  const words: Word[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 12) continue;
    const level = Number(cols[0]);
    if (level !== 5) continue;
    const conf = Number(cols[10]);
    const text = (cols[11] ?? "").trim();
    if (!text || conf < 40) continue;
    if (/^\d+$/.test(text) && text.length <= 2) continue;
    words.push({
      left: Number(cols[6]),
      top: Number(cols[7]),
      width: Number(cols[8]),
      height: Number(cols[9]),
      conf,
      text,
    });
  }
  words.sort((a, b) => a.top - b.top || a.left - b.left);
  const groups: Word[][] = [];
  for (const w of words) {
    const last = groups[groups.length - 1];
    if (!last) {
      groups.push([w]);
      continue;
    }
    const prev = last[last.length - 1]!;
    const sameLine = Math.abs(w.top - prev.top) <= Math.max(prev.height, w.height) * 0.6;
    const close = w.left <= prev.left + prev.width + Math.max(12, prev.height);
    if (sameLine && close) last.push(w);
    else groups.push([w]);
  }
  return groups.map((group) => {
    const left = Math.min(...group.map((g) => g.left));
    const top = Math.min(...group.map((g) => g.top));
    const right = Math.max(...group.map((g) => g.left + g.width));
    const bottom = Math.max(...group.map((g) => g.top + g.height));
    const conf = group.reduce((s, g) => s + g.conf, 0) / group.length;
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      label: group.map((g) => g.text).join(" "),
      conf: Math.round(conf),
    };
  });
}

export function writeOcrJson(results: ReturnType<typeof ocrMany>, outPath: string) {
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  return { outPath, plates: results.length, boxes: results.reduce((n, r) => n + r.boxes.length, 0) };
}

export function plateIdFromPath(path: string): string {
  return basename(path).replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}
