/**
 * Vite dev-server middleware that serves /api/proxy with the same handler
 * Vercel runs in production, so browser mode works under `npm run dev`
 * without the Vercel CLI (and inside the desktop shell in dev).
 */
import { Buffer } from "node:buffer";
import proxyHandler from "./api/proxy.js";

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default function devApiProxy() {
  return {
    name: "siljangnim-dev-api-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/proxy", async (req, res) => {
        try {
          const url = new URL(req.originalUrl || req.url, `http://${req.headers.host}`);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          }
          const hasBody = req.method !== "GET" && req.method !== "HEAD";
          const request = new Request(url, {
            method: req.method,
            headers,
            body: hasBody ? await readBody(req) : undefined,
          });

          const response = await proxyHandler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          if (!response.body) return res.end();
          for await (const chunk of response.body) res.write(chunk);
          res.end();
        } catch (err) {
          server.config.logger.error(`[api/proxy] ${err.message}`);
          if (!res.headersSent) res.statusCode = 502;
          res.end();
        }
      });
    },
  };
}
