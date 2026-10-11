import { z } from "zod";
import { defineTool, type ToolDefinition } from "./tools";

const askUser = defineTool({
  name: "ask_user",
  description:
    "Ask the person one short multiple-choice question and wait for the answer. Use it only when the request is " +
    "genuinely ambiguous in a way that changes what you build (e.g. interactive piece vs. a timed sequence), " +
    "at most once before building. Otherwise pick a sensible default and mention it in your reply. " +
    "The person may also type their own answer.",
  input: z.object({
    question: z.string().min(1).max(300),
    options: z
      .array(z.object({ label: z.string().min(1).max(60), description: z.string().max(200).optional() }))
      .min(2)
      .max(4),
  }),
  readOnly: false,
  async run({ question, options }, env) {
    const answer = await env.user.ask(question, options, env.signal);
    if (answer === null) return { isError: true, content: "The person stopped the run without answering." };
    const picked = options.find((o) => o.label === answer);
    return { content: picked ? `The person chose: ${answer}` : `The person answered in their own words: ${answer}` };
  },
});

export const USER_TOOLS: ToolDefinition[] = [askUser] as ToolDefinition[];
