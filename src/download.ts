import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { catalogSearch, type CatalogPlate } from "./catalog.js";

const UA = "milc-deck-agent/0.1 (https://github.com/parse-nip/milc-deck-agent)";

export async function downloadUrl(url: string, dest: string): Promise<{ path: string; bytes: number }> {
  mkdirSync(dirname(dest), { recursive: true });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status} ${url}`);
  const file = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), file);
  const bytes = readFileSync(dest).byteLength;
  return { path: dest, bytes };
}

export async function downloadCatalogPlates(topic: string, destDir: string): Promise<{
  dir: string;
  plates: Array<CatalogPlate & { localPath: string; bytes: number }>;
}> {
  mkdirSync(destDir, { recursive: true });
  const hits = catalogSearch(topic);
  if (!hits.length) throw new Error(`no catalog plates for topic: ${topic}`);
  const plates = [];
  for (const hit of hits) {
    const name = `${hit.id}.jpg`;
    const localPath = join(destDir, name);
    if (!existsSync(localPath)) {
      const { bytes } = await downloadUrl(hit.url, localPath);
      plates.push({ ...hit, localPath, bytes });
    } else {
      plates.push({ ...hit, localPath, bytes: readFileSync(localPath).byteLength });
    }
  }
  writeFileSync(join(destDir, "sources.json"), JSON.stringify(plates.map((p) => ({
    id: p.id,
    url: p.url,
    license: p.license,
    credit: p.credit,
    localPath: basename(p.localPath),
  })), null, 2) + "\n");
  return { dir: destDir, plates };
}

function imageSizeIdentify(path: string): { width: number; height: number } | null {
  try {
    const out = execFileSync("identify", ["-format", "%w %h", path], { encoding: "utf8" }).trim();
    const [w, h] = out.split(/\s+/).map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch {
    // fall through
  }
  return null;
}

export function imageSize(path: string): { width: number; height: number } {
  try {
    const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], {
      encoding: "utf8",
    });
    const width = Number(/pixelWidth:\s*(\d+)/.exec(out)?.[1]);
    const height = Number(/pixelHeight:\s*(\d+)/.exec(out)?.[1]);
    if (width > 0 && height > 0) return { width, height };
  } catch {
    // fall through
  }
  const viaIdentify = imageSizeIdentify(path);
  if (viaIdentify) return viaIdentify;
  throw new Error(`could not read image size for ${path} (need sips or ImageMagick identify)`);
}

/** Resize so long edge is maxEdge; returns new size. Mutates file in place via sips. */
export function resizeLongEdge(path: string, maxEdge = 1600): { width: number; height: number; scaled: boolean } {
  const before = imageSize(path);
  const long = Math.max(before.width, before.height);
  if (long <= maxEdge) return { ...before, scaled: false };
  const scaledViaSips = () => {
    const args =
      before.width >= before.height
        ? ["--resampleWidth", String(maxEdge), path]
        : ["--resampleHeight", String(maxEdge), path];
    execFileSync("sips", args, { stdio: "ignore" });
  };
  try {
    scaledViaSips();
  } catch {
    const geometry =
      before.width >= before.height ? `${maxEdge}x` : `x${maxEdge}`;
    execFileSync("mogrify", ["-resize", geometry, path], { stdio: "ignore" });
  }
  const after = imageSize(path);
  return { ...after, scaled: true };
}
