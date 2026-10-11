import { useState } from "react";
import { ANTHROPIC_MODELS } from "../../agent/llm/anthropic";
import type { Effort } from "../../agent/llm/types";
import type { ProviderKeyId } from "../../desktop";
import { isDesktop } from "../platform";
import { setApiKey, setSettingsOpen, updateSettings } from "../session";
import { useApp } from "../state";
import { XIcon } from "./icons";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function SettingsDialog() {
  const settings = useApp((s) => s.settings);
  const close = () => setSettingsOpen(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-5 text-sm shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button type="button" onClick={close} className="text-muted hover:text-fg">
            <XIcon />
          </button>
        </div>

        <Field label="Provider">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
            {(["anthropic", "openai"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => updateSettings({ provider: p })}
                className={`rounded-md py-1.5 text-xs ${settings.provider === p ? "bg-raised text-fg" : "text-muted hover:text-fg"}`}
              >
                {p === "anthropic" ? "Anthropic" : "OpenAI-compatible"}
              </button>
            ))}
          </div>
        </Field>

        {settings.provider === "anthropic" ? (
          <>
            <Field label="Model">
              <select value={settings.anthropicModel} onChange={(e) => updateSettings({ anthropicModel: e.target.value })} className={inputClass}>
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Effort" hint="Higher effort thinks longer and costs more.">
              <select value={settings.effort} onChange={(e) => updateSettings({ effort: e.target.value as Effort })} className={inputClass}>
                {EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>
            <KeyField provider="anthropic" placeholder="sk-ant-…" />
          </>
        ) : (
          <>
            <Field label="Base URL" hint="Leave empty for api.openai.com. For vLLM/Ollama, e.g. http://localhost:8000/v1">
              <input value={settings.openaiBaseUrl} onChange={(e) => updateSettings({ openaiBaseUrl: e.target.value })} placeholder="https://api.openai.com/v1" className={inputClass} />
            </Field>
            <Field label="Model">
              <input value={settings.openaiModel} onChange={(e) => updateSettings({ openaiModel: e.target.value })} placeholder="e.g. Qwen/Qwen3.5-27B" className={inputClass} />
            </Field>
            <Field label="Max output tokens">
              <input
                type="number"
                min={256}
                value={settings.openaiMaxTokens}
                onChange={(e) => updateSettings({ openaiMaxTokens: Math.max(256, Number(e.target.value) || 256) })}
                className={inputClass}
              />
            </Field>
            <KeyField provider="openai" placeholder="Optional for local servers" />
          </>
        )}
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-faint";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-faint">{hint}</div>}
    </div>
  );
}

function KeyField({ provider, placeholder }: { provider: ProviderKeyId; placeholder: string }) {
  const stored = useApp((s) => s.keyStatus[provider]);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (key: string | null) => {
    setSaving(true);
    try {
      await setApiKey(provider, key);
      setValue("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Field
      label="API key"
      hint={isDesktop ? "Encrypted with your OS keychain. The app window never sees it." : "Kept for this browser session only."}
    >
      {stored ? (
        <div className="flex items-center justify-between rounded-md border border-line bg-bg px-2.5 py-1.5">
          <span className="text-xs text-ok">Key saved</span>
          <button type="button" disabled={saving} onClick={() => void save(null)} className="text-xs text-muted hover:text-danger">
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className={inputClass} autoComplete="off" />
          <button
            type="button"
            disabled={!value.trim() || saving}
            onClick={() => void save(value.trim())}
            className="shrink-0 rounded-md bg-accent px-3 text-xs font-medium text-white disabled:opacity-30"
          >
            Save
          </button>
        </div>
      )}
    </Field>
  );
}
