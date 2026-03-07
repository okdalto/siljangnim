/**
 * Vercel Edge Function — proxies GitHub OAuth Device Flow endpoints.
 * GitHub's OAuth endpoints don't support browser CORS, so we relay through here.
 *
 * Routes:
 *   POST /api/github-login/device/code       → https://github.com/login/device/code
 *   POST /api/github-login/oauth/access_token → https://github.com/login/oauth/access_token
 */
export const config = { runtime: "edge" };

const ALLOWED_PATHS = {
  "device/code": "https://github.com/login/device/code",
  "oauth/access_token": "https://github.com/login/oauth/access_token",
};

const ALLOWED_ORIGINS = new Set([
  "https://okdalto.github.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
]);

function getCorsOrigin(req) {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  // Allow Vercel preview/production deployments
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  if (!origin) return null;
  return null;
}

export default async function handler(req) {
  const corsOrigin = getCorsOrigin(req);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...(corsOrigin && { "Access-Control-Allow-Origin": corsOrigin }),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!corsOrigin) {
    return new Response("Forbidden", { status: 403 });
  }

  // Extract the sub-path from the URL
  const url = new URL(req.url);
  const subPath = url.pathname.replace(/^\/api\/github-login\//, "").replace(/\/$/, "");
  const target = ALLOWED_PATHS[subPath];

  if (!target) {
    return new Response(JSON.stringify({ error: "Unknown path" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward the body as-is — client sends application/x-www-form-urlencoded
  const reqBody = await req.text();
  const res = await fetch(target, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": req.headers.get("content-type") || "application/x-www-form-urlencoded",
    },
    body: reqBody,
  });

  const resBody = await res.text();

  return new Response(resBody, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
    },
  });
}
