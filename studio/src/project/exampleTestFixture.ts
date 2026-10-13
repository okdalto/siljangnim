import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";
import { EXAMPLES } from "./examples";

/** Exercise the same download and hash validation path against repository fixtures. */
export function exampleFetchFixture() {
  const files = new Map(EXAMPLES.flatMap((e) => e.files.map((f) => [f.url, join(import.meta.dirname, "../../../examples", e.slug, f.path)] as const)));
  beforeAll(() => vi.stubGlobal("fetch", async (url: string) => {
    const path = files.get(url);
    if (!path) throw new Error(`Unexpected example request: ${url}`);
    return new Response(readFileSync(path));
  }));
  afterAll(() => vi.unstubAllGlobals());
}
