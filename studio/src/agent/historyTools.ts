import { z } from "zod";
import { layoutTree } from "../project/history";
import { loadReport } from "./sceneTools";
import { defineTool, type ToolDefinition, type VersionInfo } from "./tools";

const LIST_LIMIT = 40;
const SHORT_ID = 8;

function versionLine(v: VersionInfo, depth: number): string {
  const when = new Date(v.createdAt).toISOString().replace("T", " ").slice(0, 16);
  return `${"  ".repeat(depth)}${v.id.slice(0, SHORT_ID)}  ${when}  ${JSON.stringify(v.message)}${v.head ? "  <- HEAD (current)" : ""}`;
}

const historyList = defineTool({
  name: "history_list",
  description:
    "List saved versions of the scene (one per finished agent run or control adjustment), as a tree: " +
    "indented entries are branches made after a restore. Use it when the person wants an earlier result back.",
  input: z.object({}),
  readOnly: true,
  async run(_input, env) {
    const versions = await env.history.list();
    if (!versions.length) return { content: "No versions saved yet." };
    const rows = layoutTree(versions);
    const shown = rows.slice(-LIST_LIMIT);
    const head = shown.length < rows.length ? `(${rows.length - shown.length} older versions not shown)\n` : "";
    return { content: `${head}id        created (UTC)     message\n${shown.map((r) => versionLine(r.version, r.depth)).join("\n")}` };
  },
});

const historyRestore = defineTool({
  name: "history_restore",
  description:
    "Restore a saved version: load its scene and make it the current one. Later changes branch from it; " +
    "nothing is deleted. Pass an id (or its first 8 characters) from history_list.",
  input: z.object({ id: z.string().min(1).describe("Version id or unique prefix from history_list.") }),
  readOnly: false,
  async run({ id }, env) {
    const { version, load } = await env.history.restore(id);
    const report = loadReport(load);
    return { isError: report.isError, content: `Restored version ${version.id.slice(0, SHORT_ID)} ${JSON.stringify(version.message)}.\n${String(report.content)}` };
  },
});

export const HISTORY_TOOLS: ToolDefinition[] = [historyList, historyRestore] as ToolDefinition[];
