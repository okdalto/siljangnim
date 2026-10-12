// After `npm pack` / `npm publish`: remove the copies prepack made, so the repo's bridge serves
// ../studio/dist (the current build) instead of a stale packaged one.
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mcpDir = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const dir of ["studio", "hub", "LICENSE", "THIRD_PARTY_NOTICES.md"]) rmSync(join(mcpDir, dir), { recursive: true, force: true });
