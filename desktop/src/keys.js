// API keys, kept in the main process. Encrypted with the OS keychain
// (Electron safeStorage) and added to LLM requests here, so the renderer —
// and any scene code — never holds them.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";

export const PROVIDERS = ["anthropic", "openai"];
const MAX_KEY_LENGTH = 512;

export class KeyStore {
  constructor() {
    this.path = join(app.getPath("userData"), "keys.json");
    /** provider → plaintext key, decrypted on load */
    this.keys = new Map();
    this.persistent = safeStorage.isEncryptionAvailable();
    if (this.persistent) this.#load();
  }

  status() {
    return Object.fromEntries(PROVIDERS.map((p) => [p, this.keys.has(p)]));
  }

  get(provider) {
    return this.keys.get(provider) ?? null;
  }

  set(provider, key) {
    if (!PROVIDERS.includes(provider)) throw new Error(`unknown provider ${provider}`);
    if (key === null || key === "") {
      this.keys.delete(provider);
    } else {
      if (typeof key !== "string" || key.length > MAX_KEY_LENGTH) throw new Error("invalid key");
      this.keys.set(provider, key.trim());
    }
    // Without OS encryption the key lives only for this session rather than in plaintext on disk.
    if (this.persistent) this.#save();
  }

  #load() {
    let stored;
    try {
      stored = JSON.parse(readFileSync(this.path, "utf8"));
    } catch {
      return;
    }
    for (const provider of PROVIDERS) {
      const encrypted = stored?.[provider];
      if (typeof encrypted !== "string") continue;
      try {
        this.keys.set(provider, safeStorage.decryptString(Buffer.from(encrypted, "base64")));
      } catch {
        // Written on another machine/user or a keychain reset: drop it.
      }
    }
  }

  #save() {
    const out = {};
    for (const [provider, key] of this.keys) out[provider] = safeStorage.encryptString(key).toString("base64");
    writeFileSync(this.path, JSON.stringify(out), { mode: 0o600 });
  }
}
