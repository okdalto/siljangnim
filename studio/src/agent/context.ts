// Per-request context the app adds to a user message (the system prompt
// stays byte-stable). The chat UI shows these as notes, not as user text.
import type { ContentBlockParam } from "./llm/types";

export const STUDIO_NOTE_PREFIX = "[Studio note] ";

export function studioNote(text: string): ContentBlockParam {
  return { type: "text", text: STUDIO_NOTE_PREFIX + text };
}

export function isStudioNote(block: ContentBlockParam): boolean {
  return block.type === "text" && block.text.startsWith(STUDIO_NOTE_PREFIX);
}
