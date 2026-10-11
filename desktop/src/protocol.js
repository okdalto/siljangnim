// Serves the renderer from app://siljangnim/ and answers /api/proxy with the
// same handler the web build uses on Vercel. A fixed custom origin keeps
// IndexedDB/localStorage stable across launches (a random localhost port would
// not) and counts as a secure context for WebGPU and the camera.
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { protocol } from "electron";
import { proxyModulePath, rendererDir } from "./paths.js";

export const SCHEME = "app";
export const ORIGIN = `${SCHEME}://siljangnim`;

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
  ".md": "text/markdown; charset=utf-8",
  ".glsl": "text/plain; charset=utf-8",
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

async function serveFile(root, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  let file = join(root, rel);
  if (file !== root && !file.startsWith(root + sep)) {
    return new Response("Not found", { status: 404 });
  }
  // SPA fallback: extensionless paths are client-side routes.
  if (!extname(file)) file = join(root, "index.html");
  try {
    const body = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] || "application/octet-stream";
    return new Response(body, { headers: { "Content-Type": type } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function handleAppProtocol() {
  const { handleProxy } = await import(pathToFileURL(proxyModulePath()).href);
  const root = normalize(rendererDir());

  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== "siljangnim") return new Response("Not found", { status: 404 });

    if (url.pathname === "/api/proxy") {
      if (request.method === "OPTIONS") return new Response(null, { status: 204 });
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      try {
        return await handleProxy(request, ORIGIN);
      } catch (err) {
        return Response.json({ error: err.message }, { status: 502 });
      }
    }
    return serveFile(root, url.pathname);
  });
}
