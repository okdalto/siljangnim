// Move tools: techniques worth trying next on the current scene (3D, volume, PBR, path tracing, glitch, sound…),
// and how to apply one in this runtime.
import { z } from "zod";
import { CATALOG } from "../catalog/catalog";
import { MOVES, MOVE_CATEGORIES, suggestMoves, type Move } from "../moves/moves";
import { defineTool, type ToolDefinition } from "./tools";

const WEIGHT: Record<Move["weight"], string> = {
  light: "runs in the scene",
  heavy: "GPU-heavy",
  python: "runs Python on this computer (asks first)",
  "gpu-model": "runs an ML model on this computer (asks first; slow without a GPU)",
};

const movesSuggest = defineTool({
  name: "moves_suggest",
  description:
    "Techniques that would take the current scene somewhere new (lift to 3D, volume rendering, PBR, path tracing, Gaussian " +
    "splatting, pixel sorting, datamosh, beat sync, stems, hand tracking…), picked from what the scene already is. Use it when " +
    "the person asks what to try next or wants ideas; offer two or three in plain words. move_get gives how to apply one.",
  input: z.object({
    exclude: z.array(z.string()).default([]).describe("Move ids already tried in this conversation."),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  readOnly: true,
  async run({ exclude, limit }, env) {
    const found = suggestMoves(env.scene.get(), { applied: exclude, limit });
    if (!found.length) return { content: "Nothing obvious left to add; ask the person where they want to take it." };
    return {
      content: found
        .map(({ move, because }) => `${move.id} [${move.category}, ${WEIGHT[move.weight]}] ${move.name} — ${move.summary}${because.length ? ` (fits: ${because.join(", ")})` : ""}`)
        .join("\n"),
    };
  },
});

const moveGet = defineTool({
  name: "move_get",
  description: `How to apply one technique to the current scene in this runtime. Categories: ${MOVE_CATEGORIES.join(", ")}. Ids come from moves_suggest; any id from the list works.`,
  input: z.object({ id: z.string() }),
  readOnly: true,
  async run({ id }) {
    const move = MOVES.find((m) => m.id === id);
    if (!move) return { isError: true, content: `No move "${id}". Known: ${MOVES.map((m) => m.id).join(", ")}.` };
    const tools = move.tools.flatMap((t) => {
      const e = CATALOG.find((c) => c.id === t);
      return e ? [`${e.id} (${e.name}, ${e.license})`] : [];
    });
    return {
      content: [
        `${move.name} (${move.id}) — ${move.summary}`,
        `Cost: ${WEIGHT[move.weight]}.${tools.length ? ` Builds on: ${tools.join(", ")}; catalog_get for the pinned import or packages and the example that uses it.` : ""}`,
        move.guide,
        "Apply it to the scene as it is now (scene_edit when the change is local, scene_write when the pipeline changes), keep what makes the piece recognisable, check it with viewport_capture, and tell the person which new controls to play with.",
      ].join("\n"),
    };
  },
});

export const MOVE_TOOLS: ToolDefinition[] = [movesSuggest, moveGet];
