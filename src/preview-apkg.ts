import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import JSZip from "jszip";
import { loadSqlEngine } from "./anki/sqlite.js";
import type { Database } from "sql.js";
import { FIELD_SEPARATOR } from "./anki/types.js";

type PreviewCard = {
  id: number;
  label: string;
  plateId: string;
  tags: string[];
  questionHtml: string;
  answerHtml: string;
  header: string;
  remarks: string;
  sources: string;
  flags: string[];
};

type PlateSummary = {
  id: string;
  cardCount: number;
  labels: string[];
  imageFile?: string;
};

function queryAll(db: Database, sql: string): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function srcFromImg(html: string): string | null {
  const m = /src="([^"]+)"/i.exec(html);
  return m?.[1] ?? null;
}

export async function buildApkgPreview(apkgPath: string, outDir: string): Promise<{
  outDir: string;
  cards: number;
  plates: number;
  indexPath: string;
}> {
  const bytes = readFileSync(resolve(apkgPath));
  const zip = await JSZip.loadAsync(bytes);
  const mediaRaw = await zip.file("media")?.async("string");
  if (!mediaRaw) throw new Error("apkg missing media map");
  const mediaMap = JSON.parse(mediaRaw) as Record<string, string>;
  const mediaDir = join(outDir, "media");
  mkdirSync(mediaDir, { recursive: true });

  const nameToLocal = new Map<string, string>();
  for (const [idx, filename] of Object.entries(mediaMap)) {
    const file = zip.file(idx);
    if (!file) continue;
    const data = await file.async("nodebuffer");
    const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_");
    writeFileSync(join(mediaDir, safe), data);
    nameToLocal.set(filename, `media/${safe}`);
  }

  const dbBytes = await zip.file("collection.anki2")?.async("uint8array");
  if (!dbBytes) throw new Error("apkg missing collection.anki2");
  await loadSqlEngine();
  const SQL = await loadSqlEngine();
  const db = new SQL.Database(dbBytes);

  const col = queryAll(db, "SELECT models, decks FROM col LIMIT 1")[0] as {
    models: string;
    decks: string;
  };
  const models = JSON.parse(col.models) as Record<
    string,
    { name: string; flds: { name: string; ord: number }[]; tmpls: { qfmt: string; afmt: string }[]; css: string }
  >;
  const model = Object.values(models)[0];
  if (!model) throw new Error("no note type");
  const fieldNames = model.flds.map((f) => f.name);
  const idx = (name: string) => fieldNames.indexOf(name);

  const notes = queryAll(db, "SELECT id, flds, tags FROM notes ORDER BY id") as Array<{
    id: number;
    flds: string;
    tags: string;
  }>;

  const cards: PreviewCard[] = [];
  const plateMap = new Map<string, PlateSummary>();

  for (const note of notes) {
    const fields = String(note.flds).split(FIELD_SEPARATOR);
    const tags = String(note.tags)
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const plateId = tags.find((t) => t.startsWith("openstax-") || !t.includes("_")) ?? tags[0] ?? "unknown";
    const labelTag = tags.find((t) => t.includes("_") || /^[A-Z]/.test(t.replaceAll("_", " ")));
    const label =
      (labelTag ? labelTag.replaceAll("_", " ") : "") ||
      stripTags(fields[idx("Extra 1")] ?? "") ||
      `note-${note.id}`;

    const rewrite = (html: string) =>
      html.replace(/src="([^"]+)"/gi, (_, src: string) => {
        const local = nameToLocal.get(src);
        return `src="${local ?? src}"`;
      });

    const qMask = fields[idx("Question Mask")] ?? "";
    const aMask = fields[idx("Answer Mask")] ?? "";
    const image = fields[idx("Image")] ?? "";
    const header = fields[idx("Header")] ?? "";
    const remarks = fields[idx("Remarks")] ?? "";
    const sources = fields[idx("Sources")] ?? "";

    const flags: string[] = [];
    if (header.trim()) flags.push("nonempty-header");
    if (remarks.trim()) flags.push("nonempty-remarks");
    if (sources.trim()) flags.push("nonempty-sources");
    if (!srcFromImg(image)) flags.push("missing-image");
    if (!srcFromImg(qMask)) flags.push("missing-qmask");
    if (!srcFromImg(aMask)) flags.push("missing-amask");

    const questionHtml = rewrite(
      `<div class="io-wrap">${image}${qMask}</div><div class="label">${escapeHtml(label)}</div>`
    );
    const answerHtml = rewrite(
      `<div class="io-wrap">${image}${aMask}</div><div class="label">${escapeHtml(label)}</div>`
    );

    cards.push({
      id: Number(note.id),
      label,
      plateId,
      tags,
      questionHtml,
      answerHtml,
      header,
      remarks,
      sources,
      flags,
    });

    const plate = plateMap.get(plateId) ?? { id: plateId, cardCount: 0, labels: [], imageFile: undefined };
    plate.cardCount += 1;
    plate.labels.push(label);
    const imgSrc = srcFromImg(image);
    if (imgSrc && nameToLocal.has(imgSrc)) plate.imageFile = nameToLocal.get(imgSrc);
    else if (imgSrc) plate.imageFile = nameToLocal.get(imgSrc.split("/").pop() ?? "") ?? plate.imageFile;
    // image field is <img src="openstax-....jpg">
    const rawName = srcFromImg(fields[idx("Image")] ?? "");
    if (rawName && nameToLocal.has(rawName)) plate.imageFile = nameToLocal.get(rawName);
    plateMap.set(plateId, plate);
  }
  db.close();

  // Fix plate images using media filenames
  for (const plate of plateMap.values()) {
    if (plate.imageFile) continue;
    for (const [name, local] of nameToLocal) {
      if (name.startsWith(plate.id) || name.includes(plate.id.replace("openstax-", ""))) {
        plate.imageFile = local;
        break;
      }
    }
  }

  const plates = [...plateMap.values()].sort((a, b) => a.id.localeCompare(b.id));
  const flagged = cards.filter((c) => c.flags.length);
  const labelCounts = new Map<string, number>();
  for (const c of cards) labelCounts.set(c.label, (labelCounts.get(c.label) ?? 0) + 1);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Deck preview — ${escapeHtml(basename(apkgPath))}</title>
