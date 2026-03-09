import { useCallback, useState } from "react";

function restoreConfigFromSession() {
  try {
    const key = sessionStorage.getItem("siljangnim:apiKey");
    if (!key) return null;
    const provider = sessionStorage.getItem("siljangnim:provider") || "anthropic";
    const raw = sessionStorage.getItem("siljangnim:providerConfig");
    const config = raw ? JSON.parse(raw) : {};
    return { provider, ...config };
  } catch {
    return null;
  }
}

export default function useApiKey(sendRef) {
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [savedConfig, setSavedConfig] = useState(restoreConfigFromSession);

  const handleApiKeySubmit = useCallback(
    (provider, key, { endpoint, base_url, model, max_tokens, context_window } = {}) => {
      setApiKeyLoading(true);
      setApiKeyError("");
      sendRef.current?.({ type: "set_api_key", provider, key, endpoint, base_url, model, max_tokens, context_window });
    },
    [sendRef]
  );

  const setRequired = useCallback(() => {
    setApiKeyRequired(true);
  }, []);

  const setValid = useCallback(() => {
    setApiKeyRequired(false);
    setApiKeyError("");
    setApiKeyLoading(false);
  }, []);

  const setInvalid = useCallback((msg) => {
    setApiKeyError(msg || "Invalid API key");
    setApiKeyLoading(false);
  }, []);

  return {
    apiKeyRequired,
    apiKeyError,
    apiKeyLoading,
    savedConfig,
    handleApiKeySubmit,
    setRequired,
    setValid,
    setInvalid,
    setSavedConfig,
  };
}
