// "Mix into this project": the request that asks the agent to combine the open scene with another one.
import type { Scene } from "../scene/schema";

/**
 * @param title the other piece's name
 * @param renamed its asset names → the names they got in this project (same name if it was free)
 */
export function mixRequest(title: string, scene: Scene, renamed: Map<string, string>): string {
  const moved = [...renamed].filter(([from, to]) => from !== to);
  const assets = renamed.size
    ? ` Its assets are now in this project too${moved.length ? ` (${moved.map(([from, to]) => `${from} is ${to} here`).join(", ")})` : ""}.`
    : "";
  return [
    `Mix the current scene with "${title}" into one piece. Its scene is below.`,
    `Keep what makes each of them work, blend them into one image rather than placing them side by side, and add controls for the balance between the two.${assets}`,
    "",
    "```json",
    JSON.stringify(scene, null, 2),
    "```",
  ].join("\n");
}

export interface RemixPiece {
  title: string;
  scene: Scene;
  renamed: Map<string, string>;
}

/**
 * One request for several picks from the remix list: techniques (moves, by id; the agent reads each with move_get)
 * and example pieces to blend in, plus anything the person typed.
 */
export function remixRequest(moves: Array<{ id: string; name: string; summary: string }>, pieces: RemixPiece[], note = ""): string {
  const label = [...moves.map((m) => m.name), ...pieces.map((p) => p.title)].join(" + ");
  const lines = [
    `[Remix] ${label}`,
    `Remix the current scene with the picks below into one piece: keep what makes it recognisable, blend everything into one image rather than side by side, and add controls for the new parts.`,
  ];
  if (moves.length) {
    lines.push("", "Techniques (call move_get with each id for how to apply it here):");
    for (const m of moves) lines.push(`- ${m.name} (${m.id}): ${m.summary}`);
  }
  for (const piece of pieces) {
    const moved = [...piece.renamed].filter(([from, to]) => from !== to);
    const assets = piece.renamed.size
      ? ` Its assets are in this project now${moved.length ? ` (${moved.map(([from, to]) => `${from} is ${to} here`).join(", ")})` : ""}.`
      : "";
    lines.push("", `Piece to mix in: "${piece.title}".${assets} Its scene:`, "```json", JSON.stringify(piece.scene, null, 2), "```");
  }
  if (note.trim()) lines.push("", `The person adds: ${note.trim()}`);
  return lines.join("\n");
}
