// Forwards LLM API calls from the studio renderer to the provider.
//
// Used by the Vite dev server, by the desktop main process (which passes
// `getKey` so API keys never reach the renderer) and by the web deploy's
// function (api/llm/[...path].js, through webForward). Web-standard Request
// in, Response out, streaming bodies passed straight through.
//
//   /api/llm/anthropic/<path>  → https://api.anthropic.com/<path>
//   /api/llm/openai/<path>     → <x-llm-base-url | https://api.openai.com/v1>/<path>

const ANTHROPIC_BASE = "https://api.anthropic.com";
const OPENAI_BASE = "https://api.openai.com/v1";

const FORWARDED_HEADERS = ["content-type", "accept", "anthropic-version", "anthropic-beta"];

export const LLM_PREFIX = "/api/llm/";

// A public deployment only forwards what the studio calls, so it can't serve as an open proxy.
const PUBLIC_PATHS = {
  anthropic: /^\/v1\/(messages(\/count_tokens)?|models(\/[\w.-]+)?)$/,
  openai: /^\/(chat\/completions|responses|models)$/,
};

/**
 * @param {Request} request
 * @param {{
 *   getKey?: (provider: "anthropic" | "openai") => string | null | undefined,
 *   anthropicBaseUrl?: string,
 *   public?: boolean,
 * }} [options]  anthropicBaseUrl points at a gateway or a test server instead of api.anthropic.com;
 *   public (the web deploy) allows only the studio's API paths and public https model servers
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

  if (options.public && !(PUBLIC_PATHS[provider]?.test(path))) return json(404, "not an LLM API path");

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
    if (options.public && !isPublicHttps(base)) {
      return json(400, "The web version reaches only public https model servers; for a server on your machine or network use the desktop app");
    }
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

/**
 * The web deploy's handler: forwards only requests from the app's own pages.
 * The scene runs on another origin, so its requests are refused too.
 * @param {Request} request
 */
export async function webForward(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const sameOrigin = origin ? origin === url.origin : site === "same-origin";
  if (!sameOrigin) return json(403, "LLM requests are accepted from this site's own pages only");
  return forwardLlmRequest(request, { public: true });
}

/** https, and not a loopback, private or link-local address. */
function isPublicHttps(base) {
  let host;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return false;
    host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
  }
  if (host.includes(":")) return !(host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:"));
  return true;
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
