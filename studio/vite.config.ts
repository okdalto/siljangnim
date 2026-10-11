import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { LLM_PREFIX, forwardLlmRequest } from "./server/llmForward.js";

const IMPORT_CDNS = "https://esm.sh https://cdn.jsdelivr.net https://unpkg.com";

/** CSP for the scene runtime document. Dev needs inline scripts and the HMR socket. */
function sceneCsp(dev: boolean): string {
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-eval' ${IMPORT_CDNS}${dev ? " 'unsafe-inline'" : ""}`,
    `connect-src 'self' blob: data: https:${dev ? " ws:" : ""}`,
    "img-src 'self' blob: data: https:",
    "media-src 'self' blob: data: https:",
    "font-src 'self' blob: data: https:",
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join("; ");
}

function sceneCspPlugin(): Plugin {
  let dev = false;
  return {
    name: "siljangnim-scene-csp",
    configResolved(config) {
      dev = config.command === "serve";
    },
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replaceAll("__SCENE_CSP__", sceneCsp(dev)),
    },
  };
}

/** Serves /api/llm/* in dev so browser mode works without the desktop shell. */
function devLlmProxy(): Plugin {
  return {
    name: "siljangnim-dev-llm-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith(LLM_PREFIX)) return next();
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const hasBody = req.method === "POST";
        const response = await forwardLlmRequest(
          new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          }),
        );
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (response.body) for await (const chunk of response.body) res.write(chunk);
        res.end();
      });
    },
  };
}

// Vercel previews: the app is opened at the branch URL and the scene runs at the
// deployment's own unique URL, so both come from the same build on different
// origins. Production sets VITE_SCENE_ORIGIN to its scene domain (docs/m3.md).
if (!process.env.VITE_SCENE_ORIGIN && process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
  process.env.VITE_SCENE_ORIGIN = `https://${process.env.VERCEL_URL}`;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sceneCspPlugin(), devLlmProxy()],
  server: {
    // The app runs on localhost and the scene runtime on 127.0.0.1, so they
    // are separate origins in dev too (see src/scene/host.ts).
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    // /examples lives next to the studio, outside its root.
    fs: { allow: [resolve(import.meta.dirname, "..")] },
  },
  build: {
    target: "es2023",
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, "index.html"),
        scene: resolve(import.meta.dirname, "scene.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
