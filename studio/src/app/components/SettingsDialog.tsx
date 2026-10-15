import { useEffect, useState } from "react";
import { ANTHROPIC_MODELS } from "../../agent/llm/anthropic";
import type { Effort } from "../../agent/llm/types";
import type { LocalEngineId, ProviderKeyId, UpdateInfo } from "../../desktop";
import { bridge, isDesktop } from "../platform";
import { refreshLocalEngines, setApiKey, setSettingsOpen, updateSettings } from "../session";
import { fetchModels, isLocalEngine, looksLikeApiKey, type ProviderChoice } from "../settings";
import { useApp } from "../state";
import { XIcon } from "./icons";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

const PROVIDERS: Array<{ id: ProviderChoice; label: string }> = [
  { id: "anthropic", label: "Claude" },
  { id: "openai", label: "GPT" },
  { id: "custom", label: "Other" },
];

export function SettingsDialog() {
  const settings = useApp((s) => s.settings);
  const [advanced, setAdvanced] = useState(false);
  const close = () => setSettingsOpen(false);
  const { provider } = settings;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-line bg-panel p-5 text-sm shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button type="button" onClick={close} className="text-muted hover:text-fg" data-testid="close-settings">
            <XIcon />
          </button>
        </div>

        <Field label="Language" hint="For example descriptions and the tool list. Auto follows your system language.">
          <Segmented
            options={[
              { id: "auto", label: "Auto" },
              { id: "en", label: "English" },
              { id: "ko", label: "한국어" },
            ]}
            value={settings.language}
            onChange={(language) => updateSettings({ language })}
          />
        </Field>

        {bridge?.localAgent && (
          <Field label="Agent" hint="Claude Code and Codex run on your own Claude or ChatGPT plan, no API key needed.">
            <Segmented
              options={[
                { id: "claude-code", label: "Claude Code" },
                { id: "codex", label: "Codex" },
                { id: "api", label: "API key" },
              ]}
              value={isLocalEngine(provider) ? provider : "api"}
              onChange={(choice) => updateSettings({ provider: choice === "api" ? lastApiProvider(settings.provider) : choice })}
            />
          </Field>
        )}

        {isLocalEngine(provider) ? (
          <LocalEnginePanel engine={provider} />
        ) : (
          <ApiSettings advanced={advanced} setAdvanced={setAdvanced} />
        )}
        {bridge?.updates && <UpdatePanel />}
      </div>
    </div>
  );
}

/** Updates are checked on request; the browser downloads the installer for manual installation. */
function UpdatePanel() {
  const [version, setVersion] = useState("");
  const [result, setResult] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    let active = true;
    void bridge!.updates!.info().then(info => { if (active) setVersion(info.currentVersion); }).catch(() => { if (active) setError("Could not read the app version."); });
    return () => { active = false; };
  }, []);
  const check = async () => {
    setBusy(true); setError(""); setResult(null); setOpened(false);
    try { setResult(await bridge!.updates!.check()); }
    catch (e) { setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "Could not check updates. Try again."); }
    finally { setBusy(false); }
  };
  const open = async (download: boolean) => {
    setError("");
    try {
      if (download) { await bridge!.updates!.download(); setOpened(true); }
      else await bridge!.updates!.releases();
    } catch { setError("Could not open your browser. Please try again."); }
  };
  return (
    <section className="mt-5 border-t border-line pt-4" aria-label="App updates" data-testid="app-updates">
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="font-medium">App updates</h3><p className="text-xs text-muted">Siljangnim {version || "…"}</p></div>
        <button type="button" className="rounded border border-line px-3 py-1.5 hover:bg-white/5 disabled:opacity-50" disabled={busy} onClick={() => void check()} data-testid="check-updates">{busy ? "Checking…" : "Check for updates"}</button>
      </div>
      <div className="mt-2 text-xs text-muted" role="status" aria-live="polite">
        {result && (result.available ? <p>Version {result.latestVersion} is available.{!result.downloadUrl && " An installer for this computer is not available yet."}</p> : <p>You’re up to date.</p>)}
        {opened && <p>Your browser opened the download. Quit Siljangnim before installing the new version.</p>}
      </div>
      {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}
      <div className="mt-2 flex gap-4">
        {result?.available && result.downloadUrl && <button type="button" className="text-accent hover:underline" onClick={() => void open(true)} data-testid="download-update">Download {result.latestVersion}</button>}
        <button type="button" className="text-muted hover:text-fg" onClick={() => void open(false)}>Release notes</button>
      </div>
      <p className="mt-2 text-xs text-muted">Checks GitHub when you ask. Installers download in your browser; installation is manual.</p>
    </section>
  );
}

