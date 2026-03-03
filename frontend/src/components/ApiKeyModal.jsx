import { useState } from "react";

const PROVIDERS = [
  { id: "anthropic", label: "Claude", placeholder: "sk-ant-api03-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "gemini", label: "Gemini", placeholder: "AIza..." },
  { id: "glm", label: "GLM", placeholder: "your-glm-api-key..." },
];

const GLM_ENDPOINTS = [
  { id: "open.bigmodel.cn", label: "open.bigmodel.cn" },
  { id: "api.z.ai", label: "api.z.ai" },
];

export default function ApiKeyModal({ onSubmit, error, loading }) {
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState("anthropic");
  const [endpoint, setEndpoint] = useState("open.bigmodel.cn");

  const currentProvider = PROVIDERS.find((p) => p.id === provider);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!key.trim() || loading) return;
    onSubmit(provider, key.trim(), provider === "glm" ? endpoint : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 space-y-5"
      >
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            AI Provider Setup
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Choose a provider and enter your API key to get started.
          </p>
        </div>

        {/* Provider toggle */}
        <div className="flex gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setProvider(p.id); setKey(""); }}
              className={`flex-1 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                provider === p.id
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* GLM endpoint selector */}
        {provider === "glm" && (
          <div className="space-y-1">
            <label className="text-xs text-zinc-500 uppercase tracking-wide">
              Endpoint
            </label>
            <div className="flex gap-2">
              {GLM_ENDPOINTS.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => setEndpoint(ep.id)}
                  className={`flex-1 text-xs font-mono px-3 py-1.5 rounded-md border transition-colors ${
                    endpoint === ep.id
                      ? "bg-zinc-700 border-zinc-500 text-zinc-200"
                      : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600"
                  }`}
                >
                  {ep.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={currentProvider?.placeholder}
            autoFocus
            className="w-full bg-zinc-800 text-zinc-100 text-sm rounded-lg px-4 py-3 outline-none border border-zinc-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={!key.trim() || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
        >
          {loading ? "Validating..." : "Connect"}
        </button>
      </form>
    </div>
  );
}
