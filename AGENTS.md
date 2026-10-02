# Agent instructions — accurate full decks, cheap tooling

This repo builds **complete** image-occlusion Anki decks. Speed/cost come from **batch CLIs**, not from shipping tiny toy decks.

## Priority order

1. **Label accuracy** — every box label must be the real printed anatomy name (canonical form from `terms.txt`). Wrong OCR text is a failure.
2. **Coverage** — required terms present wherever the plate actually labels them (same structure on multiple views is OK).
3. **Cost** — batch tools; no repo tourism; no subagent swarms.

## Scope

Only image-occlusion deck jobs for this repo. Refuse anything else in one short reply.

## Hard rules

1. Build the **full** deck the brief asks for (all catalog plates for the topic unless the user caps it). Do not substitute a 2-plate smoke deck.
2. **Batch CLIs first** (`download`, `ocr`, `align`, `missing`, `pack`). Prefer JSON over opening binaries in chat.
3. **Vision is allowed and expected for label QA.** When OCR is wrong or a required term is missing on a plate that clearly shows it, open that plate (or a thumb) and fix the box/label. Do not invent structures that are not printed.
4. Leave Header / Footer / Remarks / Sources **empty** on cards. Put attribution on the deck `desc` / `report.json`.
5. Do not white-paint unused labels. Do not add mask boxes for labels you are not quizzing.
6. Resize long edge to **1600px** before packing (`deck resize`) — and **before** `align`, so manifest width/height match the pixels (pack refuses mismatches; covers would shift on import).
7. **Vision QA is mandatory, not optional.** Run `deck qa work/<id>/manifest.json`, then **open every** `work/<id>/qa/*.png` with vision (actually look). Fix wrong/misplaced/over-wide boxes in `manifest.json`, re-run `deck qa`. Write `work/<id>/qa-review.json` with `manifestHash` from `qa.json` and `{plate, ok: true, note}` per overlay. `step qa done` and `pack` refuse until that passes. `deck lint` must pass (no full-width bars).
8. **No swarms.** One agent. Stop when `deck missing` is empty (or only terms absent from all plates) and `.apkg` exists.
9. Preferred models: Composer 2.5 standard (cost) or Grok Fast (speed). No Opus unless asked.

## Workflow

```
npm install   # once
# Linux cloud: sudo apt-get install -y tesseract-ocr imagemagick  (no sips / Homebrew)

npx tsx bin/deck.ts job init <id> --from examples/skull
# plates chosen:  npx tsx bin/deck.ts step find done --job work/<id>
npx tsx bin/deck.ts download skull -o work/<id>/plates
npx tsx bin/deck.ts resize work/<id>/plates/*.jpg
npx tsx bin/deck.ts ocr work/<id>/plates/*.jpg -o work/<id>/ocr.json
npx tsx bin/deck.ts align work/<id>/ocr.json work/<id>/terms.txt \
  --plates work/<id>/plates -o work/<id>/manifest.json
npx tsx bin/deck.ts missing work/<id>/manifest.json work/<id>/terms.txt
npx tsx bin/deck.ts lint work/<id>/manifest.json
# vision-fix misses / bad labels on the specific plates only (edit manifest.json)
npx tsx bin/deck.ts qa work/<id>/manifest.json      # then OPEN every qa/*.png (vision!)
# write work/<id>/qa-review.json  (ok:true + note per plate, same manifestHash as qa.json)
npx tsx bin/deck.ts step qa done --job work/<id>
npx tsx bin/deck.ts pack work/<id>/manifest.json -o work/<id>/out/deck.apkg
# write work/<id>/report.json → stop
```

## Files to read (only if needed)

| Need | File |
|---|---|
| Recipe | `docs/RECIPE.md` |
| Manifest | `docs/manifest.schema.json` |
| Skull terms | `examples/skull/terms.txt` |
| Catalog | `catalog/plates.json` |

Do **not** dump all of `src/` into context.

## Progress signals (the app checklist reads these)

Run CLIs as `npx tsx bin/deck.ts …`. After plates chosen: `deck step find done --job work/<id>`. After overlays checked: `deck step qa done --job work/<id>`.
