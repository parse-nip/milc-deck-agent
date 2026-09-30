export type NoteTypeKind = "standard" | "cloze";

export interface NoteField {
  name: string;
  ord: number;
}

export interface CardTemplate {
  name: string;
  ord: number;
  qfmt: string;
  afmt: string;
}

export interface NoteType {
  id: number;
  name: string;
  kind: NoteTypeKind;
  css: string;
  fields: NoteField[];
  templates: CardTemplate[];
}

export interface Deck {
  id: number;
  name: string;
  desc: string;
}

export interface Note {
  id: number;
  guid: string;
  noteTypeId: number;
  fields: string[];
  tags: string[];
}

export interface Card {
  id: number;
  noteId: number;
  deckId: number;
  ord: number;
  type: number;
  queue: number;
  due: number;
  interval: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  odue: number;
  odid: number;
  flags: number;
}

export interface MediaFile {
  filename: string;
  data: Uint8Array;
  mime: string;
}

export interface ParsedPackage {
  format: "legacy1";
  schemaVersion: number;
  collectionCrt: number;
  decks: Deck[];
  noteTypes: NoteType[];
  notes: Note[];
  cards: Card[];
  media: MediaFile[];
}

export const FIELD_SEPARATOR = "\x1f";
