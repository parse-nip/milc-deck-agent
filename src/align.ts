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

export type AmbiguousLabel = {
  ocr: string;
  box: { x: number; y: number; width: number; height: number };
  candidates: string[];
  reason: "several_terms" | "label_less_specific_than_term";
};

/** The plate prints fewer words than the term has ("Distal phalanx" vs "Distal phalanx of thumb"). */
function lessSpecific(ocr: string, term: string): boolean {
  const a = normalizeTerm(ocr);
  const b = normalizeTerm(term);
  return a !== b && !a.includes(b) && b.includes(a);
}

/**
 * Map OCR boxes onto canonical required terms. Drops junk captions. Geometry lint is separate.
 * A printed label that fits several terms (every "Distal phalanx" on a hand plate) or is less specific than the
 * term is AMBIGUOUS: it is reported, never boxed on a guess. The agent resolves those by looking.
 */
export function alignPlate(
  plate: OcrPlate,
  required: string[],
  opts: { minScore?: number; minConf?: number } = {}
): { boxes: ManifestBox[]; unmatchedOcr: string[]; matchedTerms: string[]; ambiguous: AmbiguousLabel[] } {
  const minScore = opts.minScore ?? 80;
  const minConf = opts.minConf ?? 45;
  const usedTerms = new Set<string>();
  const boxes: ManifestBox[] = [];
  const unmatchedOcr: string[] = [];
  const ambiguous: AmbiguousLabel[] = [];

  for (const box of plate.boxes) {
    if ((box.conf ?? 100) < minConf) continue;
    const scored = required.map((term) => ({ term, score: scoreMatch(box.label, term) }));
    const top = Math.max(0, ...scored.map((c) => c.score));
    if (top < minScore) {
      unmatchedOcr.push(box.label);
      continue;
    }
    const best = scored.filter((c) => c.score === top).map((c) => c.term);
    const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
    if (best.length > 1) {
      ambiguous.push({ ocr: box.label, box: rect, candidates: best, reason: "several_terms" });
      continue;
    }
    if (lessSpecific(box.label, best[0])) {
      ambiguous.push({ ocr: box.label, box: rect, candidates: best, reason: "label_less_specific_than_term" });
      continue;
    }
    usedTerms.add(best[0]);
    boxes.push({ ...rect, label: best[0], source: "ocr", ocrLabel: box.label });
  }

  return { boxes, unmatchedOcr, matchedTerms: [...usedTerms], ambiguous };
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
      ambiguous: aligned.ambiguous,
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
