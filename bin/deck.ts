#!/usr/bin/env node
import { cpSync, mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { searchCommons } from "../src/commons.js";
import { catalogSearch } from "../src/catalog.js";
import { ocrMany, writeOcrJson } from "../src/ocr.js";
import { loadManifest, packManifest } from "../src/pack.js";
import { missingFromPaths, readTermsFile } from "../src/missing.js";
import { manifestFromOcr, readJson, writeJson, type OcrPlate } from "../src/align.js";
import { downloadCatalogPlates, imageSize, resizeLongEdge } from "../src/download.js";
import { buildApkgPreview } from "../src/preview-apkg.js";
import { lintManifest, stripBadBoxes } from "../src/lint.js";

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
      "deck lint <manifest.json> [--fix]",
      "deck pack <manifest.json> [-o out.apkg] [--force]",
      "deck preview <deck.apkg> [-o outDir]",
    ],
    tip: "Full decks + accurate labels. Run deck lint before pack. Fix too_wide bars with vision.",
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

  if (cmd === "lint") {
    const args = [...rest];
    const fix = args.includes("--fix");
    const filtered = args.filter((a) => a !== "--fix");
    const manifestPath = filtered[0];
    if (!manifestPath) throw new Error("manifest path required");
    const resolved = resolve(manifestPath);
    const manifest = loadManifest(resolved);
    const result = lintManifest(manifest);
    if (fix && !result.ok) {
      const cleaned = stripBadBoxes(manifest);
      writeJson(resolved, cleaned.manifest);
      print({
        ...lintManifest(cleaned.manifest),
        fixed: true,
        removed: cleaned.removed.length,
        removedSample: cleaned.removed.slice(0, 20).map((i) => ({
          plate: i.plateId,
          label: i.label,
          code: i.code,
          detail: i.detail,
        })),
      });
      return;
    }
    print({
      ...result,
      issues: result.issues.map((i) => ({
        plate: i.plateId,
        label: i.label,
        code: i.code,
        detail: i.detail,
        widthFrac: Number(i.widthFrac.toFixed(3)),
        heightFrac: Number(i.heightFrac.toFixed(3)),
      })),
    });
    if (!result.ok) process.exit(2);
    return;
  }

  if (cmd === "pack") {
    const args = [...rest];
    const force = args.includes("--force");
    const filtered = args.filter((a) => a !== "--force");
    const out = takeFlag(filtered, "-o") ?? "out/deck.apkg";
    const manifestPath = filtered[0];
    if (!manifestPath) throw new Error("manifest path required");
    const resolved = resolve(manifestPath);
    const manifest = loadManifest(resolved);
    const lint = lintManifest(manifest);
    if (!lint.ok && !force) {
      print({
        error: "lint_failed",
        message: "Fix too_wide/too_tall boxes (or deck lint --fix then re-box with vision). Use --force to pack anyway.",
        issues: lint.issues.slice(0, 30).map((i) => ({
          plate: i.plateId,
          label: i.label,
          code: i.code,
          detail: i.detail,
        })),
        count: lint.issues.length,
      });
      process.exit(2);
    }
    const result = await packManifest(manifest, resolved, resolve(out));
    print({ ...result, lintOk: lint.ok, lintIssues: lint.issues.length });
    return;
  }

  if (cmd === "preview") {
    const args = [...rest];
    const out = takeFlag(args, "-o");
    const apkg = args[0];
    if (!apkg) throw new Error("apkg path required");
    const resolved = resolve(apkg);
    const outDir = resolve(out ?? join(dirname(resolved), "preview"));
    print(await buildApkgPreview(resolved, outDir));
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
