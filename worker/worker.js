const ALLOWED_ORIGINS = new Set([
  "https://okdalto.github.io",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
]);

function getCorsOrigin(request) {
  const origin = request.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin;
  return null;
}

export default {
  async fetch(request) {
    const corsOrigin = getCorsOrigin(request);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...(corsOrigin && { "Access-Control-Allow-Origin": corsOrigin }),
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key, anthropic-version",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!corsOrigin) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    const apiUrl = "https://api.anthropic.com" + url.pathname;

    const headers = {
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      "x-api-key": request.headers.get("x-api-key") || "",
      "anthropic-version": request.headers.get("anthropic-version") || "2023-06-01",
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: request.body,
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
    });
  },
};
