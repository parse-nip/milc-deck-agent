# Agent instructions — run the pipeline, don't reinvent it

This repo builds **complete** image-occlusion Anki decks on **Linux cloud agents**.
The CLIs are the product. Your job is to **run them and fix deck data** (`work/<id>/manifest.json`), **not** to rewrite TypeScript, invent shims, or add helper scripts.

## Priority order

1. **Label accuracy** — canonical names from `terms.txt` that match printed plate text.
2. **Coverage** — required terms where the plate actually labels them.
3. **Geometry** — no full-width / absurd bars (`deck lint`).
4. **Cost** — few turns; no coding; no repo tourism; minimal tools.

---

## Banned (you will be graded on this)

Do **none** of these. They are the usual failure modes:

| Ban | Do this instead |
|---|---|
| Edit `src/`, `bin/`, tests, `package.json`, lockfiles | Fix `work/<id>/manifest.json` / terms / catalog only |
| Invent a **`sips` shim** or any Mac workaround | `sudo apt-get install -y imagemagick` (env install should already do this) |
| Write a **merge-boxes / OCR / align / pack script** | Pipeline already does it — see below |
| “Improve” OCR/align/lint mid-job | Re-run CLI; vision-edit manifest |
| Read or Grep `src/` to “understand” resize/OCR | Trust `deck …` CLIs + this file |
| Open MCP / browse unrelated repos | Stay in this repo’s allowed paths |
| Expand the user’s term list | Only the terms they gave |
| Ship full-width occlusion bars | Lint → shrink / split / drop+re-box with vision |
| Tiny smoke decks when a full deck was asked | Full coverage of requested terms on suitable plates |

If a CLI errors, **install the missing binary** or re-run with correct args. Do not open `src/download.ts` / `src/ocr.ts` / `src/align.ts`.

---

## What the pipeline already does (do not reimplement)

| Step | CLI | Already handled |
|---|---|---|
| Find plates | `deck catalog` / `deck search` / download URLs | Commons search; catalog = **cache** of past wins |
| Resize | `deck resize` | **ImageMagick only** (`magick` → `mogrify` → `convert`). No macOS. |
| OCR | `deck ocr` | Tesseract TSV + **merges nearby words into multi-word labels** (e.g. “Right ventricle”). Do **not** write a merge script. |
| Align | `deck align` | Maps OCR strings → canonical `terms.txt` |
| Geometry | `deck lint` | Flags `too_wide` / `too_tall` (often left+right labels glued) |
| Gaps | `deck missing` | Terms not yet boxed |
| Pack | `deck pack` | Builds `.apkg` (lint must pass) |

**Your real work after align:** vision on plates → edit boxes/labels in `manifest.json` → re-lint → pack.

Split words still unmatched (“Right” / “ventricle” separate)? Fix **in the manifest** (one box, correct term), or drop junk OCR boxes — **do not** add a new merger.

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
Follow AGENTS.md exactly. Banned: editing src/, sips shims, merge/OCR helper scripts, expanding terms, MCP, repo tourism.
Build full image-occlusion deck for: <topic>
Required terms ONLY: <paste>
Catalog = cache. Miss ⇒ deck search → download → pipeline.
OCR already merges multi-word labels. After align: lint + vision-fix manifest.json only.
Pack + report.json. Optionally cache plates in catalog/plates.json. Stop.
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
