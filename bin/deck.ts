#!/usr/bin/env node
import { cpSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { searchCommons } from "../src/commons.js";
import { catalogSearch } from "../src/catalog.js";
import { ocrMany, writeOcrJson } from "../src/ocr.js";
import { loadManifest, packManifest } from "../src/pack.js";
import { missingFromPaths, readTermsFile } from "../src/missing.js";
import { manifestFromOcr, readJson, writeJson, type OcrPlate } from "../src/align.js";
import { downloadCatalogPlates, imageSize, resizeLongEdge } from "../src/download.js";

function print(data: unknown) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function usage(): never {
  print({
    usage: [
      "deck help",
      "deck job init <id> [--from examples/skull]",
      "deck catalog <topic>",
      "deck search <query> [--limit N]",
      "deck download <topic> [-o dir]",
      "deck resize <image...>",
      "deck ocr <image...> [-o out.json]",
      "deck align <ocr.json> <terms.txt> --plates <dir> -o manifest.json",
      "deck missing <manifest.json> <terms.txt>",
      "deck pack <manifest.json> [-o out.apkg]",
    ],
    tip: "Full decks + accurate labels. Use vision to fix OCR misses — not to skip the pipeline.",
  });
  process.exit(0);
}

function takeFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") usage();

  if (cmd === "job" && rest[0] === "init") {
    const args = rest.slice(1);
    const from = takeFlag(args, "--from");
    const id = args[0];
    if (!id) throw new Error("job id required");
    const root = join("work", id);
    mkdirSync(join(root, "plates"), { recursive: true });
    mkdirSync(join(root, "out"), { recursive: true });
    if (from) {
      const src = resolve(from);
      if (existsSync(join(src, "brief.json"))) cpSync(join(src, "brief.json"), join(root, "brief.json"));
      if (existsSync(join(src, "terms.txt"))) cpSync(join(src, "terms.txt"), join(root, "terms.txt"));
    }
    if (!existsSync(join(root, "brief.json"))) {
      writeFileSync(
        join(root, "brief.json"),
        JSON.stringify(
          {
            topic: "",
            deckName: "",
            requiredTermsFile: "terms.txt",
            maxPlates: 12,
            notes: "Full deck. Accurate printed labels only.",
          },
          null,
          2
        )
      );
    }
    if (!existsSync(join(root, "terms.txt"))) writeFileSync(join(root, "terms.txt"), "# one term per line\n");
    print({ ok: true, root, from: from ?? null });
    return;
  }

  if (cmd === "catalog") {
    const topic = rest.join(" ").trim();
    if (!topic) throw new Error("topic required");
    print({ topic, count: catalogSearch(topic).length, plates: catalogSearch(topic) });
    return;
  }

  if (cmd === "search") {
    const args = [...rest];
    const limit = Number(takeFlag(args, "--limit") ?? 8);
    const query = args.join(" ").trim();
    if (!query) throw new Error("query required");
    print({ query, hits: await searchCommons(query, limit) });
    return;
  }

  if (cmd === "download") {
    const args = [...rest];
    const out = takeFlag(args, "-o") ?? join("work", "plates");
    const topic = args.join(" ").trim();
    if (!topic) throw new Error("topic required");
    print(await downloadCatalogPlates(topic, resolve(out)));
    return;
  }

  if (cmd === "resize") {
    if (!rest.length) throw new Error("image paths required");
    print(
      rest.map((p) => {
        const path = resolve(p);
        return { file: path, ...resizeLongEdge(path, 1600) };
      })
    );
    return;
  }

  if (cmd === "ocr") {
    const args = [...rest];
    const out = takeFlag(args, "-o");
    if (!args.length) throw new Error("image paths required");
    const results = ocrMany(args.map((p) => resolve(p)));
    if (out) print(writeOcrJson(results, resolve(out)));
    else print(results);
    return;
  }

  if (cmd === "align") {
    const args = [...rest];
    const platesDir = takeFlag(args, "--plates");
    const out = takeFlag(args, "-o");
    const deckName = takeFlag(args, "--name") ?? "Deck";
    const [ocrPath, termsPath] = args;
    if (!ocrPath || !termsPath || !platesDir || !out) {
      throw new Error("align <ocr.json> <terms.txt> --plates <dir> -o <manifest.json>");
    }
    const ocr = readJson<OcrPlate[]>(resolve(ocrPath));
    const required = readTermsFile(resolve(termsPath));
    const sourcesPath = join(resolve(platesDir), "sources.json");
    const sources = existsSync(sourcesPath)
      ? readJson<Array<{ id: string; url?: string; license?: string; localPath: string }>>(sourcesPath)
      : [];
    const byFile = new Map(sources.map((s) => [s.localPath, s]));

    const plates = ocr.map((plate) => {
      const fileName = basename(plate.file);
      const local = join(resolve(platesDir), fileName);
      const sized = imageSize(existsSync(local) ? local : plate.file);
      const src = byFile.get(fileName);
      const id = src?.id ?? fileName.replace(/\.[^.]+$/, "");
      return {
        ...plate,
        id,
        file: existsSync(local) ? fileName : plate.file,
        width: sized.width,
        height: sized.height,
        sourceUrl: src?.url,
        license: src?.license,
      };
    });

    // If ocr paths are absolute outside plates dir, also try matching by id prefix
    if (!plates.length && existsSync(resolve(platesDir))) {
      const files = readdirSync(resolve(platesDir)).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
      print({ error: "no ocr plates", files });
      process.exit(1);
    }

    const { manifest, report } = manifestFromOcr({
      deckName,
      desc: "Built by milc-deck-agent. Labels aligned to required terms.",
      required,
      plates,
    });
    writeJson(resolve(out), manifest);
    print({
      out: resolve(out),
      plates: manifest.plates.length,
      boxes: manifest.plates.reduce((n, p) => n + p.boxes.length, 0),
      report,
    });
    return;
  }

  if (cmd === "missing") {
    const [manifest, terms] = rest;
    if (!manifest || !terms) throw new Error("manifest and terms.txt required");
    print(missingFromPaths(resolve(manifest), resolve(terms)));
    return;
  }

  if (cmd === "pack") {
    const args = [...rest];
    const out = takeFlag(args, "-o") ?? "out/deck.apkg";
    const manifestPath = args[0];
    if (!manifestPath) throw new Error("manifest path required");
    const resolved = resolve(manifestPath);
    const result = await packManifest(loadManifest(resolved), resolved, resolve(out));
    print(result);
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
