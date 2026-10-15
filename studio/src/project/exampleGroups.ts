import { CATALOG } from "../catalog/catalog";

interface Groupable { slug: string; uses?: string[] }
export interface ExampleGroup<T> { id: string; label: string; items: T[]; folder: boolean }

// Explicit families, not repository owners: sharing an author or using GLSL
// does not make two unrelated projects one library. Add-ons remain identified
// by their own tool names on the cards inside these folders.
const FAMILIES = [
  { id: "d3", label: "D3", tools: ["d3-delaunay", "d3-contour", "d3-scale-chromatic", "d3-force", "d3-hexbin", "d3-shape", "d3-polygon", "d3-random", "d3-color", "d3-interpolate", "d3-ease", "d3-hierarchy", "d3-sankey", "d3-chord", "d3-quadtree", "d3-geo", "d3-geo-projection", "d3-tricontour", "d3-geo-voronoi", "d3-voronoi-treemap", "d3-cloud"] },
  { id: "three", label: "Three.js", tools: ["three-js", "three-mesh-bvh", "three-js-pathtracing-renderer", "react-three-fiber"] },
  { id: "p5", label: "p5.js", tools: ["p5-js", "p5-hershey-js", "p5-brush"] },
  { id: "ngraph", label: "ngraph", tools: ["ngraph", "ngraph-forcelayout", "ngraph-path"] },
];

export function exampleFamily(example: Groupable): { id: string; label: string } | undefined {
  const ids = [...new Set(example.uses ?? [])];
  if (!ids.length) return undefined;
  const family = FAMILIES.find((f) => ids.every((id) => f.tools.includes(id)));
  if (family) return { id: family.id, label: family.label };
  if (ids.length !== 1) return undefined; // A remix must not be filed under an arbitrary ingredient.
  const tool = CATALOG.find((c) => c.id === ids[0]);
  if (!tool) return undefined;
  return { id: tool.repo.toLowerCase().replace(/\.git\/?$/, "").replace(/\/+$/, ""), label: tool.name };
}

/** Keep source order, and show lone examples directly instead of one-item folders. */
export function groupExamples<T>(items: T[], example: (item: T) => Groupable): ExampleGroup<T>[] {
  const groups = new Map<string, ExampleGroup<T>>();
  for (const item of items) {
    const e = example(item), family = exampleFamily(e);
    const id = family ? `library:${family.id}` : `example:${e.slug}`;
    const group = groups.get(id);
    if (group) { group.items.push(item); group.folder = true; }
    else groups.set(id, { id, label: family?.label ?? "", items: [item], folder: false });
  }
  return [...groups.values()];
}
