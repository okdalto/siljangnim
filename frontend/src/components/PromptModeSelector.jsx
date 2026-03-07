import { useState, useRef, useEffect } from "react";
import { STYLE_PRESETS } from "../engine/promptMode.js";

const PRESET_COLORS = {
  "Dreamy Clouds": { bg: "rgba(224,195,252,0.15)", border: "rgba(224,195,252,0.4)", text: "#e0c3fc" },
  "Neon Geometry": { bg: "rgba(255,0,110,0.15)", border: "rgba(255,0,110,0.4)", text: "#ff006e" },
  "Organic Flow": { bg: "rgba(96,108,56,0.15)", border: "rgba(96,108,56,0.4)", text: "#a3b18a" },
  "Retro CRT": { bg: "rgba(247,37,133,0.15)", border: "rgba(247,37,133,0.4)", text: "#f72585" },
  "Dark Energy": { bg: "rgba(65,90,119,0.15)", border: "rgba(65,90,119,0.4)", text: "#778da9" },
  "Particle Storm": { bg: "rgba(255,107,53,0.15)", border: "rgba(255,107,53,0.4)", text: "#ff6b35" },
};

const MODES = [
  {
    id: "technical",
    label: "Technical",
    shortLabel: "Tech",
    description: "Direct WebGL2 / shader instructions",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/30",
  },
  {
    id: "hybrid",
    label: "Hybrid",
    shortLabel: "Hybrid",
    description: "Mix of technical and artistic language",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/30",
  },
  {
    id: "art",
    label: "Art",
    shortLabel: "Art",
    description: "Describe mood, style, feeling — AI interprets",
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/30",
  },
];

export default function PromptModeSelector({ mode, onModeChange, onPresetSelect, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = MODES.find((m) => m.id === mode) || MODES[1];

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  if (compact) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${current.bg} ${current.color}`}
          title={`Prompt Mode: ${current.label}`}
        >
          {current.shortLabel}
        </button>
        {open && (
          <div
            className="absolute top-full mt-1 right-0 z-50 rounded-lg border shadow-xl p-1 min-w-[200px]"
            style={{ background: "var(--node-bg)", borderColor: "var(--node-border)" }}
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => { onModeChange(m.id); setOpen(false); }}
                className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors ${
                  m.id === mode ? m.bg + " " + m.color : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <span className="font-medium">{m.label}</span>
                <span className="ml-1.5 text-[9px] text-zinc-500">{m.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              m.id === mode ? m.bg + " " + m.color : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "art" && (
        <div className="flex flex-wrap gap-1">
          {Object.keys(STYLE_PRESETS).map((name) => {
            const c = PRESET_COLORS[name] || { bg: "rgba(255,255,255,0.1)", border: "rgba(255,255,255,0.2)", text: "#ccc" };
            return (
              <button
                key={name}
                onClick={() => onPresetSelect?.(name)}
                className="text-[9px] px-2 py-0.5 rounded-full border transition-colors hover:brightness-125"
                style={{ background: c.bg, borderColor: c.border, color: c.text }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
