// How the controls panel arranges uniforms (pure, for the panel and tests).
import type { Scene } from "../scene/schema";

/** Declared groups first, then any uniforms they don't mention. */
export function controlSections(scene: Pick<Scene, "uniforms" | "controls">): Array<{ label: string | null; names: string[] }> {
  const listed = new Set<string>();
  const sections: Array<{ label: string | null; names: string[] }> = [];
  for (const group of scene.controls ?? []) {
    const names: string[] = [];
    for (const n of group.uniforms) {
      if (!scene.uniforms[n] || listed.has(n)) continue;
      listed.add(n);
      names.push(n);
    }
    if (names.length) sections.push({ label: group.label, names });
  }
  const rest = Object.keys(scene.uniforms).filter((n) => !listed.has(n));
  if (rest.length) sections.push({ label: sections.length ? "Other" : null, names: rest });
  return sections;
}
