# Agent instructions — run the pipeline, don't reinvent it

This repo builds **complete** image-occlusion Anki decks on **Linux cloud agents**.
The CLIs are the product. **Judgment is yours** (which plates, which boxes, how to fix labels). **The pipeline is not** — don't rebuild it with one-off scripts.

## Freedom vs rails

**Free (quality lives here):** agentic Commons search, plate picks, vision on images, deciding shrink/split/drop/re-box, editing `work/<id>/manifest.json` / `terms.txt` / catalog cache entries, how thorough QA should be.

**Not free (burns cost, rarely helps):** rewriting `src/`/`bin/`, inventing resize/OCR/merge/pack helpers, “rebuild manifest with a script” instead of editing the JSON, Mac/`sips` shims, expanding the user's term list, MCP/repo tourism.

When something looks wrong after OCR/align: **open the plate, edit the boxes in `manifest.json`**, re-lint. Do not write a script to regenerate the manifest.

## Priority order

1. **Label accuracy** — canonical names from `terms.txt` that match printed plate text.
2. **Coverage** — required terms where the plate actually labels them.
3. **Geometry** — no full-width / absurd bars (`deck lint`).
4. **Cost** — few turns; no coding the pipeline; minimal tools.

---

## Banned (cheap mistakes)

| Ban | Do this instead |
|---|---|
| Edit `src/`, `bin/`, tests, package files | Edit `work/<id>/manifest.json` (and terms/catalog as needed) |
| `sips` shim / Mac workarounds | `sudo apt-get install -y imagemagick` |
| Merge/OCR/align/pack / “rebuild manifest” scripts | CLIs already ran; vision-edit the existing JSON |
| “Improve” OCR/align mid-job | Re-run CLI if needed; then fix data |
| Expand the user’s term list | Only the terms they gave |
| Full-width occlusion bars | Lint → shrink / split / drop+re-box with vision |

If a CLI errors, install the missing binary or fix args. Do not open `src/` to “fix” it.

---

## What the pipeline already does

| Step | CLI | Notes |
|---|---|---|
| Find plates | `catalog` / `search` / download | Catalog = **cache** of past wins, not an allowlist |
| Resize | `deck resize` | ImageMagick only (`magick` → `mogrify` → `convert`) |
| OCR | `deck ocr` | Already merges nearby words into multi-word labels |
| Align | `deck align` | OCR → canonical terms |
| Geometry | `deck lint` | Flags absurd boxes |
| Gaps | `deck missing` | Terms still unboxed |
| Pack | `deck pack` | Lint must pass |

Split OCR words (“Right” / “ventricle”)? One correct box in the **manifest** — not a new merger.

---

## Do not code (default)

- Cloud = **Linux only**. No `sips`. No Homebrew. No Darwin paths.
- Resize/size fail ⇒ `sudo apt-get install -y imagemagick` (and `tesseract-ocr` if OCR missing). Env `.cursor/environment.json` should install both; if not, install once and continue.
- Hard fail ⇒ `npm install` first. Tooling patch = last resort, smallest change, note in `report.json`.
- Prefer short CLI JSON. Do not dump large OCR/manifest/images into chat.

---

## Tool budget (cost)

**Allowed:** `bin/deck.ts` (via shell), `work/<id>/`, `examples/`, `catalog/plates.json`, `docs/RECIPE.md`, `docs/manifest.schema.json`, `AGENTS.md`.

**Forbidden:** exploring `src/`, `node_modules/`, other projects, MCP, writing one-off `.py`/`.sh` helpers for merge/resize/OCR.

- Prefer **Shell**: `npx tsx bin/deck.ts …`
- Batch CLIs; don’t re-walk the repo between steps
- After pack + `report.json`: **stop**

---

## How plates are found (agentic search + cache)

Users can request **any** topic and a **custom term list**. Catalog is not an allowlist.

1. **Cache hit:** `deck catalog <topic>` returns plates that cover the terms/views → `deck download <topic>`.
2. **Cache miss (common):** `deck search "…"`, pick labeled OpenStax/CC plates that **print** the requested terms, download into `work/<id>/plates`. Optionally append to `catalog/plates.json` for next time.
3. Prefer fewer good labeled plates over many unlabeled photos.
4. Never invent unprinted structures. Never rewrite download code.

---

## Hard rules

1. Full deck for the brief — not a toy sample.
2. Order: init → (catalog|search) → download → resize → ocr → align → lint → missing → **vision-fix manifest** → pack → `report.json`.
3. **Lint must pass before pack.** `too_wide`/`too_tall` ⇒ inspect plate; shrink, split, or drop+re-place. No full-width bars.
4. `lint --fix` only if you then re-box dropped labels with vision — don’t ship incomplete coverage quietly.
5. Small **unmasked** printed labels = intentional (not quizzed). Giant bars = bugs.
6. Header / Footer / Remarks / Sources **empty** on cards. Attribution in deck `desc` / `report.json`.
7. One agent. No subagent swarms.
8. Model: Composer 2.5 standard (cost) or Grok 4.7 standard (hard vision). No Opus unless asked.

---

## Workflow

```
# deps (if env install didn’t already): sudo apt-get install -y tesseract-ocr imagemagick
npm install
npx tsx bin/deck.ts job init <id> --from examples/<topic>   # or mkdir work/<id> + write terms.txt
# cache hit:
npx tsx bin/deck.ts download <topic> -o work/<id>/plates
# else: deck search "…" → curl/download URLs into work/<id>/plates (optionally update catalog)
npx tsx bin/deck.ts resize work/<id>/plates/*.jpg
npx tsx bin/deck.ts ocr work/<id>/plates/*.jpg -o work/<id>/ocr.json
npx tsx bin/deck.ts align work/<id>/ocr.json work/<id>/terms.txt \
  --plates work/<id>/plates --name "<Deck Name>" -o work/<id>/manifest.json
npx tsx bin/deck.ts lint work/<id>/manifest.json
# vision-fix work/<id>/manifest.json  (optional: lint --fix then re-add boxes)
npx tsx bin/deck.ts missing work/<id>/manifest.json work/<id>/terms.txt
npx tsx bin/deck.ts pack work/<id>/manifest.json -o work/<id>/out/deck.apkg
# write work/<id>/report.json → stop
```

---

## Cloud launch prompt (paste)

```
Follow AGENTS.md. Freedom on search/plates/vision/manifest edits. Do not rewrite the pipeline (no src edits, no sips/merge/rebuild-manifest scripts).
Build full image-occlusion deck for: <topic>
Required terms ONLY: <paste>
Catalog = cache; miss ⇒ deck search → download → ocr → align → lint → vision-fix manifest → pack + report.json. Stop.
```

---

## Read only if needed

| Need | File |
|---|---|
| Recipe | `docs/RECIPE.md` |
| Manifest schema | `docs/manifest.schema.json` |
| Example terms | `examples/skull/terms.txt` |
| Plate cache | `catalog/plates.json` |

**Do not** dump `src/` into context.
