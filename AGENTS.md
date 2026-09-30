# Agent instructions — run the pipeline, don't reinvent it

This repo builds **complete** image-occlusion Anki decks. The CLIs are the product. Your job is to **run them and fix deck data**, not to rewrite TypeScript.

## Priority order

1. **Label accuracy** — canonical names from `terms.txt` that match printed plate text.
2. **Coverage** — required terms where the plate actually labels them.
3. **Geometry** — no full-width / absurd bars (`deck lint`).
4. **Cost** — few turns; no coding; no repo tourism; minimal tools.

## Do not code (default)

- **Do not edit `src/`, `bin/`, tests, or package files.** The pipeline is already Linux-ready.
- If `deck resize` / image size fails: run **`apt-get install -y imagemagick`** (or ensure `sips` on macOS). Errors say this explicitly. **Never edit `src/download.ts`.**
- If something else hard-fails: install deps / `npm install` first. Only patch tooling as a last resort, smallest change, note why in `report.json`.
- **Never** "improve" align/OCR/pack logic mid-job. Fix `work/<id>/manifest.json` instead.
- Prefer short CLI JSON. Do not cat large files or images into chat.

## Tool budget (cost)

- **Allowed paths only:** `bin/deck.ts`, `work/<id>/`, `examples/`, `catalog/plates.json`, `docs/RECIPE.md`, `docs/manifest.schema.json`, `AGENTS.md`.
- **Forbidden:** Glob/Grep/Read of `src/`, `node_modules/`, unrelated repos, agent transcripts, MCP servers (disable them for this job).
- Prefer **Shell** running `npx tsx bin/deck.ts …` over exploring.
- Batch CLIs; do not re-read the whole repo between steps.
- After `report.json` + pack (and optional preview): **stop**. No cleanup essays, no extra commits unless asked.
- Keep replies short. No long plans in chat.

## How plates are found (agentic search + cache)

Users can ask for **any** anatomy topic and a **custom term list**. Do not assume a hardcoded catalog covers them.

1. **Cache hit:** If `deck catalog <topic>` returns plates that clearly cover the requested terms/views, use `deck download <topic>` (fast path). Catalog is a **cache of previous wins**, not a closed allowlist.
2. **Cache miss (default for new subjects):** Agentic discovery via `deck search "<query>"` (Commons). Search for labeled OpenStax / CC anatomy plates that actually print the requested terms. Download chosen URLs into `work/<id>/plates`. Optionally append winners to `catalog/plates.json` so the **next** identical topic is a cache hit.
3. Match plates to the **user’s term list** (may be a small subset). Prefer fewer good plates over many irrelevant ones. Never invent unprinted structures.
4. Do **not** wander random websites or rewrite download code. Use `deck search` → choose → download → pipeline.

## Hard rules

1. Build the **full** deck the brief asks for. No tiny smoke decks.
2. Batch CLIs: `job init` → (`catalog` / `search` if needed) → `download` → `resize` → `ocr` → `align` → `lint` → `missing` → vision-fix data → `pack`.
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
npx tsx bin/deck.ts job init <id> --from examples/<topic>
# if topic already in catalog:
npx tsx bin/deck.ts download <topic> -o work/<id>/plates
# else: deck search "…" → add to catalog/plates.json OR download chosen URLs into work/<id>/plates
npx tsx bin/deck.ts resize work/<id>/plates/*.jpg
npx tsx bin/deck.ts ocr work/<id>/plates/*.jpg -o work/<id>/ocr.json
npx tsx bin/deck.ts align work/<id>/ocr.json work/<id>/terms.txt \
  --plates work/<id>/plates --name "<Deck Name>" -o work/<id>/manifest.json
npx tsx bin/deck.ts lint work/<id>/manifest.json
# fix lint issues in manifest.json (vision). optional: lint --fix then re-add good boxes
npx tsx bin/deck.ts missing work/<id>/manifest.json work/<id>/terms.txt
npx tsx bin/deck.ts pack work/<id>/manifest.json -o work/<id>/out/deck.apkg
# write work/<id>/report.json → stop
```

## Cloud launch prompt (paste)

```
Build a full image-occlusion deck for: <topic>
Required terms (ONLY these — do not expand): <paste terms>
Follow AGENTS.md. Catalog is cache only — if no good cache match, agentic deck search, then download.
Use only bin/deck.ts + work/<id>/ + catalog + examples. Do not read or edit src/. No MCP. Few tool calls.
After align: lint must pass; vision-fix boxes for accuracy + coverage of the term list.
Pack + report.json (note plate sources). Optionally cache plates into catalog/plates.json. Stop.
```

## Read only if needed

| Need | File |
|---|---|
| Recipe | `docs/RECIPE.md` |
| Manifest | `docs/manifest.schema.json` |
| Terms | `examples/skull/terms.txt` |
| Catalog | `catalog/plates.json` |

Do **not** dump `src/` into context.
