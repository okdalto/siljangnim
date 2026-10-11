import { z } from "zod";
import { assetKind, describeMeta, formatBytes, type AssetKind } from "../project/assets";
import { defineTool, type ToolDefinition } from "./tools";

const READ_DEFAULT = 20_000;
const READ_MAX = 100_000;
/** Kinds asset_read returns as text. */
const TEXT_KINDS = new Set<AssetKind>(["text", "svg", "model"]);

const USE_IN_SCENE: Partial<Record<AssetKind, string>> = {
  image: 'ctx.utils.loadTexture("NAME")',
  video: 'ctx.utils.createVideoTexture("NAME")',
  audio: 'new Audio(ctx.assets["NAME"])',
  font: 'new FontFace("Name", `url(${ctx.assets["NAME"]})`)',
};

const assetList = defineTool({
  name: "asset_list",
  description:
    "List the files the person uploaded to this project: name, kind, size and metadata (image size, video/audio duration, " +
    "3D vertex counts, text line counts). Scenes reach them through ctx.assets[name].",
  input: z.object({}),
  readOnly: true,
  async run(_input, env) {
    const assets = await env.assets.list();
    if (!assets.length) return { content: "No assets uploaded. The person can drop files onto the viewport or the chat." };
    return { content: assets.map((a) => `${a.name}  ${formatBytes(a.size)}  ${describeMeta(a.kind, a.meta)}`).join("\n") };
  },
});

const assetRead = defineTool({
  name: "asset_read",
  description:
    "Read a text asset (JSON, CSV, TXT, shader source, SVG, OBJ, glTF JSON) as text. Long files come back in pages: " +
    "pass offset to continue. Binary assets (images, video, audio, fonts, GLB) can't be read; use them from the scene.",
  input: z.object({
    name: z.string().min(1),
    offset: z.number().int().min(0).default(0).describe("Character offset to start from."),
    max_chars: z.number().int().min(100).max(READ_MAX).default(READ_DEFAULT),
  }),
  readOnly: true,
  async run({ name, offset, max_chars }, env) {
    const blob = await env.assets.read(name);
    if (!blob) {
      const names = (await env.assets.list()).map((a) => a.name);
      return { isError: true, content: `No asset "${name}". Available: ${names.length ? names.join(", ") : "none"}.` };
    }
    const kind = assetKind(name, blob.type);
    if (!TEXT_KINDS.has(kind) || name.toLowerCase().endsWith(".glb")) {
      const hint = USE_IN_SCENE[kind]?.replace("NAME", name);
      return { isError: true, content: `"${name}" is a binary ${kind} asset and can't be read as text.${hint ? ` Use it in the scene: ${hint}.` : ""}` };
    }
    const text = await blob.text();
    const chunk = text.slice(offset, offset + max_chars);
    const end = offset + chunk.length;
    const tail = end < text.length ? `\n\n[characters ${offset}-${end} of ${text.length}; call again with offset=${end} for more]` : "";
    return { content: chunk + tail };
  },
});

export const ASSET_TOOLS: ToolDefinition[] = [assetList, assetRead] as ToolDefinition[];
