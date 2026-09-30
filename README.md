# milc-deck-agent

Tiny repo for building **image-occlusion Anki decks** with Cursor agents — optimized for **speed and token cost**.

Not the Milc app. No Next.js, no UI. Just:

1. Find CC plates (catalog + Wikimedia Commons)
2. OCR / propose boxes (batch)
3. Pack `manifest.json` → `.apkg`

## Agent rules (read `AGENTS.md`)

- Prefer **batch CLIs** over opening images in chat
- Only inspect images when a term/plate is **missing or low-confidence**
- Use Composer 2.5 standard (or Grok Fast) for short jobs; avoid swarms

## Quick start

```bash
npm install
npx tsx bin/deck.ts help
```

## Job layout

```
work/<job-id>/
  brief.json          # topic, required terms, constraints
  plates/             # downloaded images
  manifest.json       # boxes + metadata → packer input
  out/deck.apkg
  report.json         # missing terms, costs notes
```

## CLIs

| Command | Purpose |
|---|---|
| `deck search <query>` | Commons search (license-filtered) |
| `deck catalog <topic>` | Local curated plate hits |
| `deck ocr <image...>` | Tesseract box propose (needs `tesseract` on PATH) |
| `deck pack <manifest>` | Build `.apkg` |
| `deck missing <manifest> <terms.txt>` | Diff required terms vs labels |
| `deck job init <id>` | Create `work/<id>/` skeleton |
