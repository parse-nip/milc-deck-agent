# Agent instructions — run the pipeline, don't reinvent it

This repo builds **complete** image-occlusion Anki decks. The CLIs are the product. Your job is to **run them and fix deck data**, not to rewrite TypeScript.

## Priority order

1. **Label accuracy** — canonical names from `terms.txt` that match printed plate text.
2. **Coverage** — required terms where the plate actually labels them.
3. **Geometry** — no full-width / absurd bars (`deck lint`).
4. **Cost** — few turns; no coding; no repo tourism.

## Do not code (default)

- **Do not edit `src/`, `bin/`, tests, or package files.** The pipeline is already Linux-ready.
- If `deck resize` / image size fails: run **`apt-get install -y imagemagick`** (or ensure `sips` on macOS). Errors say this explicitly. **Never edit `src/download.ts`.**
- If something else hard-fails: install deps / `npm install` first. Only patch tooling as a last resort, smallest change, note why in `report.json`.
- **Never** "improve" align/OCR/pack logic mid-job. Fix `work/<id>/manifest.json` instead.
- Prefer short CLI JSON. Do not cat large files or images into chat.

## Hard rules

1. Build the **full** deck the brief asks for. No tiny smoke decks.
2. Batch CLIs: `job init` → `download` → `resize` → `ocr` → `align` → `lint` → `missing` → vision-fix data → `pack`.
3. **`deck lint` must pass before pack.** `too_wide` / `too_tall` usually means OCR merged left+right labels. Inspect that plate and decide: shrink the box, split, or drop and re-place. Do not leave full-width bars.
4. `deck lint --fix` only strips offenders if you choose to; then re-box dropped labels with vision. Do not silently ship without coverage.
5. Small **unmasked** printed labels are intentional (not quizzing those). Giant bars are bugs.
6. Header / Footer / Remarks / Sources empty on cards. Attribution on deck `desc` / `report.json`.
7. Resize uses **sips → magick → mogrify → convert** already. Missing tools ⇒ install ImageMagick, don't code.
8. No subagent swarms. One agent.
9. Models: Composer 2.5 standard (cost) or Grok 4.7 standard (harder vision). No Opus unless asked.

## Workflow

```
npm install
npx tsx bin/deck.ts job init <id> --from examples/skull
npx tsx bin/deck.ts download skull -o work/<id>/plates
npx tsx bin/deck.ts resize work/<id>/plates/*.jpg
npx tsx bin/deck.ts ocr work/<id>/plates/*.jpg -o work/<id>/ocr.json
npx tsx bin/deck.ts align work/<id>/ocr.json work/<id>/terms.txt \
  --plates work/<id>/plates --name "Axial Skeleton (Skull)" -o work/<id>/manifest.json
npx tsx bin/deck.ts lint work/<id>/manifest.json
# fix lint issues in manifest.json (vision). optional: lint --fix then re-add good boxes
npx tsx bin/deck.ts missing work/<id>/manifest.json work/<id>/terms.txt
npx tsx bin/deck.ts pack work/<id>/manifest.json -o work/<id>/out/deck.apkg
# write work/<id>/report.json → stop
```

## Read only if needed

| Need | File |
|---|---|
| Recipe | `docs/RECIPE.md` |
| Manifest | `docs/manifest.schema.json` |
| Terms | `examples/skull/terms.txt` |
| Catalog | `catalog/plates.json` |

Do **not** dump `src/` into context.
