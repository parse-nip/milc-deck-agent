import type { DeckManifest, ManifestBox, ManifestPlate } from "./pack.js";

export type BoxIssue = {
  plateId: string;
  label: string;
  code: "too_wide" | "too_tall" | "out_of_bounds" | "tiny" | "zero_size";
  detail: string;
  box: ManifestBox;
  widthFrac: number;
  heightFrac: number;
};

export type LintOptions = {
  /** Reject boxes wider than this fraction of plate width (default 0.28). */
  maxWidthFrac?: number;
  /** Reject boxes taller than this fraction of plate height (default 0.12). */
  maxHeightFrac?: number;
  /** Minimum box edge in px (default 4). */
  minEdge?: number;
};

export type LintResult = {
  ok: boolean;
  plates: number;
  boxes: number;
  issues: BoxIssue[];
  byPlate: Record<string, number>;
};

const DEFAULTS = {
  maxWidthFrac: 0.28,
  maxHeightFrac: 0.12,
  minEdge: 4,
};

export function lintManifest(manifest: DeckManifest, opts: LintOptions = {}): LintResult {
  const maxWidthFrac = opts.maxWidthFrac ?? DEFAULTS.maxWidthFrac;
  const maxHeightFrac = opts.maxHeightFrac ?? DEFAULTS.maxHeightFrac;
  const minEdge = opts.minEdge ?? DEFAULTS.minEdge;
  const issues: BoxIssue[] = [];
  let boxes = 0;

  for (const plate of manifest.plates) {
    for (const box of plate.boxes) {
      boxes += 1;
      const widthFrac = plate.width > 0 ? box.width / plate.width : 1;
      const heightFrac = plate.height > 0 ? box.height / plate.height : 1;
      const push = (code: BoxIssue["code"], detail: string) =>
        issues.push({
          plateId: plate.id,
          label: box.label,
          code,
          detail,
          box,
          widthFrac,
          heightFrac,
        });

      if (box.width <= 0 || box.height <= 0) {
        push("zero_size", `w=${box.width} h=${box.height}`);
        continue;
      }
      if (box.width < minEdge || box.height < minEdge) {
        push("tiny", `edge < ${minEdge}px`);
      }
      if (
        box.x < 0 ||
        box.y < 0 ||
        box.x + box.width > plate.width + 1 ||
        box.y + box.height > plate.height + 1
      ) {
        push(
          "out_of_bounds",
          `box=[${box.x},${box.y},${box.width},${box.height}] plate=${plate.width}x${plate.height}`
        );
      }
      if (widthFrac > maxWidthFrac) {
        push(
          "too_wide",
          `${(widthFrac * 100).toFixed(1)}% of plate width > ${(maxWidthFrac * 100).toFixed(0)}% — likely OCR merged left+right labels`
        );
      }
      if (heightFrac > maxHeightFrac) {
        push(
          "too_tall",
          `${(heightFrac * 100).toFixed(1)}% of plate height > ${(maxHeightFrac * 100).toFixed(0)}%`
        );
      }
    }
  }

  const byPlate: Record<string, number> = {};
  for (const issue of issues) {
    byPlate[issue.plateId] = (byPlate[issue.plateId] ?? 0) + 1;
  }

  return {
    ok: issues.length === 0,
    plates: manifest.plates.length,
    boxes,
    issues,
    byPlate,
  };
}

/** Drop geometrically bad boxes (kept for re-OCR / vision). Returns cleaned manifest + removed. */
export function stripBadBoxes(
  manifest: DeckManifest,
  opts: LintOptions = {}
): { manifest: DeckManifest; removed: BoxIssue[] } {
  const lint = lintManifest(manifest, opts);
  if (lint.ok) return { manifest, removed: [] };

  const badKeys = new Set(
    lint.issues.map((i) => `${i.plateId}::${i.box.x},${i.box.y},${i.box.width},${i.box.height},${i.label}`)
  );

  const plates: ManifestPlate[] = manifest.plates.map((plate) => ({
    ...plate,
    boxes: plate.boxes.filter((box) => {
      const key = `${plate.id}::${box.x},${box.y},${box.width},${box.height},${box.label}`;
      return !badKeys.has(key);
    }),
  }));

  return {
    manifest: { ...manifest, plates },
    removed: lint.issues,
  };
}
