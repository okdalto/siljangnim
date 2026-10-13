// app:// protocol.
//
//   app://siljangnim/…           the studio UI (stage/renderer)
//   app://siljangnim/api/llm/…   LLM forwarder; adds API keys from the main process
//   app://scene/scene.html       the scene runtime, a separate origin with no access to the app's storage
//
// Fixed custom origins keep IndexedDB/localStorage stable across launches and
// count as secure contexts (WebGPU, camera).
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { protocol } from "electron";
import { llmForwardModulePath, rendererDir } from "./paths.js";

export const SCHEME = "app";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

// Must run before app "ready".
export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        allowServiceWorkers: true,
        codeCache: true,
      },
    },
  ]);
}

async function serveFile(root, pathname, { spaFallback }) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  let file = join(root, rel);
  if (file !== root && !file.startsWith(root + sep)) return notFound();
  if (!extname(file)) {
    // A file without an extension (an example's assets/LICENSE) is still a file; only other paths are app routes.
    const found = await readFile(file).catch(() => null);
    if (found) return new Response(found, { headers: { "Content-Type": "application/octet-stream" } });
    if (!spaFallback) return notFound();
    file = join(root, "index.html");
  }
  try {
    const body = await readFile(file);
    return new Response(body, { headers: { "Content-Type": MIME[extname(file).toLowerCase()] || "application/octet-stream" } });
  } catch {
    return notFound();
  }
}

function notFound() {
  return new Response("Not found", { status: 404 });
}

export const FORWARDER_TOKEN_HEADER = "x-siljangnim-token";

function tokenMatches(supplied, expected) {
  const a = Buffer.from(supplied ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * @param {{
 *   origins: { app: string, scene: string },
 *   keys: import("./keys.js").KeyStore,
 *   forwarderToken: string,
 *   serveRenderer: boolean,
 * }} options
 */
export async function handleAppProtocol({ origins, keys, forwarderToken, serveRenderer }) {
  const { forwardLlmRequest, LLM_PREFIX } = await import(pathToFileURL(llmForwardModulePath()).href);
  const root = normalize(rendererDir());

  const cors = (response) => {
    // Only matters in dev, where the UI runs on http://localhost and calls app://.
    if (origins.app !== "app://siljangnim") {
      response.headers.set("Access-Control-Allow-Origin", origins.app);
      response.headers.set("Access-Control-Allow-Headers", "*");
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    return response;
  };

  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);

    if (url.host === "siljangnim" && url.pathname.startsWith(LLM_PREFIX)) {
      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
      // Keys are attached here, so only the app UI may call. Electron drops
      // Origin for custom protocols, so the app proves itself with a per-launch
      // token it gets over IPC; the scene runtime (another origin, no preload)
      // never has it.
      if (!tokenMatches(request.headers.get(FORWARDER_TOKEN_HEADER), forwarderToken)) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        return cors(
          await forwardLlmRequest(request, {
            getKey: (provider) => keys.get(provider),
            // Optional gateway (or the smoke test's mock server) instead of api.anthropic.com.
            anthropicBaseUrl: process.env.SILJANGNIM_ANTHROPIC_BASE_URL || undefined,
          }),
        );
      } catch (err) {
        return cors(Response.json({ type: "error", error: { type: "proxy_error", message: err.message } }, { status: 502 }));
      }
    }

    if (!serveRenderer) return notFound();
    if (url.host === "siljangnim") return serveFile(root, url.pathname, { spaFallback: true });
    // The scene origin serves only its own document and the built assets.
    if (url.host === "scene" && (url.pathname === "/scene.html" || url.pathname.startsWith("/assets/"))) {
      return serveFile(root, url.pathname, { spaFallback: false });
    }
    return notFound();
  });
}
