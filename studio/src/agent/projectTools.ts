// Sharing a project as project.md: the scene plus how each
// generated asset was made, so another person's agent can rebuild it.
import { z } from "zod";
import { defineTool, type ToolDefinition } from "./tools";

const projectExport = defineTool({
  name: "project_export_md",
  description:
    "The open project as project.md: what the person asked for, its assets, the pipeline that made generated assets " +
    "(recipe references, or the job code and params) and the full scene. Use it to share or describe the project, or to " +
    "see the pipeline steps to rebuild after an import. The person can download a bundle with the assets and recipes " +
    "from the Projects menu (Export project).",
  input: z.object({}),
  readOnly: true,
  async run(_input, env) {
    return { content: await env.project.exportMd() };
  },
});

const projectImport = defineTool({
  name: "project_import_md",
  description:
    "Create a new project from a project.md someone shared (the whole document, e.g. pasted by the person or read " +
    "from a file) and open it with its scene. The result says which assets are missing and how to rebuild them: run " +
    "the pipeline steps in order (recipe_run for recipe steps, python_run/command_run with the code shown otherwise), " +
    "and ask the person for files they provided.",
  input: z.object({ markdown: z.string().min(1) }),
  readOnly: false,
  async run({ markdown }, env) {
    return { content: await env.project.importMd(markdown) };
  },
});

export const PROJECT_TOOLS: ToolDefinition[] = [projectExport, projectImport];