<style>
  :root { color-scheme: light dark; --bg:#0f1115; --panel:#171a21; --text:#e8eaed; --muted:#9aa0a6; --line:#2a2f3a; --accent:#7aa2ff; --bad:#ff7b72; --ok:#3fb950; }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f6f7f9; --panel:#fff; --text:#1f2328; --muted:#656d76; --line:#d0d7de; --accent:#0969da; --bad:#cf222e; --ok:#1a7f37; }
  }
  * { box-sizing: border-box; }
  body { margin:0; font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background:var(--bg); color:var(--text); }
  header { padding:20px 24px; border-bottom:1px solid var(--line); position:sticky; top:0; background:color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(8px); z-index:5; }
  h1 { margin:0 0 6px; font-size:20px; font-weight:650; }
  .meta { color:var(--muted); display:flex; flex-wrap:wrap; gap:12px; }
  .meta b { color:var(--text); font-weight:600; }
  main { display:grid; grid-template-columns: 280px 1fr; min-height: calc(100vh - 74px); }
  aside { border-right:1px solid var(--line); padding:16px; overflow:auto; max-height: calc(100vh - 74px); position:sticky; top:74px; }
  section { padding:16px 20px 40px; }
  .stat { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:10px 12px; margin-bottom:10px; }
  .stat .k { color:var(--muted); font-size:12px; }
  .stat .v { font-size:18px; font-weight:650; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid var(--line); font-size:12px; color:var(--muted); margin:2px 4px 2px 0; }
  .pill.bad { border-color: color-mix(in srgb, var(--bad) 50%, var(--line)); color:var(--bad); }
  .pill.ok { border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); color:var(--ok); }
  .filters { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0 16px; }
  button, select { background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 10px; cursor:pointer; }
  button.active { border-color:var(--accent); color:var(--accent); }
  .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:14px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; cursor:pointer; }
  .card:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
  .card .stage { position:relative; background:#111; aspect-ratio: 4/3; display:grid; place-items:center; overflow:hidden; }
  .card .stage .io-wrap { position:relative; width:100%; height:100%; }
  .card .stage img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
  .card .foot { padding:10px 12px; border-top:1px solid var(--line); }
  .card .foot .name { font-weight:600; }
  .card .foot .sub { color:var(--muted); font-size:12px; margin-top:2px; }
  .modal { position:fixed; inset:0; background:rgba(0,0,0,.55); display:none; place-items:center; padding:24px; z-index:20; }
  .modal.open { display:grid; }
  .modal .box { width:min(960px, 100%); max-height:90vh; overflow:auto; background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:16px; }
  .modal .pair { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .modal .pane { border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .modal .pane h3 { margin:0; padding:8px 10px; font-size:13px; color:var(--muted); border-bottom:1px solid var(--line); }
  .modal .pane .stage { position:relative; background:#111; min-height:280px; }
  .modal .pane .stage .io-wrap { position:relative; width:100%; min-height:280px; }
  .modal .pane img { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
  .io-wrap { position:relative; }
  .label { display:none; }
  .plate-row { margin-bottom:18px; }
  .plate-row h2 { font-size:15px; margin:0 0 8px; }
  .hidden { display:none !important; }
</style>
</head>
<body>
<header>
  <h1>Deck quality preview</h1>
  <div class="meta">
    <span><b>${cards.length}</b> cards</span>
    <span><b>${plates.length}</b> plates</span>
    <span><b>${flagged.length}</b> flagged</span>
    <span>${escapeHtml(basename(apkgPath))}</span>
  </div>
</header>
<main>
  <aside>
    <div class="stat"><div class="k">Cards</div><div class="v">${cards.length}</div></div>
    <div class="stat"><div class="k">Plates</div><div class="v">${plates.length}</div></div>
    <div class="stat"><div class="k">Flagged fields</div><div class="v">${flagged.length}</div></div>
    <div class="stat"><div class="k">Unique labels</div><div class="v">${labelCounts.size}</div></div>
    <h3 style="margin:16px 0 8px;font-size:13px;color:var(--muted)">Plates</h3>
    ${plates
      .map(
        (p) =>
          `<button class="plate-filter" data-plate="${escapeHtml(p.id)}" style="display:block;width:100%;text-align:left;margin-bottom:6px">${escapeHtml(p.id)} <span class="pill">${p.cardCount}</span></button>`
      )
      .join("")}
    <button class="plate-filter active" data-plate="" style="display:block;width:100%;text-align:left;margin-top:8px">All plates</button>
  </aside>
  <section>
    <div class="filters">
      <button class="mode active" data-mode="question">Question</button>
      <button class="mode" data-mode="answer">Answer</button>
      <button id="flaggedOnly">Flagged only</button>
      <input id="search" placeholder="Filter label…" style="flex:1;min-width:160px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;color:var(--text)"/>
    </div>
    <div class="grid" id="grid"></div>
  </section>
</main>
<div class="modal" id="modal"><div class="box" id="modalBox"></div></div>
<script>
const CARDS = ${JSON.stringify(cards)};
let mode = 'question';
let plate = '';
let flaggedOnly = false;
let q = '';
const grid = document.getElementById('grid');
const modal = document.getElementById('modal');

function render() {
  const list = CARDS.filter(c => {
    if (plate && c.plateId !== plate) return false;
    if (flaggedOnly && !c.flags.length) return false;
    if (q && !c.label.toLowerCase().includes(q) && !c.plateId.toLowerCase().includes(q)) return false;
    return true;
  });
  grid.innerHTML = list.map(c => {
    const html = mode === 'question' ? c.questionHtml : c.answerHtml;
    const flags = c.flags.map(f => '<span class="pill bad">'+f+'</span>').join('') || '<span class="pill ok">clean</span>';
    return '<article class="card" data-id="'+c.id+'"><div class="stage">'+html+'</div><div class="foot"><div class="name">'+escape(c.label)+'</div><div class="sub">'+escape(c.plateId)+'</div><div style="margin-top:6px">'+flags+'</div></div></article>';
  }).join('');
}

function escape(s){return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

grid.addEventListener('click', e => {
  const card = e.target.closest('.card');
  if (!card) return;
  const c = CARDS.find(x => String(x.id) === card.dataset.id);
  if (!c) return;
  document.getElementById('modalBox').innerHTML = '<h2 style="margin:0 0 12px">'+escape(c.label)+'</h2><div class="pair"><div class="pane"><h3>Question</h3><div class="stage">'+c.questionHtml+'</div></div><div class="pane"><h3>Answer</h3><div class="stage">'+c.answerHtml+'</div></div></div><p style="color:var(--muted);margin-top:12px">Plate: '+escape(c.plateId)+' · tags: '+escape(c.tags.join(' '))+'</p>';
  modal.classList.add('open');
});
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

document.querySelectorAll('.mode').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.mode').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  mode = btn.dataset.mode;
  render();
}));
document.querySelectorAll('.plate-filter').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.plate-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  plate = btn.dataset.plate || '';
  render();
}));
document.getElementById('flaggedOnly').addEventListener('click', (e) => {
  flaggedOnly = !flaggedOnly;
  e.currentTarget.classList.toggle('active', flaggedOnly);
  render();
});
document.getElementById('search').addEventListener('input', (e) => {
  q = e.target.value.trim().toLowerCase();
  render();
});
render();
</script>
</body>
</html>`;

  mkdirSync(outDir, { recursive: true });
  const indexPath = join(outDir, "index.html");
  writeFileSync(indexPath, html);
  writeFileSync(
    join(outDir, "summary.json"),
    JSON.stringify(
      {
        apkg: apkgPath,
        cards: cards.length,
        plates: plates.length,
        flagged: flagged.length,
        uniqueLabels: labelCounts.size,
        labelCounts: Object.fromEntries([...labelCounts.entries()].sort((a, b) => b[1] - a[1])),
        plates: plates.map((p) => ({ id: p.id, cards: p.cardCount, labels: p.labels })),
        flaggedCards: flagged.map((c) => ({ id: c.id, label: c.label, flags: c.flags })),
      },
      null,
      2
    )
  );
  return { outDir, cards: cards.length, plates: plates.length, indexPath };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]!);
}
