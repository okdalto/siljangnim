export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key, anthropic-version",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
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
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
