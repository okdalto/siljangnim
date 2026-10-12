// Builds src/catalog/index-opensource.json from the data behind https://indexopensource.com/index
// (index.opensource, by 현 @hyun2xyz): the reference list of open-source projects the catalog
// starts from. Only facts and classification labels are kept (name, repository, license,
// principle, output medium, key concept, field, input, keywords, index code), never the
// site's own descriptions. index.json carries the Korean labels for the same columns, kept as `ko`. Usage:
//   curl -o en.json https://indexopensource.com/data/en.json
//   curl -o index.json https://indexopensource.com/data/index.json   (issue date, Korean labels)
//   node scripts/import-index-opensource.mjs en.json index.json
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [source, indexFile] = process.argv.slice(2);
if (!source) {
  console.error("usage: import-index-opensource.mjs <en.json>");
  process.exit(2);
}
const data = JSON.parse(readFileSync(source, "utf8"));
const index = indexFile ? JSON.parse(readFileSync(indexFile, "utf8")) : null;
const meta = index?.meta ?? null;
// Same column order as en.json, keyed by index code.
const korean = new Map((index?.rows ?? []).filter((r) => r.kind === "project").map((r) => [r.id, r]));
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const seen = new Set();
const entries = Object.values(data.projects).map((p) => {
  const [no, name, principle, medium, concept, , area, , repo, license, code, input] = p.values;
  let id = slug(name) || `index-${no}`;
  while (seen.has(id)) id = `${id}-${no}`;
  seen.add(id);
  const github = /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://github.com/${repo}` : null;
  return {
    id,
    name,
    repo: github,
    license: license || null,
    principle,
    medium,
    concept,
    area,
    input,
    keywords: String(p.keywords ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    index: { no: Number(no), code },
    ...koreanLabels(korean.get(code)),
  };
});
function koreanLabels(row) {
  if (!row) return {};
  const [, , principle, medium, concept, , area, , , , , input] = row.values;
  const keywords = String(row.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  return { ko: { principle, medium, concept, area, input, keywords } };
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "catalog", "index-opensource.json");
writeFileSync(
  out,
  JSON.stringify(
    {
      source: "index.opensource by 현 @hyun2xyz — https://indexopensource.com/index",
      issued: meta?.issued ?? null,
      count: meta?.count ?? null,
      note: "Facts and classification labels only; see the site for its descriptions.",
      entries,
    },
    null,
    1,
  ) + "\n",
);
console.log(`[import-index-opensource] ${entries.length} projects → ${out}`);
