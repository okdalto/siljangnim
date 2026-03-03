import { useCallback, useState } from "react";

export default function useApiKey(sendRef) {
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [savedConfig, setSavedConfig] = useState(null);

  const handleApiKeySubmit = useCallback(
    (provider, key, { endpoint, base_url, model, max_tokens } = {}) => {
      setApiKeyLoading(true);
      setApiKeyError("");
      sendRef.current?.({ type: "set_api_key", provider, key, endpoint, base_url, model, max_tokens });
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
