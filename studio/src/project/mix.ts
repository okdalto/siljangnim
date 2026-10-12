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
