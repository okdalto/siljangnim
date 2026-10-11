// Forwards LLM API calls from the studio renderer to the provider.
//
// Used by the Vite dev server and by the desktop main process (which passes
// `getKey` so API keys never reach the renderer). Web-standard Request in,
// Response out, streaming bodies passed straight through.
//
//   /api/llm/anthropic/<path>  → https://api.anthropic.com/<path>
//   /api/llm/openai/<path>     → <x-llm-base-url | https://api.openai.com/v1>/<path>

const ANTHROPIC_BASE = "https://api.anthropic.com";
const OPENAI_BASE = "https://api.openai.com/v1";

const FORWARDED_HEADERS = ["content-type", "accept", "anthropic-version", "anthropic-beta"];

export const LLM_PREFIX = "/api/llm/";

/**
 * @param {Request} request
 * @param {{
 *   getKey?: (provider: "anthropic" | "openai") => string | null | undefined,
 *   anthropicBaseUrl?: string,
 * }} [options]  anthropicBaseUrl points at a gateway or a test server instead of api.anthropic.com
 * @returns {Promise<Response>}
 */
export async function forwardLlmRequest(request, options = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(LLM_PREFIX)) return json(404, "not an LLM route");
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST" && request.method !== "GET") return json(405, "method not allowed");

  const rest = url.pathname.slice(LLM_PREFIX.length);
  const slash = rest.indexOf("/");
  const provider = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? "" : rest.slice(slash);

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let target;
  if (provider === "anthropic") {
    target = (options.anthropicBaseUrl || ANTHROPIC_BASE).replace(/\/+$/, "") + path;
    const key = options.getKey ? options.getKey("anthropic") : request.headers.get("x-api-key");
    if (!key) return json(401, "No Anthropic API key configured");
    headers.set("x-api-key", key);
  } else if (provider === "openai") {
    const base = (request.headers.get("x-llm-base-url") || OPENAI_BASE).replace(/\/+$/, "");
    if (!/^https?:\/\//.test(base)) return json(400, "x-llm-base-url must be an http(s) URL");
    target = base + path;
    const key = options.getKey ? options.getKey("openai") : bearer(request.headers.get("authorization"));
    if (key) headers.set("authorization", `Bearer ${key}`);
  } else {
    return json(404, `unknown provider "${provider}"`);
  }

  const body = request.method === "POST" ? await request.arrayBuffer() : undefined;
  let upstream;
  try {
    upstream = await fetch(target + url.search, { method: request.method, headers, body });
  } catch (err) {
    return json(502, `could not reach ${new URL(target).host}: ${err instanceof Error ? err.message : err}`);
  }
  const responseHeaders = new Headers();
  for (const name of ["content-type", "request-id", "retry-after", "anthropic-ratelimit-requests-remaining"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

function bearer(value) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function json(status, message) {
  return new Response(JSON.stringify({ type: "error", error: { type: "proxy_error", message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
