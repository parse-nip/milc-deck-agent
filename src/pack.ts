import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { imageSize } from "./download.js";
import { buildOcclusionArtifacts, fieldsFromMap, imageOcclusionNoteType } from "./anki/image-occlusion.js";
import { exportApkg } from "./anki/exportApkg.js";
import type { Card, Note, ParsedPackage } from "./anki/types.js";

export interface ManifestBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
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

/** Compare manifest width/height to the on-disk plate image (qa gate). */
export function plateSizeProblems(manifest: DeckManifest, baseDir: string): string[] {
  const problems: string[] = [];
  for (const plate of manifest.plates) {
    const candidates = [
      isAbsolute(plate.file) ? plate.file : join(baseDir, plate.file),
      join(baseDir, "plates", plate.file),
    ];
    let sized: { width: number; height: number } | null = null;
    for (const path of candidates) {
      try {
        sized = imageSize(path);
        break;
      } catch {
        /* try next */
      }
    }
    if (!sized) {
      problems.push(`${plate.id}: cannot read plate image`);
      continue;
    }
    if (sized.width !== plate.width || sized.height !== plate.height) {
      problems.push(
        `${plate.id}: manifest ${plate.width}x${plate.height} but image is ${sized.width}x${sized.height}`
      );
    }
  }
  return problems;
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

export async function packManifest(
  manifest: DeckManifest,
  manifestPath: string,
  outPath: string
): Promise<{ notes: number; cards: number; bytes: number; outPath: string }> {
  const baseDir = dirname(resolve(manifestPath));
  const noteType = imageOcclusionNoteType(1_720_000_000_000);
  const deckId = 1_720_000_000_001;
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
      imageFilename: `${plate.id}.jpg`,
      boxes: plate.boxes,
      header: "",
      width: plate.width,
      height: plate.height,
      stem: `p${plate.id.replace(/[^a-z0-9]/gi, "")}`,
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
      const id = 1_720_000_100_000 + n;
      const label = plate.boxes[index]?.label ?? "";
      notes.push({
        id,
        guid: `dk${n.toString(36).padStart(8, "0")}`,
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
