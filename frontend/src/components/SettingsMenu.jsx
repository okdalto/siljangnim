import { useState, useRef, useEffect, useContext, useCallback, Fragment } from "react";
import SettingsContext from "../contexts/SettingsContext.js";
import useClickOutside from "../hooks/useClickOutside.js";

const BROWSER_ONLY = import.meta.env.VITE_MODE === "browser";

/* ── Helper components ──────────────────────────────────────────── */

function SectionLabel({ children }) {
  return (
    <div
      className="text-[10px] uppercase tracking-wide mb-2 mt-1"
      style={{ color: "var(--chrome-text-muted)" }}
    >
      {children}
    </div>
  );
}

function SettingRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 min-h-[28px]">
      <span style={{ color: "var(--chrome-text)" }} className="text-xs whitespace-nowrap">
        {label}
      </span>
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0"
      style={{
        backgroundColor: checked ? "var(--accent)" : "var(--input-bg)",
      }}
    >
      <span
        className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform"
        style={{
          left: "2px",
          transform: checked ? "translateX(14px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, width = "w-14" }) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = useCallback(() => {
    let v = parseFloat(local);
    if (isNaN(v)) {
      setLocal(String(value));
      return;
    }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(step === 1 ? Math.round(v) : v);
    setLocal(String(step === 1 ? Math.round(v) : v));
  }, [local, value, onChange, min, max, step]);

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.target.blur();
      }}
      className={`${width} text-xs text-center rounded px-1 py-0.5 outline-none`}
      style={{
        backgroundColor: "var(--input-bg)",
        border: "1px solid var(--input-border)",
        color: "var(--input-text)",
      }}
    />
  );
}

/* ── Update section ─────────────────────────────────────────────── */

