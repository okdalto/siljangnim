// The catalog: metadata about open-source tools worth reaching for (no code).
// The agent searches it before picking a library; recipes record what then
// worked (docs/catalog.md). Bundled, so it works without the hub and on the web.
import { z } from "zod";
import data from "./catalog.json";

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
  install: z.object({ cdn: z.string().url().optional(), pip: z.array(z.string()).optional(), program: z.string().optional() }),
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
