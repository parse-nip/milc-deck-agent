import { readFileSync } from "node:fs";
import { labelsFromManifest, loadManifest, type DeckManifest } from "./pack.js";

export function normalizeTerm(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function missingTerms(manifest: DeckManifest, required: string[]): {
  required: number;
  found: number;
  missing: string[];
  present: string[];
} {
  const have = new Set(labelsFromManifest(manifest).map(normalizeTerm));
  const present: string[] = [];
  const missing: string[] = [];
  for (const term of required) {
    const n = normalizeTerm(term);
    if (!n) continue;
    if ([...have].some((h) => h === n || h.includes(n) || n.includes(h))) present.push(term);
    else missing.push(term);
  }
  return { required: required.filter(Boolean).length, found: present.length, missing, present };
}

export function readTermsFile(path: string): string[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export function missingFromPaths(manifestPath: string, termsPath: string) {
  return missingTerms(loadManifest(manifestPath), readTermsFile(termsPath));
}
