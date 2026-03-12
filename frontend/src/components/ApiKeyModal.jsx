import { useState, useEffect } from "react";

const SECURITY_CONSENT_KEY = "siljangnim:securityConsent";

const PROVIDER_LINKS = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
  glm: "https://open.bigmodel.cn/usercenter/apikeys",
};

function getKoreanError(error) {
  if (!error) return null;
  const e = error.toLowerCase();
  if (e.includes("401") || e.includes("403") || e.includes("unauthorized") || e.includes("invalid"))
    return "API 키가 올바르지 않습니다. 키를 다시 확인해 주세요.";
  if (e.includes("429") || e.includes("rate"))
    return "API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  if (e.includes("network") || e.includes("fetch") || e.includes("econnrefused"))
    return "서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.";
  return error;
}

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
  const [consent, setConsent] = useState(() => localStorage.getItem(SECURITY_CONSENT_KEY) === "true");

  const providerHasKey = savedConfig?.provider_keys?.[provider] ?? false;
  const isActiveProvider = provider === savedConfig?.provider;

  const currentProvider = PROVIDERS.find((p) => p.id === provider);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (loading) return;
    if (consent) localStorage.setItem(SECURITY_CONSENT_KEY, "true");
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

  const needsConsent = !localStorage.getItem(SECURITY_CONSENT_KEY);
  const isSubmitDisabled = loading || (needsConsent && !consent) || (provider === "custom"
    ? (!baseUrl.trim() || !model.trim())
    : (!key.trim() && !providerHasKey));

  const inputCls =
    "w-full text-sm rounded-lg px-4 py-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono";
  const inputStyle = { background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--input-text)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl shadow-2xl p-5 sm:p-8 w-full max-w-lg mx-3 sm:mx-4 space-y-5 relative max-h-[90vh] overflow-y-auto"
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
            AI 프로바이더 설정
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--chrome-text-secondary)" }}>
            프로바이더를 선택하고 API 키를 입력하세요
          </p>
        </div>

        {/* Provider toggle */}
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => {
            const hasKey = savedConfig?.provider_keys?.[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setProvider(p.id); setKey(""); }}
                className="text-xs sm:text-sm font-medium px-2 sm:px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
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
          {PROVIDER_LINKS[provider] && !providerHasKey && (
            <a href={PROVIDER_LINKS[provider]} target="_blank" rel="noopener noreferrer"
               className="text-xs hover:underline" style={{ color: "var(--accent)" }}>
              API 키 발급받기 →
            </a>
          )}
          {providerHasKey && (
            <p className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>
              키가 저장되어 있습니다. 현재 키를 유지하려면 비워두세요.
            </p>
          )}
          {provider === "custom" && !providerHasKey && (
            <p className="text-xs text-zinc-500">
              인증이 필요하지 않으면 비워두세요.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-400 max-h-20 overflow-y-auto break-words">{getKoreanError(error)}</p>
          )}
        </div>

        {/* Security warning */}
        {needsConsent && (
          <div
            className="rounded-lg p-3 space-y-2"
            style={{ background: "rgba(234, 179, 8, 0.08)", border: "1px solid rgba(234, 179, 8, 0.25)" }}
          >
            <p className="text-xs font-medium" style={{ color: "#eab308" }}>
              보안 안내
            </p>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--chrome-text-secondary)" }}>
              API 키는 브라우저 세션 저장소에 보관되며, AI 제공자에게 전달하기 위해 서버를 통해 전송됩니다. 지출 한도가 설정된 키를 사용하고 주기적으로 교체하는 것을 권장합니다.
            </p>
            <label className="flex items-start gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 accent-indigo-500"
              />
              <span className="text-xs" style={{ color: "var(--chrome-text-secondary)" }}>
                위 내용을 이해하고 동의합니다
              </span>
            </label>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
        >
          {loading ? "확인 중..." : (providerHasKey && !key.trim()) ? "프로바이더 전환" : "연결"}
        </button>
      </form>
    </div>
  );
}
