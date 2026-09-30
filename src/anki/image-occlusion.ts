import { guessMime } from "./mime.js";
import type { MediaFile, NoteType } from "./types.js";

export const IMAGE_OCCLUSION_TYPE_NAME = "Image Occlusion Enhanced";
export const HIDDEN_IMAGE_LABEL = "Hidden image";
export const HIDDEN_IMAGE_SENTINEL = -1;

export const IO_QUESTION_FILL = "#FF7E7E";
export const IO_MASK_FILL = "#FFEBA2";
export const IO_STROKE = "#2D2D2D";

export interface OcclusionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional study label from AI propose — display only, not stored in Anki fields. */
  label?: string;
}

export interface OcclusionBuildInput {
  image: Uint8Array;
  imageFilename: string;
  boxes: OcclusionBox[];
  header?: string;
  footer?: string;
  remarks?: string;
  sources?: string;
  width: number;
  height: number;
  stem?: string;
}

export interface OcclusionArtifacts {
  notes: Record<string, string>[];
  media: MediaFile[];
  stem: string;
}

const IO_CSS = `.card {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}

#io-overlay {
  position: absolute;
  top: 0;
  width: 100%;
  z-index: 3;
}

#io-original {
  position: relative;
  top: 0;
  width: 100%;
  z-index: 2;
  visibility: hidden;
}

#io-wrapper {
  position: relative;
  width: 100%;
}

#io-header {
  font-size: 1.1em;
  margin-bottom: 0.2em;
}

#io-footer {
  max-width: 80%;
  margin-left: auto;
  margin-right: auto;
  margin-top: 0.8em;
  font-style: italic;
}

#io-extra-wrapper {
  width: 80%;
  margin-left: auto;
  margin-right: auto;
  margin-top: 0.5em;
}

#io-extra {
  text-align: center;
  display: inline-block;
}

.io-extra-entry {
  margin-top: 0.8em;
  font-size: 0.9em;
  text-align: left;
}

.io-field-descr {
  margin-bottom: 0.2em;
  font-weight: bold;
}

#io-revl-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 36px;
  height: 36px;
  padding: 0;
  font-size: 0;
  line-height: 0;
}
`;

const IO_QFMT = `{{#Image}}
<div id="io-header">{{Header}}</div>
<div id="io-wrapper">
  <div id="io-overlay">{{Question Mask}}</div>
  <div id="io-original">{{Image}}</div>
</div>
<div id="io-footer">{{Footer}}</div>

<script>
// Prevent original image from loading before mask
aFade = 50, qFade = 0;
var mask = document.querySelector('#io-overlay>img');
function loaded() {
    var original = document.querySelector('#io-original');
    original.style.visibility = "visible";
}
if (mask === null || mask.complete) {
    loaded();
} else {
    mask.addEventListener('load', loaded);
}
</script>
{{/Image}}
`;

const IO_AFMT = `{{#Image}}
<div id="io-header">{{Header}}</div>
<div id="io-wrapper">
  <div id="io-overlay">{{Answer Mask}}</div>
  <div id="io-original">{{Image}}</div>
</div>
{{#Footer}}<div id="io-footer">{{Footer}}</div>{{/Footer}}
<button id="io-revl-btn" type="button" onclick="toggle();" aria-label="Toggle masks" title="Toggle masks"></button>
<div id="io-extra-wrapper">
  <div id="io-extra">
    {{#Remarks}}
      <div class="io-extra-entry">
        <div class="io-field-descr">Remarks</div>{{Remarks}}
      </div>
    {{/Remarks}}
    {{#Sources}}
      <div class="io-extra-entry">
        <div class="io-field-descr">Sources</div>{{Sources}}
      </div>
    {{/Sources}}
    {{#Extra 1}}
      <div class="io-extra-entry">
        <div class="io-field-descr">Extra 1</div>{{Extra 1}}
      </div>
    {{/Extra 1}}
    {{#Extra 2}}
      <div class="io-extra-entry">
        <div class="io-field-descr">Extra 2</div>{{Extra 2}}
      </div>
    {{/Extra 2}}
  </div>
</div>

<script>
// Toggle answer mask on clicking the image
var toggle = function() {
  var amask = document.getElementById('io-overlay');
  if (amask.style.display === 'block' || amask.style.display === '')
    amask.style.display = 'none';
  else
    amask.style.display = 'block'
}

// Prevent original image from loading before mask
aFade = 50, qFade = 0;
var mask = document.querySelector('#io-overlay>img');
function loaded() {
    var original = document.querySelector('#io-original');
    original.style.visibility = "visible";
}
if (mask === null || mask.complete) {
    loaded();
} else {
    mask.addEventListener('load', loaded);
}
</script>
{{/Image}}
`;

