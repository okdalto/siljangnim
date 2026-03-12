export function handleApiKeyRequired(msg, deps) {
  deps.apiKey.setRequired();
}

export function handleApiKeyValid(msg, deps) {
  deps.apiKey.setValid();
  if (msg.config) deps.apiKey.setSavedConfig(msg.config);
}

export function handleApiKeyInvalid(msg, deps) {
  deps.apiKey.setInvalid(msg.error);
}