let apiProviderMemo: ProviderChoice = "anthropic";
/** Switching back to "API key" returns to the API provider used before. */
function lastApiProvider(current: ProviderChoice): ProviderChoice {
  if (!isLocalEngine(current)) apiProviderMemo = current;
  return apiProviderMemo;
}

const ENGINE_LABEL: Record<LocalEngineId, string> = { "claude-code": "Claude Code", codex: "Codex" };
const ENGINE_PLAN: Record<LocalEngineId, string> = { "claude-code": "Claude (Pro, Max, Team) plan", codex: "ChatGPT plan" };

/** Install and sign-in steps for the chosen CLI, checked live. */
function LocalEnginePanel({ engine }: { engine: LocalEngineId }) {
  const status = useApp((s) => s.localEngines?.[engine]);
  const [busy, setBusy] = useState<"install" | "login" | null>(null);
  const [output, setOutput] = useState("");
  const label = ENGINE_LABEL[engine];
  useEffect(() => {
    void refreshLocalEngines();
  }, [engine]);
  const act = async (action: "install" | "login") => {
    setBusy(action);
    setOutput("");
    try {
      const result = await bridge!.localAgent!.setup(engine, action);
      if (!result.ok) setOutput((result.stderr || result.stdout).trim().split("\n").slice(-6).join("\n") || `${action} did not finish.`);
    } catch (err) {
      setOutput(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      await refreshLocalEngines();
    }
  };
  const step = (done: boolean, text: string) => (
    <li className="flex gap-2">
      <span className={done ? "text-green-400" : "text-faint"}>{done ? "✓" : "○"}</span>
      <span className={done ? "text-muted" : ""}>{text}</span>
    </li>
  );
  return (
    <div className="mb-4 space-y-3 rounded-lg bg-bg p-3 text-xs">
      {!status ? (
        <p className="text-muted">Checking for {label}…</p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {step(status.installed, status.installed ? `${label} is installed${status.version ? ` (${status.version})` : ""}` : `Install ${label}`)}
            {step(status.loggedIn, status.loggedIn ? `Signed in` : `Sign in with your ${ENGINE_PLAN[engine]}`)}
          </ol>
          {!status.installed && status.install && (
            <div className="space-y-2">
              <code className="block break-all rounded bg-panel p-2 text-[11px] text-muted">{status.install}</code>
              <div className="flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void act("install")} className={buttonClass}>
                  {busy === "install" ? "Installing…" : `Install ${label}`}
                </button>
                <a href={status.docs} target="_blank" rel="noreferrer" className="self-center text-faint hover:text-muted">
                  Install guide
                </a>
              </div>
            </div>
          )}
          {status.installed && !status.loggedIn && (
            <button type="button" disabled={busy !== null} onClick={() => void act("login")} className={buttonClass}>
              {busy === "login" ? "Finish signing in in your browser…" : `Sign in to ${label}`}
            </button>
          )}
          {status.installed && status.loggedIn && (
            <p className="text-muted">
              Ready. The chat runs on {label} with Siljangnim's tools; it can read files and search the web, and anything that runs code on
              this computer still asks you first.
            </p>
          )}
          {output && <pre className="whitespace-pre-wrap break-all text-red-300">{output}</pre>}
          <button type="button" onClick={() => void refreshLocalEngines()} className="text-faint hover:text-muted">
            Check again
          </button>
        </>
      )}
    </div>
  );
}

const buttonClass = "rounded-md bg-raised px-3 py-1.5 text-xs text-fg hover:bg-line disabled:opacity-50";

function ApiSettings({ advanced, setAdvanced }: { advanced: boolean; setAdvanced(v: boolean): void }) {
  const settings = useApp((s) => s.settings);
  const { provider } = settings;
  return (
    <>
        <Field label="Provider">
          <Segmented options={PROVIDERS} value={provider} onChange={(p) => updateSettings({ provider: p })} />
        </Field>

        {provider === "custom" && (
          <Field label="Server URL" hint="An OpenAI-compatible endpoint, e.g. http://localhost:11434/v1 (Ollama) or http://localhost:8000/v1 (vLLM).">
            <input
              value={settings.customBaseUrl}
              onChange={(e) => updateSettings({ customBaseUrl: e.target.value })}
              placeholder="http://localhost:8000/v1"
              className={inputClass}
            />
          </Field>
        )}

        {provider === "anthropic" ? (
          <KeyField provider="anthropic" placeholder="sk-ant-…" />
        ) : (
          <KeyField provider="openai" placeholder={provider === "openai" ? "sk-…" : "Optional for local servers"} />
        )}

        {provider === "anthropic" ? (
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
              <Segmented options={EFFORTS.map((e) => ({ id: e, label: e }))} value={settings.effort} onChange={(effort) => updateSettings({ effort })} />
            </Field>
          </>
        ) : (
          <>
            <ModelPicker />
            <button type="button" onClick={() => setAdvanced(!advanced)} className="mb-3 text-xs text-faint hover:text-muted">
              Advanced {advanced ? "▾" : "▸"}
            </button>
            {advanced && (
              <Field label="Max output tokens">
                <input
                  type="number"
                  min={256}
                  value={settings.openaiMaxTokens}
                  onChange={(e) => updateSettings({ openaiMaxTokens: Math.max(256, Number(e.target.value) || 256) })}
                  className={inputClass}
                />
              </Field>
            )}
          </>
        )}
    </>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ id: T; label: string }>; value: T; onChange(v: T): void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-md py-1.5 text-xs ${value === o.id ? "bg-raised text-fg" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type ModelList = { key: string; models: string[]; error: string | null };

/** GPT / custom model: a list from the server's /models, or a text field when there is none. */
function ModelPicker() {
  const settings = useApp((s) => s.settings);
  const hasKey = useApp((s) => s.keyStatus.openai);
  const official = settings.provider === "openai";
  const model = official ? settings.openaiModel : settings.customModel;
  const [typing, setTyping] = useState(false);
  const [pastedKey, setPastedKey] = useState(false);
  const setModel = (id: string) => {
    setPastedKey(looksLikeApiKey(id));
    if (!looksLikeApiKey(id)) updateSettings(official ? { openaiModel: id } : { customModel: id });
  };
  const [list, setList] = useState<ModelList | null>(null);

  // What the list depends on; a result for another key is stale.
  const baseUrl = settings.customBaseUrl.trim();
  const canFetch = official ? hasKey : /^https?:\/\/./.test(baseUrl);
  const requestKey = `${settings.provider}|${baseUrl}|${hasKey}`;

  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchModels(useApp.getState().settings).then(
        (models) => !cancelled && setList({ key: requestKey, models, error: null }),
        (err: unknown) => !cancelled && setList({ key: requestKey, models: [], error: err instanceof Error ? err.message : String(err) }),
      );
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canFetch, requestKey]);

  const current = list?.key === requestKey ? list : null;
  const loading = canFetch && !current;
  const models = current?.models ?? [];
  const showList = models.length > 0 && !typing;

  let hint: string;
  if (pastedKey) hint = "That looks like an API key — paste it into the API key field above. It was not saved here.";
  else if (!canFetch) hint = official ? "Save your API key to load the model list." : "Enter the server URL to load its models.";
  else if (loading) hint = "Loading models…";
  else if (current?.error) hint = `${current.error} — type the model id instead.`;
  else if (!models.length) hint = "The server listed no models; type the model id.";
  else hint = `${models.length} models available.`;

  return (
    <Field label="Model" hint={hint}>
      {showList ? (
        <div className="flex gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClass}>
            {!model && (
              <option value="" disabled>
                Choose a model
              </option>
            )}
            {model && !models.includes(model) && <option value={model}>{model}</option>}
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setTyping(true)} className="shrink-0 text-xs text-faint hover:text-muted" title="Type a model id">
            Type
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={official ? "gpt-…" : "model id"} className={inputClass} />
          {models.length > 0 && (
            <button type="button" onClick={() => setTyping(false)} className="shrink-0 text-xs text-faint hover:text-muted">
              List
            </button>
          )}
        </div>
      )}
    </Field>
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
