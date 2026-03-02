import { useCallback, useState } from "react";

export default function useApiKey(sendRef) {
  const [apiKeyRequired, setApiKeyRequired] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  const handleApiKeySubmit = useCallback(
    (key) => {
      setApiKeyLoading(true);
      setApiKeyError("");
      sendRef.current?.({ type: "set_api_key", key });
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
    handleApiKeySubmit,
    setRequired,
    setValid,
    setInvalid,
  };
}
