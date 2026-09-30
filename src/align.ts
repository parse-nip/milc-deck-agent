import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { normalizeTerm } from "./missing.js";
import type { DeckManifest, ManifestBox, ManifestPlate } from "./pack.js";

export type OcrPlate = {
  file: string;
  boxes: Array<{ x: number; y: number; width: number; height: number; label: string; conf?: number }>;
  width?: number;
  height?: number;
};

function scoreMatch(ocr: string, term: string): number {
  const a = normalizeTerm(ocr);
  const b = normalizeTerm(term);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 90;
  const at = new Set(a.split(" "));
  const bt = b.split(" ");
  const hit = bt.filter((t) => at.has(t)).length;
  if (hit === 0) return 0;
  return Math.round((hit / bt.length) * 80);
}

/** Map OCR boxes onto canonical required terms. Drops junk captions and geometrically impossible bars. */
export function alignPlate(
  plate: OcrPlate,
  required: string[],
  opts: { minScore?: number; minConf?: number; maxWidthFrac?: number; maxHeightFrac?: number } = {}
): { boxes: ManifestBox[]; unmatchedOcr: string[]; matchedTerms: string[]; droppedWide: string[] } {
  const minScore = opts.minScore ?? 80;
  const minConf = opts.minConf ?? 45;
  const maxWidthFrac = opts.maxWidthFrac ?? 0.28;
  const maxHeightFrac = opts.maxHeightFrac ?? 0.12;
  const usedTerms = new Set<string>();
  const boxes: ManifestBox[] = [];
  const unmatchedOcr: string[] = [];
  const droppedWide: string[] = [];
  const pw = plate.width ?? 0;
  const ph = plate.height ?? 0;

  for (const box of plate.boxes) {
    if ((box.conf ?? 100) < minConf) continue;
    if (pw > 0 && box.width / pw > maxWidthFrac) {
      droppedWide.push(box.label);
      continue;
    }
    if (ph > 0 && box.height / ph > maxHeightFrac) {
      droppedWide.push(box.label);
      continue;
    }
    let best: { term: string; score: number } | null = null;
    for (const term of required) {
      const score = scoreMatch(box.label, term);
      if (!best || score > best.score) best = { term, score };
    }
    if (!best || best.score < minScore) {
      unmatchedOcr.push(box.label);
      continue;
    }
    usedTerms.add(best.term);
    boxes.push({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      label: best.term,
    });
  }

  return { boxes, unmatchedOcr, matchedTerms: [...usedTerms], droppedWide };
}

export function manifestFromOcr(input: {
  deckName: string;
  desc?: string;
  required: string[];
  plates: Array<OcrPlate & { id?: string; sourceUrl?: string; license?: string; width: number; height: number }>;
}): { manifest: DeckManifest; report: Record<string, unknown> } {
  const plates: ManifestPlate[] = [];
  const reportPlates: unknown[] = [];
  for (const plate of input.plates) {
    const id = plate.id ?? basename(plate.file).replace(/\.[^.]+$/, "").toLowerCase();
    const aligned = alignPlate(plate, input.required);
    plates.push({
      id,
      file: plate.file,
      width: plate.width,
      height: plate.height,
      header: "",
      sourceUrl: plate.sourceUrl,
      license: plate.license,
      boxes: aligned.boxes,
    });
    reportPlates.push({
      id,
      boxes: aligned.boxes.length,
      matchedTerms: aligned.matchedTerms,
      unmatchedOcrSample: aligned.unmatchedOcr.slice(0, 12),
      droppedWideSample: aligned.droppedWide.slice(0, 12),
    });
  }
  return {
    manifest: {
      deck: { name: input.deckName, desc: input.desc ?? "" },
      plates,
    },
    report: { plates: reportPlates },
  };
}

export function writeJson(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
