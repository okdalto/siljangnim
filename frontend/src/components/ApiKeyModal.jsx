import { useState } from "react";

const PROVIDERS = [
  { id: "anthropic", label: "Claude", placeholder: "sk-ant-api03-..." },
  { id: "openai", label: "OpenAI", placeholder: "sk-..." },
  { id: "gemini", label: "Gemini", placeholder: "AIza..." },
  { id: "glm", label: "GLM", placeholder: "your-glm-api-key..." },
  { id: "custom", label: "Custom", placeholder: "API key (optional)" },
];

const GLM_ENDPOINTS = [
  { id: "open.bigmodel.cn", label: "open.bigmodel.cn" },
  { id: "api.z.ai", label: "api.z.ai" },
];

export default function ApiKeyModal({ onSubmit, error, loading, onClose, savedConfig }) {
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState(savedConfig?.provider || "anthropic");
  const [endpoint, setEndpoint] = useState(savedConfig?.endpoint || "open.bigmodel.cn");
  const [baseUrl, setBaseUrl] = useState(savedConfig?.base_url || "http://localhost:8000/v1/");
  const [model, setModel] = useState(savedConfig?.model || "");
  const [maxTokens, setMaxTokens] = useState(savedConfig?.max_tokens || 8192);
  const [contextWindow, setContextWindow] = useState(savedConfig?.context_window || 131072);

  const providerHasKey = savedConfig?.provider_keys?.[provider] ?? false;
  const isActiveProvider = provider === savedConfig?.provider;

  const currentProvider = PROVIDERS.find((p) => p.id === provider);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    if (provider === "custom") {
      if (!baseUrl.trim() || !model.trim()) return;
      onSubmit(provider, key.trim(), { base_url: baseUrl.trim(), model: model.trim(), max_tokens: parseInt(maxTokens, 10) || 8192, context_window: parseInt(contextWindow, 10) || 131072 });
    } else {
      if (!key.trim() && !providerHasKey) return;
      onSubmit(provider, key.trim(), {
        endpoint: provider === "glm" ? endpoint : undefined,
      });
    }
  };

  const isSubmitDisabled = loading || (provider === "custom"
    ? (!baseUrl.trim() || !model.trim())
    : (!key.trim() && !providerHasKey));

  const inputCls =
    "w-full text-sm rounded-lg px-4 py-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono";
  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--input-text)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 space-y-5 relative"
        style={{ background: "var(--chrome-bg)", border: "1px solid var(--chrome-border)" }}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 transition-colors"
            style={{ color: "var(--chrome-text-muted)" }}
            title="Close"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        )}
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--chrome-text)" }}>
            AI Provider Setup
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--chrome-text-secondary)" }}>
            Choose a provider and enter your API key to get started.
          </p>
        </div>

        {/* Provider toggle */}
        <div className="flex gap-1.5 flex-wrap">
          {PROVIDERS.map((p) => {
            const hasKey = savedConfig?.provider_keys?.[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setProvider(p.id); setKey(""); }}
                className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
                style={
                  provider === p.id
                    ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--accent-text)" }
                    : { background: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--chrome-text-secondary)" }
                }
              >
                {p.label}
                {hasKey && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: provider === p.id ? "#a5f3fc" : "#22c55e" }}
                    title="Key saved"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* GLM endpoint selector */}
        {provider === "glm" && (
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide" style={{ color: "var(--chrome-text-muted)" }}>
              Endpoint
            </label>
            <div className="flex gap-2">
              {GLM_ENDPOINTS.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => setEndpoint(ep.id)}
                  className="flex-1 text-xs font-mono px-3 py-1.5 rounded-md border transition-colors"
                  style={
                    endpoint === ep.id
                      ? { background: "var(--chrome-bg-elevated)", borderColor: "var(--chrome-border-subtle)", color: "var(--chrome-text)" }
                      : { background: "var(--input-bg)", borderColor: "var(--input-border)", color: "var(--chrome-text-muted)" }
                  }
                >
                  {ep.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom provider fields */}
        {provider === "custom" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide" style={{ color: "var(--chrome-text-muted)" }}>
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:8000/v1/"
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide" style={{ color: "var(--chrome-text-muted)" }}>
                Model Name
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Qwen/Qwen3.5-4B"
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-xs uppercase tracking-wide" style={{ color: "var(--chrome-text-muted)" }}>
                  Max Tokens
                </label>
                <input
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  min={1}
                  placeholder="8192"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs uppercase tracking-wide" style={{ color: "var(--chrome-text-muted)" }}>
                  Context Window
                </label>
                <input
                  type="number"
                  value={contextWindow}
                  onChange={(e) => setContextWindow(e.target.value)}
                  min={1}
                  placeholder="131072"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={providerHasKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)" : currentProvider?.placeholder}
            autoFocus={provider !== "custom"}
            className={inputCls}
            style={inputStyle}
          />
          {providerHasKey && (
            <p className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>
              Key saved. Leave empty to keep current key, or enter a new one to replace it.
            </p>
          )}
          {provider === "custom" && !providerHasKey && (
            <p className="text-xs text-zinc-500">
              Leave empty if your server doesn't require authentication.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-400 max-h-20 overflow-y-auto break-words">{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
        >
          {loading ? "Validating..." : (providerHasKey && !key.trim()) ? "Switch Provider" : "Connect"}
        </button>
      </form>
    </div>
  );
}
