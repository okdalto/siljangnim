// Tool output from the studio (Anthropic tool_result content) → MCP CallToolResult.

/**
 * @param {{ content?: string | Array<{ type: string, text?: string, source?: { type: string, media_type?: string, data?: string } }>, isError?: boolean } | null | undefined} output
 */
export function toMcpResult(output) {
  const raw = output?.content;
  const blocks = typeof raw === "string" ? [{ type: "text", text: raw }] : Array.isArray(raw) ? raw : [];
  const content = blocks.flatMap((block) => {
    if (block.type === "text" && typeof block.text === "string") return [{ type: "text", text: block.text }];
    if (block.type === "image" && block.source?.type === "base64" && block.source.data) {
      return [{ type: "image", data: block.source.data, mimeType: block.source.media_type ?? "image/png" }];
    }
    return [];
  });
  if (!content.length) content.push({ type: "text", text: "(no output)" });
  return { content, ...(output?.isError ? { isError: true } : {}) };
}
