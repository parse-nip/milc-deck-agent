import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { buildOcclusionArtifacts, fieldsFromMap, imageOcclusionNoteType } from "./anki/image-occlusion.js";
import { exportApkg } from "./anki/exportApkg.js";
import type { Card, Note, ParsedPackage } from "./anki/types.js";
import { displayedSize, readImageDim } from "./imagedim.js";

export interface ManifestBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Where the box came from. `ocr` = align matched printed text; `vision` = placed by looking at the plate. */
  source?: "ocr" | "vision";
  /** The text OCR actually read (source=ocr). */
  ocrLabel?: string;
  /** Required for source=vision: what on the plate makes this box THIS structure (printed label + leader line, etc). */
  evidence?: string;
}

export interface ManifestPlate {
  id: string;
  file: string;
  width: number;
  height: number;
  header?: string;
  sourceUrl?: string;
  license?: string;
  boxes: ManifestBox[];
}

export interface DeckManifest {
  deck: { name: string; desc?: string };
  plates: ManifestPlate[];
}

export function loadManifest(path: string): DeckManifest {
  return JSON.parse(readFileSync(path, "utf8")) as DeckManifest;
}

export function labelsFromManifest(manifest: DeckManifest): string[] {
  const labels: string[] = [];
  for (const plate of manifest.plates) {
    for (const box of plate.boxes) {
      if (box.label.trim()) labels.push(box.label.trim());
    }
  }
  return labels;
}

export interface PackOptions {
  /** Pack even if manifest width/height disagree with the image pixels. */
  force?: boolean;
  /** Deterministic id seed (tests). Default: unique per pack so decks never collide on import. */
  seed?: number;
}

/** Throws when a manifest plate's width/height differ from the displayed image size (covers would drift). */
export function plateSizeProblems(manifest: DeckManifest, baseDir: string): string[] {
  const problems: string[] = [];
  for (const plate of manifest.plates) {
    const filePath = isAbsolute(plate.file) ? plate.file : join(baseDir, plate.file);
    const dim = readImageDim(new Uint8Array(readFileSync(filePath)));
    if (!dim) continue;
    const shown = displayedSize(dim);
    if (shown.width !== plate.width || shown.height !== plate.height) {
      problems.push(
        `${plate.id}: manifest ${plate.width}x${plate.height} but image displays as ${shown.width}x${shown.height}` +
          (dim.orientation > 1 ? ` (EXIF orientation ${dim.orientation})` : "")
      );
    }
  }
  return problems;
}

export async function packManifest(
  manifest: DeckManifest,
  manifestPath: string,
  outPath: string,
  opts: PackOptions = {}
): Promise<{ notes: number; cards: number; bytes: number; outPath: string }> {
  const baseDir = dirname(resolve(manifestPath));
  if (!opts.force) {
    const problems = plateSizeProblems(manifest, baseDir);
    if (problems.length) {
      throw new Error(
        `size_mismatch — covers would shift on import. Re-run align (re-reads pixel size) or fix width/height:\n${problems.join("\n")}`
      );
    }
  }
  // Unique ids per pack: milc import keys notes/cards/note types by id+guid, so a fixed id range makes a
  // second deck (or a rebuild) overwrite the first in place.
  const seed = opts.seed ?? Date.now();
  const tag = seed.toString(36) + (opts.seed ? "" : Math.random().toString(36).slice(2, 5));
  const noteType = imageOcclusionNoteType(seed);
  const deckId = seed + 1;
  const notes: Note[] = [];
  const cards: Card[] = [];
  const media: ParsedPackage["media"] = [];
  const seen = new Set<string>();
  let n = 0;

  const credits = new Set<string>();
  for (const plate of manifest.plates) {
    const filePath = isAbsolute(plate.file) ? plate.file : join(baseDir, plate.file);
    const image = new Uint8Array(readFileSync(filePath));
    if (plate.license || plate.sourceUrl) {
      credits.add([plate.license, plate.sourceUrl].filter(Boolean).join(" · "));
    }
    const artifacts = buildOcclusionArtifacts({
      image,
      imageFilename: `${tag}-${plate.id}.jpg`,
      boxes: plate.boxes,
      header: "",
      width: plate.width,
      height: plate.height,
      stem: `p${tag}${plate.id.replace(/[^a-z0-9]/gi, "")}`,
    });
    for (const file of artifacts.media) {
      if (seen.has(file.filename)) continue;
      seen.add(file.filename);
      media.push(file);
    }
    artifacts.notes.forEach((map, index) => {
      n += 1;
      map.Remarks = "";
      map.Sources = "";
      map.Header = "";
      map.Footer = "";
      const id = seed + 1000 + n;
      const label = plate.boxes[index]?.label ?? "";
      notes.push({
        id,
        guid: `dk${tag}${n.toString(36).padStart(4, "0")}`,
        noteTypeId: noteType.id,
        fields: fieldsFromMap(noteType, map),
        tags: [plate.id, label.replaceAll(" ", "_")].filter(Boolean),
      });
      cards.push({
        id,
        noteId: id,
        deckId,
        ord: 0,
        type: 0,
        queue: 0,
        due: n,
        interval: 0,
        factor: 2500,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
      });
    });
  }

  const descParts = [manifest.deck.desc ?? ""];
  if (credits.size) descParts.push(`Sources: ${[...credits].join("; ")}`);

  const pkg: ParsedPackage = {
    format: "legacy1",
    schemaVersion: 11,
    collectionCrt: Math.floor(Date.now() / 1000),
    decks: [
      {
        id: deckId,
        name: manifest.deck.name,
        desc: descParts.filter(Boolean).join("\n"),
      },
    ],
    noteTypes: [noteType],
    notes,
    cards,
    media,
  };

  const blob = await exportApkg(pkg);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes);
  return { notes: notes.length, cards: cards.length, bytes: bytes.length, outPath };
}
