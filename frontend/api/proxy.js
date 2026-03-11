/**
 * Vercel Edge Function — multi-purpose API proxy.
 *
 * Routes (via ?target= query param):
 *   (default / anthropic)   → Anthropic Messages API
 *   ?target=openai           → OpenAI Chat Completions API
 *   ?target=gemini           → Google Gemini API
 *   ?target=glm              → GLM (BigModel) API
 *   ?target=custom           → Custom OpenAI-compatible endpoint
 *   ?target=github&endpoint= → GitHub OAuth
 *   ?target=fetch             → Generic URL fetch (for web_fetch tool, avoids CORS)
 */
export const config = { runtime: "edge", maxDuration: 300 };

const ALLOWED_ORIGINS = new Set([
  "https://okdalto.github.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
]);

const GITHUB_ENDPOINTS = {
  "device/code": "https://github.com/login/device/code",
  "oauth/access_token": "https://github.com/login/oauth/access_token",
};

function getCorsOrigin(req) {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  if (!origin) return null;
  return null;
}

const CORS_HEADERS = "Content-Type, x-api-key, anthropic-version, Authorization, x-base-url, x-model, x-fetch-url";

export default async function handler(req) {
  const corsOrigin = getCorsOrigin(req);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...(corsOrigin && { "Access-Control-Allow-Origin": corsOrigin }),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": CORS_HEADERS,
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!corsOrigin) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("target");

  // --- GitHub OAuth proxy ---
  if (target === "github") {
    const endpoint = url.searchParams.get("endpoint");
    const githubUrl = GITHUB_ENDPOINTS[endpoint];
    if (!githubUrl) {
      return new Response(JSON.stringify({ error: "Unknown endpoint" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": corsOrigin },
      });
    }
    const reqBody = await req.text();
    const res = await fetch(githubUrl, {
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": corsOrigin },
    });
  }

  // --- Generic URL fetch proxy (for web_fetch tool) ---
  if (target === "fetch") {
    const fetchUrl = req.headers.get("x-fetch-url");
    if (!fetchUrl) {
      return new Response(JSON.stringify({ error: "x-fetch-url header required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": corsOrigin },
      });
    }
    try {
      const response = await fetch(fetchUrl, {
        headers: { "User-Agent": "siljangnim-agent/1.0" },
        redirect: "follow",
      });
      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "Access-Control-Allow-Origin": corsOrigin,
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": corsOrigin },
      });
    }
  }

  // --- OpenAI API proxy ---
  if (target === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("authorization") || "",
      },
      body: req.body,
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
    });
  }

  // --- Gemini API proxy ---
  if (target === "gemini") {
    const model = req.headers.get("x-model") || "gemini-2.0-flash";
    const apiKey = req.headers.get("x-api-key") || "";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: req.body,
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
    });
  }

  // --- GLM API proxy ---
  if (target === "glm") {
    const baseUrl = (req.headers.get("x-base-url") || "https://open.bigmodel.cn/api/paas/v4").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("authorization") || "",
      },
      body: req.body,
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
    });
  }

  // --- Custom OpenAI-compatible proxy ---
  if (target === "custom") {
    const baseUrl = (req.headers.get("x-base-url") || "").replace(/\/+$/, "");
    if (!baseUrl) {
      return new Response(JSON.stringify({ error: "x-base-url header required for custom target" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": corsOrigin },
      });
    }
    const headers = { "Content-Type": "application/json" };
    const auth = req.headers.get("authorization");
    if (auth) headers.Authorization = auth;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: req.body,
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
    });
  }

  // --- Anthropic API proxy (default) ---
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": req.headers.get("x-api-key") || "",
      "anthropic-version": req.headers.get("anthropic-version") || "2023-06-01",
    },
    body: req.body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "Access-Control-Allow-Origin": corsOrigin,
    },
  });
}
