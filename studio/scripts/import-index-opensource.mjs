// Builds src/catalog/index-opensource.json from the data behind https://indexopensource.com/index
// (index.opensource, by 현 @hyun2xyz): the reference list of open-source projects the catalog
// starts from. Only facts and classification labels are kept (name, repository, license,
// principle, output medium, key concept, field, input, keywords, index code), never the
// site's own descriptions. Usage:
//   curl -o en.json https://indexopensource.com/data/en.json
//   curl -o index.json https://indexopensource.com/data/index.json   (for the issue date)
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
const meta = indexFile ? JSON.parse(readFileSync(indexFile, "utf8")).meta : null;
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
  };
});
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
