import { useState, useRef, useEffect, useContext, useCallback } from "react";
import SettingsContext from "../contexts/SettingsContext.js";
import useClickOutside from "../hooks/useClickOutside.js";

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

/* ── Main component ─────────────────────────────────────────────── */

export default function SettingsMenu({ onChangeApiKey }) {
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
          className="absolute top-full mt-1 right-0 w-64 rounded-lg shadow-xl p-3 text-xs z-50"
          style={{
            backgroundColor: "var(--chrome-bg-elevated)",
            border: "1px solid var(--chrome-border)",
            color: "var(--chrome-text)",
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
        </div>
      )}
    </div>
  );
}
