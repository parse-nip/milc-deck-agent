import { readFileSync } from "node:fs";
import { join } from "node:path";

export type CatalogPlate = {
  id: string;
  topics: string[];
  view: string;
  title: string;
  commonsTitle?: string;
  url: string;
  license: string;
  credit: string;
};

type CatalogFile = { version: number; plates: CatalogPlate[] };

export function loadCatalog(root = process.cwd()): CatalogPlate[] {
  const raw = JSON.parse(readFileSync(join(root, "catalog/plates.json"), "utf8")) as CatalogFile;
  return raw.plates;
}

export function catalogSearch(topic: string, root = process.cwd()): CatalogPlate[] {
  const needle = topic.trim().toLowerCase();
  if (!needle) return [];
  return loadCatalog(root).filter((plate) => {
    if (plate.topics.some((t) => t.includes(needle) || needle.includes(t))) return true;
    if (plate.title.toLowerCase().includes(needle)) return true;
    if (plate.view.toLowerCase().includes(needle)) return true;
    return false;
  });
}
