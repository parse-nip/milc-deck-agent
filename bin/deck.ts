#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { searchCommons } from "../src/commons.js";
import { catalogSearch } from "../src/catalog.js";
import { ocrMany, writeOcrJson } from "../src/ocr.js";
import { loadManifest, packManifest } from "../src/pack.js";
import { missingFromPaths } from "../src/missing.js";

function print(data: unknown) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function usage(): never {
  print({
    usage: [
      "deck help",
      "deck job init <id>",
      "deck catalog <topic>",
      "deck search <query> [--limit N]",
      "deck ocr <image...> [-o out.json]",
      "deck missing <manifest.json> <terms.txt>",
      "deck pack <manifest.json> [-o out.apkg]",
    ],
    tip: "Prefer batch commands. Do not open images in chat unless missing terms remain.",
  });
  process.exit(0);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") usage();

  if (cmd === "job" && rest[0] === "init") {
    const id = rest[1];
    if (!id) throw new Error("job id required");
    const root = join("work", id);
    mkdirSync(join(root, "plates"), { recursive: true });
    mkdirSync(join(root, "out"), { recursive: true });
    if (!existsSync(join(root, "brief.json"))) {
      writeFileSync(
        join(root, "brief.json"),
        JSON.stringify(
          {
            topic: "",
            requiredTerms: [],
            maxPlates: 12,
            notes: "Fill topic + requiredTerms, then catalog/search → ocr → pack.",
          },
          null,
          2
        )
      );
    }
    if (!existsSync(join(root, "terms.txt"))) writeFileSync(join(root, "terms.txt"), "# one term per line\n");
    print({ ok: true, root });
    return;
  }

  if (cmd === "catalog") {
    const topic = rest.join(" ").trim();
    if (!topic) throw new Error("topic required");
    print({ topic, plates: catalogSearch(topic) });
    return;
  }

  if (cmd === "search") {
    const limitIdx = rest.indexOf("--limit");
    let limit = 8;
    const args = [...rest];
    if (limitIdx >= 0) {
      limit = Number(args[limitIdx + 1] ?? 8);
      args.splice(limitIdx, 2);
    }
    const query = args.join(" ").trim();
    if (!query) throw new Error("query required");
    print({ query, hits: await searchCommons(query, limit) });
    return;
  }

  if (cmd === "ocr") {
    const outIdx = rest.indexOf("-o");
    let out: string | undefined;
    const args = [...rest];
    if (outIdx >= 0) {
      out = args[outIdx + 1];
      args.splice(outIdx, 2);
    }
    if (!args.length) throw new Error("image paths required");
    const results = ocrMany(args.map((p) => resolve(p)));
    if (out) print(writeOcrJson(results, resolve(out)));
    else print(results);
    return;
  }

  if (cmd === "missing") {
    const [manifest, terms] = rest;
    if (!manifest || !terms) throw new Error("manifest and terms.txt required");
    print(missingFromPaths(resolve(manifest), resolve(terms)));
    return;
  }

  if (cmd === "pack") {
    const outIdx = rest.indexOf("-o");
    let out = "out/deck.apkg";
    const args = [...rest];
    if (outIdx >= 0) {
      out = args[outIdx + 1] ?? out;
      args.splice(outIdx, 2);
    }
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
