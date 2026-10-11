// Vercel Function for the web deploy: the studio's LLM calls (/api/llm/<provider>/<path>,
// rewritten here by vercel.json with the path in ?__path=).
// Keys come from the person's browser with each request; nothing is stored here.
import { webForward } from "../server/llmForward.js";

export const GET = webForward;
export const POST = webForward;
