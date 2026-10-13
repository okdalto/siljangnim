// The catalog: metadata about open-source tools worth reaching for (no code).
// The agent searches it before picking a library; recipes record what then
// worked. Bundled, so it works without the hub and on the web.
import { z } from "zod";
import data from "./catalog.json";
import referenceData from "./index-opensource.json";

export const CatalogEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  name: z.string(),
  repo: z.string().url(),
  license: z.string(),
  /** B: JS in the scene; C: Python package; D: native program; E: GPU/large model. */
  tier: z.enum(["B", "C", "D", "E"]),
  purpose: z.string(),
  tags: z.array(z.string()),
  media: z.object({ in: z.array(z.string()), out: z.array(z.string()) }),
  install: z.object({ cdn: z.string().url().optional(), pip: z.array(z.string()).optional(), program: z.string().optional(), bundled: z.boolean().optional() }),
  weights_license: z.string().optional(),
  gpu: z.string().optional(),
  notes: z.string().optional(),
});

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;

export const CATALOG: CatalogEntry[] = z.object({ entries: z.array(CatalogEntrySchema) }).parse(data).entries;

/** Entries matching every word (name, tags, purpose, media), best first. */
export function searchCatalog(query: string, filters: { media?: string; tier?: CatalogEntry["tier"] } = {}, catalog = CATALOG): CatalogEntry[] {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const scored = catalog.flatMap((e) => {
    if (filters.tier && e.tier !== filters.tier) return [];
    if (filters.media && ![...e.media.in, ...e.media.out].includes(filters.media)) return [];
    const name = `${e.id} ${e.name}`.toLowerCase();
    const tags = e.tags.join(" ").toLowerCase();
    const rest = `${e.purpose} ${e.media.in.join(" ")} ${e.media.out.join(" ")}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (name.includes(w)) score += 3;
      else if (tags.includes(w)) score += 2;
      else if (rest.includes(w)) score += 1;
      else return [];
    }
    return [{ e, score }];
  });
  // Lighter tiers first on a tie: a browser library beats a Python install.
  return scored.sort((a, b) => b.score - a.score || a.e.tier.localeCompare(b.e.tier)).map((s) => s.e);
}

/**
 * The reference list the catalog grows from: index.opensource (by 현 @hyun2xyz,
 * https://indexopensource.com/index), facts and classification labels only.
 * These aren't set up in Siljangnim yet; curated entries above are.
 */
export const ReferenceEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  repo: z.string().url().nullable(),
  license: z.string().nullable(),
  principle: z.string(),
  medium: z.string(),
  concept: z.string(),
  area: z.string(),
  input: z.string(),
  keywords: z.array(z.string()),
  index: z.object({ no: z.number(), code: z.string() }),
  /** The same labels in Korean, from the list's Korean edition. */
  ko: z
    .object({ principle: z.string(), medium: z.string(), concept: z.string(), area: z.string(), input: z.string(), keywords: z.array(z.string()) })
    .optional(),
});

export type ReferenceEntry = z.infer<typeof ReferenceEntrySchema>;

export const REFERENCE_SOURCE = "index.opensource by 현 @hyun2xyz (https://indexopensource.com/index)";

const repoKey = (url: string | null | undefined) => url?.toLowerCase().replace(/\/+$/, "") ?? "";
const curatedRepos = new Set(CATALOG.map((e) => repoKey(e.repo)));

/** An entry's labels in one language (English when it has no Korean). */
export function referenceLabels(e: ReferenceEntry, korean: boolean): Pick<ReferenceEntry, "principle" | "medium" | "concept" | "area" | "input" | "keywords"> {
  return korean && e.ko ? e.ko : e;
}

/** Reference entries not already curated (same repository). */
export const REFERENCES: ReferenceEntry[] = z
  .object({ entries: z.array(ReferenceEntrySchema) })
  .parse(referenceData)
  .entries.filter((e) => !curatedRepos.has(repoKey(e.repo)));

/** The index.opensource entry for a curated tool, when the list has it. */
export function referenceFor(entry: CatalogEntry): ReferenceEntry | undefined {
  return z.object({ entries: z.array(ReferenceEntrySchema) }).parse(referenceData).entries.find((r) => repoKey(r.repo) === repoKey(entry.repo));
}

/** Reference entries matching every word (name, keywords, concept, field, medium, input), best first. */
export function searchReferences(query: string, references = REFERENCES): ReferenceEntry[] {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const scored = references.flatMap((e) => {
    const name = e.name.toLowerCase();
    const tags = `${e.keywords.join(" ")} ${e.concept} ${e.ko?.keywords.join(" ") ?? ""} ${e.ko?.concept ?? ""}`.toLowerCase();
    const rest = `${e.principle} ${e.medium} ${e.area} ${e.input} ${e.ko ? `${e.ko.principle} ${e.ko.medium} ${e.ko.area} ${e.ko.input}` : ""}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (name.includes(w)) score += 3;
      else if (tags.includes(w)) score += 2;
      else if (rest.includes(w)) score += 1;
      else return [];
    }
    return [{ e, score }];
  });
  return scored.sort((a, b) => b.score - a.score || a.e.index.no - b.e.index.no).map((s) => s.e);
}

