// Controls panel built from what the scene declares: its uniforms (with
// optional widget hints and groups) and the values it publishes (monitors).
import { useRef } from "react";
import { evaluateTrack, keyAt } from "../../scene/gl/keyframes";
import { KEYFRAMABLE, type UniformDef, type UniformValue } from "../../scene/schema";
import { controlSections } from "../controlLayout";
import { CustomPanel } from "./CustomPanel";
import { KEY_SNAP_SECONDS, pulseUniform, setUniformValue, toggleKey } from "../session";
import { useApp } from "../state";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-3";

export function Controls() {
  const uniforms = useApp((s) => s.scene.uniforms);
  const groups = useApp((s) => s.scene.controls);
  const hasMonitors = useApp((s) => Object.keys(s.monitors).length > 0);
  const panel = useApp((s) => s.scene.panel);
  const sections = controlSections({ uniforms, controls: groups });
  if (!sections.length && !hasMonitors && !panel) {
    return (
      <div className="shrink-0 border-t border-line bg-panel px-4 py-3 text-xs text-faint">
        No controls yet. Ask the agent to expose the parameters you want to tweak.
      </div>
    );
  }
  return (
    <div className="max-h-[45%] shrink-0 space-y-4 overflow-y-auto border-t border-line bg-panel px-4 py-3" data-testid="controls">
      {panel && <CustomPanel html={panel.html} height={panel.height} />}
      {sections.map((section) => (
        <section key={section.label ?? ""}>
          {section.label && <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">{section.label}</h3>}
          <div className={GRID}>
            {section.names.map((name) => (
              <Control key={name} name={name} def={uniforms[name]!} />
            ))}
          </div>
        </section>
      ))}
      {hasMonitors && <Monitors />}
    </div>
  );
}

function Monitors() {
  const monitors = useApp((s) => s.monitors);
  return (
    <section data-testid="monitors">
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Monitors</h3>
      <div className={GRID}>
        {Object.entries(monitors).map(([name, m]) => (
          <div key={name} className="flex items-center justify-between gap-3 text-xs" data-monitor={name}>
            <span className="truncate text-muted">{name}</span>
            <span className="flex items-center gap-2">
              {m.history.length > 1 && <Sparkline values={m.history} />}
              <span className="tabular-nums text-fg">{formatMonitor(m.value)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 60},${16 - ((v - min) / span) * 14 - 1}`).join(" ");
  return (
    <svg width={60} height={16} className="text-accent" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}

function formatMonitor(value: number | string | boolean): string {
  if (typeof value !== "number") return String(value);
  if (Number.isInteger(value)) return String(value);
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function Control({ name, def }: { name: string; def: UniformDef }) {
  const label = def.label ?? name.replace(/^u_/, "");
  const set = (value: UniformValue) => setUniformValue(name, value);
  const keys = useApp((s) => s.scene.keyframes[name]);
  const overridden = useApp((s) => s.overrides.includes(name));
  // Only animated controls follow the playhead (and re-render with it).
  const time = useApp((s) => (keys ? s.runtime.time : 0));
  const keyable = KEYFRAMABLE.includes(def.type);
  // Key buttons belong to Timeline mode; Live scenes show plain controls.
  const timelineMode = useApp((s) => Boolean(s.scene.timeline));
  const shown: UniformDef = keys && !overridden ? { ...def, value: evaluateTrack(keys, time) ?? def.value } : def;

  // A button carries its own label.
  if (def.widget === "button") return <Input name={name} def={def} set={set} />;
  return (
    <div className="block text-xs" data-control={name}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-muted" title={name}>
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          {keyable && <span className="tabular-nums text-faint">{format(shown.value as number, def.type as "float" | "int")}</span>}
          {keyable && timelineMode && <KeyButton name={name} label={label} animated={Boolean(keys)} onKey={Boolean(keyAt(keys, time, KEY_SNAP_SECONDS))} />}
        </span>
      </div>
      <Input name={name} def={shown} set={set} />
    </div>
  );
}

/** ◇ adds a key at the playhead; ◆ (on a key) removes it. Accent when the control is animated. */
function KeyButton({ name, label, animated, onKey }: { name: string; label: string; animated: boolean; onKey: boolean }) {
  return (
    <button
      type="button"
      onClick={() => void toggleKey(name)}
      title={onKey ? `Remove ${label} key here` : `Add ${label} key at the playhead`}
      data-key-button={name}
      className={`grid h-4 w-4 place-items-center ${animated ? "text-accent" : "text-faint hover:text-muted"}`}
    >
      <span className={`block h-2 w-2 rotate-45 border border-current ${onKey ? "bg-current" : ""}`} />
    </button>
  );
}

function Input({ name, def, set }: { name: string; def: UniformDef; set: (v: UniformValue) => void }) {
  switch (def.widget) {
    case "knob":
      return <Knob def={def} set={set} />;
    case "pad":
      return <Pad def={def} set={set} />;
    case "select":
      return (
        <select
          value={String(def.value)}
          onChange={(e) => set(Number(e.target.value))}
          className="w-full rounded border border-line bg-bg px-1.5 py-1 outline-none focus:border-muted"
          data-widget="select"
        >
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "button":
      return (
        <button
          type="button"
          onClick={() => pulseUniform(name)}
          className="w-full rounded-md border border-line py-1.5 text-muted hover:border-faint hover:text-fg active:bg-raised"
          data-widget="button"
        >
          {def.label ?? name.replace(/^u_/, "")}
        </button>
      );
  }
  switch (def.type) {
    case "float":
    case "int": {
      const value = def.value as number;
      const min = def.min ?? (def.type === "int" ? 0 : 0);
      const max = def.max ?? Math.max(1, Math.abs(value) * 2);
      const step = def.step ?? (def.type === "int" ? 1 : (max - min) / 200);
      return (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => set(def.type === "int" ? Math.round(Number(e.target.value)) : Number(e.target.value))}
          className="w-full"
        />
      );
    }
    case "bool":
      return (
        <button
          type="button"
          onClick={() => set(!def.value)}
          className={`relative h-5 w-9 rounded-full transition-colors ${def.value ? "bg-accent" : "bg-line"}`}
          aria-pressed={Boolean(def.value)}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-fg transition-all ${def.value ? "left-[18px]" : "left-0.5"}`} />
        </button>
      );
    case "color": {
      const rgb = def.value as number[];
      return (
        <input
          type="color"
          value={toHex(rgb)}
          onChange={(e) => set([...fromHex(e.target.value), ...rgb.slice(3)])}
          className="h-7 w-full cursor-pointer rounded border border-line bg-transparent"
        />
      );
    }
    default: {
      const values = def.value as number[];
      return (
        <div className="flex gap-1">
          {values.map((v, i) => (
            <input
              key={i}
              type="number"
              step={def.step ?? 0.01}
              value={v}
              onChange={(e) => {
                const next = [...values];
                next[i] = Number(e.target.value);
                set(next);
              }}
              className="w-full min-w-0 rounded border border-line bg-bg px-1.5 py-1 tabular-nums outline-none focus:border-muted"
            />
          ))}
        </div>
      );
    }
  }
}

/** Rotary control: drag up/down (Shift for fine steps). */
function Knob({ def, set }: { def: UniformDef; set: (v: UniformValue) => void }) {
  const value = def.value as number;
  const { min, max } = range(def);
  const drag = useRef<{ y: number; value: number } | null>(null);
  const t = (value - min) / (max - min || 1);
  const angle = -135 + t * 270;
  const arc = (a: number) => [20 + 15 * Math.sin((a * Math.PI) / 180), 20 - 15 * Math.cos((a * Math.PI) / 180)].join(" ");
  return (
    <div
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      data-widget="knob"
      className="mx-auto h-10 w-10 cursor-ns-resize touch-none select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const per = (max - min) / (e.shiftKey ? 600 : 150);
        set(snap(def, drag.current.value + (drag.current.y - e.clientY) * per));
      }}
      onPointerUp={() => (drag.current = null)}
      onKeyDown={(e) => {
        const step = def.step ?? (max - min) / 100;
        if (e.key === "ArrowUp" || e.key === "ArrowRight") set(snap(def, value + step));
        if (e.key === "ArrowDown" || e.key === "ArrowLeft") set(snap(def, value - step));
      }}
    >
      <svg viewBox="0 0 40 40" className="h-full w-full">
        <path d={`M ${arc(-135)} A 15 15 0 1 1 ${arc(135)}`} fill="none" stroke="var(--color-line)" strokeWidth={3} strokeLinecap="round" />
        {t > 0.001 && (
          <path d={`M ${arc(-135)} A 15 15 0 ${angle + 135 > 180 ? 1 : 0} 1 ${arc(angle)}`} fill="none" stroke="var(--color-accent)" strokeWidth={3} strokeLinecap="round" />
        )}
        <line x1={20} y1={20} x2={arc(angle).split(" ")[0]} y2={arc(angle).split(" ")[1]} stroke="var(--color-fg)" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** 2D pad for vec2: x right, y up, both within min..max (default 0..1). */
function Pad({ def, set }: { def: UniformDef; set: (v: UniformValue) => void }) {
  const [x, y] = def.value as number[];
  const min = def.min ?? 0;
  const max = def.max ?? 1;
  const norm = (v: number) => (v - min) / (max - min || 1);
  const update = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    set([min + nx * (max - min), min + ny * (max - min)]);
  };
  return (
    <div
      data-widget="pad"
      className="relative h-24 w-full cursor-crosshair touch-none rounded border border-line bg-bg"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e);
      }}
    >
      <span
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-fg bg-accent"
        style={{ left: `${norm(x ?? 0) * 100}%`, bottom: `${norm(y ?? 0) * 100}%` }}
      />
    </div>
  );
}

function range(def: UniformDef): { min: number; max: number } {
  const value = def.value as number;
  return { min: def.min ?? 0, max: def.max ?? Math.max(1, Math.abs(value) * 2) };
}

function snap(def: UniformDef, v: number): number {
  const { min, max } = range(def);
  const clamped = Math.min(max, Math.max(min, v));
  return def.type === "int" ? Math.round(clamped) : clamped;
}

function format(value: number, type: "float" | "int"): string {
  return type === "int" ? String(value) : value.toFixed(Math.abs(value) >= 100 ? 0 : 2);
}

function toHex(rgb: number[]): string {
  return "#" + rgb.slice(0, 3).map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