export function imageOcclusionNoteType(id = Date.now()): NoteType {
  return {
    id,
    name: IMAGE_OCCLUSION_TYPE_NAME,
    kind: "standard",
    css: IO_CSS,
    fields: [
      { name: "ID (hidden)", ord: 0 },
      { name: "Header", ord: 1 },
      { name: "Image", ord: 2 },
      { name: "Question Mask", ord: 3 },
      { name: "Footer", ord: 4 },
      { name: "Remarks", ord: 5 },
      { name: "Sources", ord: 6 },
      { name: "Extra 1", ord: 7 },
      { name: "Extra 2", ord: 8 },
      { name: "Answer Mask", ord: 9 },
      { name: "Original Mask", ord: 10 },
    ],
    templates: [
      {
        name: "IO Card",
        ord: 0,
        qfmt: IO_QFMT,
        afmt: IO_AFMT,
      },
    ],
  };
}

export function occlusionStem(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function sanitizeImageFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "image.jpg";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned || "image.jpg";
}

/** Unique deck media name so two "diagram.png" uploads cannot overwrite each other. */
export function uniqueImageFilename(filename: string): string {
  const sanitized = sanitizeImageFilename(filename);
  const dot = sanitized.lastIndexOf(".");
  const ext = (dot >= 0 ? sanitized.slice(dot + 1) : "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${crypto.randomUUID().replace(/-/g, "")}.${ext}`;
}

function imgTag(filename: string): string {
  return `<img src="${filename}">`;
}

function fmt(n: number): string {
  return Number(n.toFixed(4)).toString();
}

function rectAttrs(box: OcclusionBox): string {
  return `x="${fmt(box.x)}" y="${fmt(box.y)}" width="${fmt(box.width)}" height="${fmt(box.height)}" stroke="${IO_STROKE}"`;
}

function maskSvg(
  width: number,
  height: number,
  boxes: OcclusionBox[],
  stem: string,
  mode: "original" | "question" | "answer",
  activeIndex: number
): string {
  const rects: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    const n = i + 1;
    const id = `${stem}-ao-${n}`;
    const box = boxes[i]!;
    if (mode === "answer" && i === activeIndex) continue;
    if (mode === "question" && i === activeIndex) {
      rects.push(`   <rect id="${id}" ${rectAttrs(box)} fill="${IO_QUESTION_FILL}" class="qshape"/>`);
    } else {
      rects.push(`   <rect id="${id}" ${rectAttrs(box)} fill="${IO_MASK_FILL}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
 <!-- Created with Image Occlusion Enhanced -->
 <g><title>Labels</title></g>
 <g><title>Masks</title>
${rects.join("\n")}
 </g>
</svg>
`;
}

function encodeSvg(svg: string): Uint8Array {
  return new TextEncoder().encode(svg);
}

export function buildOcclusionArtifacts(input: OcclusionBuildInput): OcclusionArtifacts {
  const stem = input.stem ?? occlusionStem();
  const imageFilename = sanitizeImageFilename(input.imageFilename);
  const header = input.header ?? "";
  const footer = input.footer ?? "";
  const remarks = input.remarks ?? "";
  const sources = input.sources ?? "";
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));

  if (input.boxes.length === 0) {
    return { notes: [], media: [], stem };
  }

  const media: MediaFile[] = [
    {
      filename: imageFilename,
      mime: guessMime(imageFilename, input.image),
      data: input.image,
    },
    {
      filename: `${stem}-ao-O.svg`,
      mime: "image/svg+xml",
      data: encodeSvg(maskSvg(width, height, input.boxes, stem, "original", -1)),
    },
  ];

  const notes = input.boxes.map((_, index) => {
    const n = index + 1;
    const qName = `${stem}-ao-${n}-Q.svg`;
    const aName = `${stem}-ao-${n}-A.svg`;
    media.push(
      {
        filename: qName,
        mime: "image/svg+xml",
        data: encodeSvg(maskSvg(width, height, input.boxes, stem, "question", index)),
      },
      {
        filename: aName,
        mime: "image/svg+xml",
        data: encodeSvg(maskSvg(width, height, input.boxes, stem, "answer", index)),
      }
    );
    return {
      "ID (hidden)": `${stem}-ao-${n}`,
      Header: header,
      Image: imgTag(imageFilename),
      "Question Mask": imgTag(qName),
      Footer: footer,
      Remarks: remarks,
      Sources: sources,
      "Extra 1": "",
      "Extra 2": "",
      "Answer Mask": imgTag(aName),
      "Original Mask": imgTag(`${stem}-ao-O.svg`),
    };
  });

  return { notes, media, stem };
}

export function fieldsFromMap(noteType: NoteType, map: Record<string, string>): string[] {
  return noteType.fields.map((field) => map[field.name] ?? "");
}