function UpdateSection() {
  const [status, setStatus] = useState("idle"); // idle | checking | checked | updating | done | error
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  const checkForUpdates = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const res = await fetch("/api/updates/check");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setStatus("error");
      } else {
        setInfo(data);
        setStatus("checked");
      }
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    setStatus("updating");
    setError(null);
    try {
      const res = await fetch("/api/updates/apply", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        setInfo((prev) => ({ ...prev, dirty_files: data.dirty_files }));
        setStatus("error");
      } else {
        setInfo((prev) => ({ ...prev, ...data, update_available: false }));
        setStatus("done");
      }
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }, []);

  return (
    <div className="space-y-2">
      {/* Check button */}
      {(status === "idle" || status === "error") && (
        <button
          onClick={checkForUpdates}
          className="w-full text-left px-2 py-1.5 rounded text-xs transition-colors hover:bg-white/5"
          style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
        >
          Check for updates
        </button>
      )}

      {/* Checking spinner */}
      {status === "checking" && (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
          <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>Checking...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-[11px] px-2 py-1.5 rounded leading-relaxed" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
          {error}
          {info?.dirty_files && (
            <div className="mt-1 font-mono text-[10px] opacity-70">
              {info.dirty_files.slice(0, 5).map((f, i) => <div key={i}>{f}</div>)}
              {info.dirty_files.length > 5 && <div>...and {info.dirty_files.length - 5} more</div>}
            </div>
          )}
        </div>
      )}

      {/* Result: up to date */}
      {status === "checked" && info && !info.update_available && (
        <div className="text-[11px] px-2 py-1.5 rounded" style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80" }}>
          Up to date ({info.local.sha} on {info.branch})
        </div>
      )}

      {/* Result: update available */}
      {status === "checked" && info?.update_available && (
        <div className="space-y-2">
          <div className="text-[11px] px-2 py-2 rounded space-y-1" style={{ background: "var(--input-bg)" }}>
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--chrome-text-muted)" }}>Local</span>
              <span className="font-mono" style={{ color: "var(--chrome-text)" }}>{info.local.sha}</span>
            </div>
            <div className="text-[10px] truncate" style={{ color: "var(--chrome-text-muted)" }}>{info.local.message}</div>
            <div className="flex items-center justify-between mt-1">
              <span style={{ color: "var(--chrome-text-muted)" }}>Remote</span>
              <span className="font-mono" style={{ color: "var(--chrome-text)" }}>{info.remote.sha}</span>
            </div>
            <div className="text-[10px] truncate" style={{ color: "var(--chrome-text-muted)" }}>{info.remote.message}</div>
            <div className="text-[10px] mt-1" style={{ color: "#fbbf24" }}>
              {info.commits_behind} commit{info.commits_behind > 1 ? "s" : ""} behind
              {info.commits_ahead > 0 && `, ${info.commits_ahead} ahead`}
            </div>
          </div>

          {info.has_local_changes && (
            <div className="text-[10px] px-2 py-1.5 rounded" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
              Local changes detected. Commit or stash before updating.
            </div>
          )}

          {!info.can_fast_forward && !info.has_local_changes && info.commits_ahead > 0 && (
            <div className="text-[10px] px-2 py-1.5 rounded" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
              Local branch has diverged. Manual merge required.
            </div>
          )}

          {info.can_fast_forward && !info.has_local_changes && (
            <button
              onClick={applyUpdate}
              className="w-full px-2 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ background: "#238636", color: "#fff" }}
            >
              Update local app
            </button>
          )}
        </div>
      )}

      {/* Updating spinner */}
      {status === "updating" && (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-3 h-3 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
          <span className="text-xs" style={{ color: "var(--chrome-text-muted)" }}>Updating...</span>
        </div>
      )}

      {/* Done */}
      {status === "done" && info && (
        <div className="space-y-2">
          <div className="text-[11px] px-2 py-1.5 rounded" style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80" }}>
            Updated to {info.new_sha}
          </div>
          {info.needs_dependency_sync && (
            <div className="text-[10px] px-2 py-1.5 rounded" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
              Dependencies changed — run <span className="font-mono">npm install</span> in frontend/ and restart.
            </div>
          )}
          {info.needs_restart && !info.needs_dependency_sync && (
            <div className="text-[10px] px-2 py-1.5 rounded" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
              Restart the app to apply changes.
            </div>
          )}
        </div>
      )}

      {/* Re-check after done/error */}
      {(status === "done" || (status === "error" && info)) && (
        <button
          onClick={checkForUpdates}
          className="text-[10px] px-2 py-1 transition-colors hover:underline"
          style={{ color: "var(--chrome-text-muted)" }}
        >
          Check again
        </button>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */

const PROVIDER_LABELS = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", glm: "GLM", custom: "Custom" };
const PROVIDER_MODELS = {
  anthropic: [
    { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    { id: "claude-opus-4-6", label: "Opus 4.6" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
  ],
  openai: [
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "o3", label: "o3" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  ],
  glm: [
    { id: "glm-4-plus", label: "GLM-4 Plus" },
  ],
};
const PROMPT_MODE_LABELS = { hybrid: "Hybrid", code: "Code", conversational: "Conversational" };

const FEEDBACK_REPO = "okdalto/siljangnim";

export default function SettingsMenu({ onChangeApiKey, backendTarget, onBackendTargetChange, promptMode, onPromptModeChange, selectedModel, onModelChange, provider, githubAuth }) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const { settings, update } = useContext(SettingsContext);

  useClickOutside(popoverRef, open, () => setOpen(false));

  return (
    <div ref={popoverRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-6 h-6 transition-colors"
        style={{ color: "var(--chrome-text-secondary)" }}
        title="Settings"
      >
        {/* Gear icon (Heroicons Mini cog-6-tooth) */}
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 right-0 w-64 rounded-lg shadow-xl p-3 text-xs z-50 overflow-y-auto"
          style={{
            backgroundColor: "var(--chrome-bg-elevated)",
            border: "1px solid var(--chrome-border)",
            color: "var(--chrome-text)",
            maxHeight: "calc(100vh - 140px)",
          }}
        >
          {/* ── Appearance ────────────────────────────────── */}
          <SectionLabel>Appearance</SectionLabel>
          <SettingRow label="Theme">
            <div className="flex gap-0.5">
              {["dark", "light"].map((t) => (
                <button
                  key={t}
                  onClick={() => update("theme", t)}
                  className="text-xs px-2.5 py-1 rounded transition-colors capitalize"
                  style={{
                    backgroundColor:
                      settings.theme === t ? "var(--accent)" : "var(--input-bg)",
                    color:
                      settings.theme === t ? "var(--accent-text)" : "var(--chrome-text-secondary)",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </SettingRow>

          <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />

          {/* ── Canvas ─────────────────────────────────────── */}
          <SectionLabel>Canvas</SectionLabel>
          <SettingRow label="Background">
            <input
              type="color"
              value={settings.canvasBg}
              onChange={(e) => update("canvasBg", e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border-0 p-0"
              style={{ backgroundColor: "transparent" }}
            />
          </SettingRow>

          <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />

          {/* ── Grid & Snap ────────────────────────────────── */}
          <SectionLabel>Grid & Snap</SectionLabel>
          <SettingRow label="Grid gap">
            <NumberInput value={settings.gridGap} onChange={(v) => update("gridGap", v)} min={4} max={200} />
          </SettingRow>
          <SettingRow label="Dot size">
            <NumberInput value={settings.gridDotSize} onChange={(v) => update("gridDotSize", v)} min={0.5} max={10} step={0.5} />
          </SettingRow>
          <SettingRow label="Snap">
            <ToggleSwitch checked={settings.snapEnabled} onChange={(v) => update("snapEnabled", v)} />
          </SettingRow>
          {settings.snapEnabled && (
            <SettingRow label="Snap threshold">
              <NumberInput value={settings.snapThreshold} onChange={(v) => update("snapThreshold", v)} min={2} max={50} />
            </SettingRow>
          )}

          <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />

          {/* ── New Project Defaults ───────────────────────── */}
          <SectionLabel>New Project Defaults</SectionLabel>
          <SettingRow label="Duration (s)">
            <NumberInput value={settings.defaultDuration} onChange={(v) => update("defaultDuration", v)} min={0} max={3600} />
          </SettingRow>
          <SettingRow label="Loop">
            <ToggleSwitch checked={settings.defaultLoop} onChange={(v) => update("defaultLoop", v)} />
          </SettingRow>

          <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />

          {/* ── AI Provider ────────────────────────────────── */}
          <SectionLabel>AI Provider</SectionLabel>
          <SettingRow label="Current provider">
            <button
              onClick={() => {
                onChangeApiKey();
                setOpen(false);
              }}
              className="text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
            >
              Change
            </button>
          </SettingRow>

          {/* ── Renderer (mobile-only, desktop shows in toolbar) ── */}
          {onBackendTargetChange && (
            <>
              <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />
              <SectionLabel>Renderer</SectionLabel>
              <SettingRow label="Backend">
                <div className="flex gap-0.5 rounded overflow-hidden" style={{ border: "1px solid var(--chrome-border)" }}>
                  {["auto", "webgl", "webgpu"].map((t) => (
                    <button
                      key={t}
                      onClick={() => onBackendTargetChange(t)}
                      className="px-2 py-0.5 text-[10px] transition-colors"
                      style={{
                        background: backendTarget === t ? "var(--accent-color, #6366f1)" : "transparent",
                        color: backendTarget === t ? "#fff" : "var(--chrome-text-muted)",
                      }}
                    >
                      {t === "auto" ? "Auto" : t === "webgl" ? "WebGL2" : "WebGPU"}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </>
          )}

          {/* ── Prompt Mode (mobile-only) ── */}
          {onPromptModeChange && (
            <>
              <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />
              <SectionLabel>Prompt Mode</SectionLabel>
              <SettingRow label="Mode">
                <div className="flex gap-0.5 rounded overflow-hidden" style={{ border: "1px solid var(--chrome-border)" }}>
                  {Object.entries(PROMPT_MODE_LABELS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => onPromptModeChange(key)}
                      className="px-2 py-0.5 text-[10px] transition-colors"
                      style={{
                        background: promptMode === key ? "var(--accent-color, #6366f1)" : "transparent",
                        color: promptMode === key ? "#fff" : "var(--chrome-text-muted)",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </>
          )}

          {/* ── Model (mobile-only) ── */}
          {onModelChange && provider && PROVIDER_MODELS[provider] && (
            <>
              <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />
              <SectionLabel>Model</SectionLabel>
              <SettingRow label={PROVIDER_LABELS[provider] || provider}>
                <div className="flex flex-col gap-0.5">
                  {PROVIDER_MODELS[provider].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onModelChange(m.id)}
                      className="text-[10px] px-2 py-0.5 rounded text-right transition-colors"
                      style={{
                        background: selectedModel === m.id ? "var(--accent-color, #6366f1)" : "transparent",
                        color: selectedModel === m.id ? "#fff" : "var(--chrome-text-secondary)",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </SettingRow>
            </>
          )}

          {/* ── App Update ──────────────────────────────────── */}
          {!BROWSER_ONLY && (
            <>
              <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />
              <SectionLabel>App Update</SectionLabel>
              <UpdateSection />
            </>
          )}

          {/* ── Feedback (mobile-only, replaces floating button) ── */}
          {githubAuth && (
            <>
              <hr className="my-2.5" style={{ borderColor: "var(--chrome-border)" }} />
              <SectionLabel>Feedback</SectionLabel>
              <button
                onClick={() => {
                  const params = new URLSearchParams({ template: "bug_report.md" });
                  window.open(`https://github.com/${FEEDBACK_REPO}/issues/new?${params}`, "_blank");
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 rounded text-xs transition-colors hover:bg-white/5 flex items-center gap-2"
                style={{ color: "var(--chrome-text-secondary)", background: "var(--input-bg)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                  <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 00-1.032-.211 50.89 50.89 0 00-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 002.433 3.984L7.28 21.53A.75.75 0 016 21v-4.03a48.527 48.527 0 01-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979z" />
                  <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 001.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0015.75 7.5z" />
                </svg>
                Send Feedback
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
