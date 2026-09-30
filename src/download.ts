import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { catalogSearch, type CatalogPlate } from "./catalog.js";

const UA = "milc-deck-agent/0.1 (https://github.com/parse-nip/milc-deck-agent)";

function tryExec(bin: string, args: string[], opts?: { encoding?: "utf8"; stdio?: "ignore" }): string | null {
  try {
    if (opts?.stdio === "ignore") {
      execFileSync(bin, args, { stdio: "ignore" });
      return "";
    }
    return execFileSync(bin, args, { encoding: "utf8" });
  } catch {
    return null;
  }
}

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
  writeFileSync(
    join(destDir, "sources.json"),
    JSON.stringify(
      plates.map((p) => ({
        id: p.id,
        url: p.url,
        license: p.license,
        credit: p.credit,
        localPath: basename(p.localPath),
      })),
      null,
      2
    ) + "\n"
  );
  return { dir: destDir, plates };
}

/** Read pixel size via ImageMagick (identify / magick). Linux cloud agents only. */
export function imageSize(path: string): { width: number; height: number } {
  for (const args of [
    ["identify", ["-format", "%w %h", path]],
    ["magick", ["identify", "-format", "%w %h", path]],
  ] as const) {
    const out = tryExec(args[0], [...args[1]], { encoding: "utf8" })?.trim();
    if (!out) continue;
    const [w, h] = out.split(/\s+/).map(Number);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

  throw new Error(
    `could not read image size for ${path}. Run: apt-get install -y imagemagick. Do not edit src/ or invent sips shims.`
  );
}

/**
 * Resize so long edge is maxEdge. Mutates file in place.
 * ImageMagick only: magick → mogrify → convert (Linux).
 */
export function resizeLongEdge(path: string, maxEdge = 1600): { width: number; height: number; scaled: boolean } {
  const before = imageSize(path);
  const long = Math.max(before.width, before.height);
  if (long <= maxEdge) return { ...before, scaled: false };

  const useWidth = before.width >= before.height;
  const geometry = useWidth ? `${maxEdge}x` : `x${maxEdge}`;

  const ok =
    tryExec("magick", [path, "-resize", geometry, path], { stdio: "ignore" }) !== null ||
    tryExec("mogrify", ["-resize", geometry, path], { stdio: "ignore" }) !== null ||
    tryExec("convert", [path, "-resize", geometry, path], { stdio: "ignore" }) !== null;

  if (!ok) {
    throw new Error(
      `could not resize ${path}. Run: apt-get install -y imagemagick. Do not edit src/ or invent sips shims.`
    );
  }

  const after = imageSize(path);
  return { ...after, scaled: true };
}
