import JSZip from "jszip";
import { FIELD_SEPARATOR, type ParsedPackage } from "./types.js";

function nowMs(): number {
  return Date.now();
}

export async function exportApkg(pkg: ParsedPackage): Promise<Blob> {
  const zip = new JSZip();
  const db = await buildLegacySqlite(pkg);
  zip.file("collection.anki2", db);
  const mediaMap: Record<string, string> = {};
  pkg.media.forEach((file, i) => {
    mediaMap[String(i)] = file.filename;
    zip.file(String(i), file.data);
  });
  zip.file("media", JSON.stringify(mediaMap));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

async function buildLegacySqlite(pkg: ParsedPackage): Promise<Uint8Array> {
  const { openEmptySqlite } = await import("./sqlite");
  const db = await openEmptySqlite();
  db.run(`
    CREATE TABLE col (
      id integer PRIMARY KEY, crt integer NOT NULL, mod integer NOT NULL,
      scm integer NOT NULL, ver integer NOT NULL, dty integer NOT NULL,
      usn integer NOT NULL, ls integer NOT NULL, conf text NOT NULL,
      models text NOT NULL, decks text NOT NULL, dconf text NOT NULL, tags text NOT NULL
    );
    CREATE TABLE notes (
      id integer PRIMARY KEY, guid text NOT NULL, mid integer NOT NULL,
      mod integer NOT NULL, usn integer NOT NULL, tags text NOT NULL,
      flds text NOT NULL, sfld integer NOT NULL, csum integer NOT NULL,
      flags integer NOT NULL, data text NOT NULL
    );
    CREATE TABLE cards (
      id integer PRIMARY KEY, nid integer NOT NULL, did integer NOT NULL,
      ord integer NOT NULL, mod integer NOT NULL, usn integer NOT NULL,
      type integer NOT NULL, queue integer NOT NULL, due integer NOT NULL,
      ivl integer NOT NULL, factor integer NOT NULL, reps integer NOT NULL,
      lapses integer NOT NULL, left integer NOT NULL, odue integer NOT NULL,
      odid integer NOT NULL, flags integer NOT NULL, data text NOT NULL
    );
    CREATE TABLE revlog (
      id integer PRIMARY KEY, cid integer NOT NULL, usn integer NOT NULL,
      ease integer NOT NULL, ivl integer NOT NULL, lastIvl integer NOT NULL,
      factor integer NOT NULL, time integer NOT NULL, type integer NOT NULL
    );
    CREATE TABLE graves (
      usn integer NOT NULL, oid integer NOT NULL, type integer NOT NULL
    );
  `);

  const models: Record<string, unknown> = {};
  for (const nt of pkg.noteTypes) {
    models[String(nt.id)] = {
      id: nt.id,
      name: nt.name,
      type: nt.kind === "cloze" ? 1 : 0,
      mod: 0,
      usn: 0,
      sortf: 0,
      did: null,
      tmpls: nt.templates.map((t) => ({
        name: t.name,
        ord: t.ord,
        qfmt: t.qfmt,
        afmt: t.afmt,
        bqfmt: "",
        bafmt: "",
        did: null,
        bfont: "",
        bsize: 0,
      })),
      flds: nt.fields.map((f) => ({
        name: f.name,
        ord: f.ord,
        sticky: false,
        rtl: false,
        font: "Arial",
        size: 20,
        description: "",
      })),
      css: nt.css,
    };
  }

  const decks: Record<string, unknown> = {};
  for (const d of pkg.decks) {
    decks[String(d.id)] = {
      id: d.id,
      name: d.name.replaceAll("::", "\x1f"),
      desc: d.desc,
      usn: 0,
      mod: 0,
      collapsed: false,
      browserCollapsed: false,
      dyn: 0,
      conf: 1,
      extendNew: 0,
      extendRev: 0,
      lrnToday: [0, 0],
      revToday: [0, 0],
      newToday: [0, 0],
      timeToday: [0, 0],
    };
  }

  const conf = JSON.stringify({
    nextPos: 1,
    estTimes: true,
    activeDecks: [1],
    sortType: "noteFld",
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: 1,
    newSpread: 0,
    dueCounts: true,
    curModel: pkg.noteTypes[0]?.id ?? 1,
    collapseTime: 1200,
  });

  const dconf = JSON.stringify({
    "1": {
      id: 1,
      name: "Default",
      new: { delays: [1, 10], ints: [1, 4, 0], initialFactor: 2500, perDay: 20, order: 1, bury: false },
      rev: { perDay: 200, ease4: 1.3, ivlFct: 1, maxIvl: 36500, bury: false, hardFactor: 1.2 },
      lapse: { delays: [10], mult: 0, minInt: 1, leechFails: 8, leechAction: 1 },
      maxTaken: 60,
      timer: 0,
      autoplay: true,
      replayq: true,
      mod: 0,
      usn: 0,
    },
  });

  const t = nowMs();
  db.run(
    "INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      1,
      pkg.collectionCrt,
      t,
      t,
      11,
      0,
      0,
      0,
      conf,
      JSON.stringify(models),
      JSON.stringify(decks),
      dconf,
      "{}",
    ]
  );

  const insNote = db.prepare(
    "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  );
  for (const n of pkg.notes) {
    insNote.run([
      n.id,
      n.guid,
      n.noteTypeId,
      Math.floor(t / 1000),
      0,
      n.tags.length ? ` ${n.tags.join(" ")} ` : "",
      n.fields.join(FIELD_SEPARATOR),
      n.fields[0] ?? "",
      0,
      0,
      "",
    ]);
  }
  insNote.free();

  const insCard = db.prepare(
    "INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  for (const c of pkg.cards) {
    insCard.run([
      c.id,
      c.noteId,
      c.deckId,
      c.ord,
      Math.floor(t / 1000),
      0,
      c.type,
      c.queue,
      c.due,
      c.interval,
      c.factor,
      c.reps,
      c.lapses,
      c.left,
      c.odue,
      c.odid,
      c.flags,
      "",
    ]);
  }
  insCard.free();

  const exported = db.export();
  db.close();
  return exported;
}
