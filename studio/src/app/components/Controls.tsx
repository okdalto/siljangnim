// Live controls generated from the scene's uniforms.
import { evaluateTrack, keyAt } from "../../scene/gl/keyframes";
import { KEYFRAMABLE, type UniformDef, type UniformValue } from "../../scene/schema";
import { KEY_SNAP_SECONDS, setUniformValue, toggleKey } from "../session";
import { useApp } from "../state";

export function Controls() {
  const uniforms = useApp((s) => s.scene.uniforms);
  const entries = Object.entries(uniforms);
  if (!entries.length) {
    return (
      <div className="shrink-0 border-t border-line bg-panel px-4 py-3 text-xs text-faint">
        No controls yet. Ask the agent to expose the parameters you want to tweak.
      </div>
    );
  }
  return (
    <div className="max-h-[38%] shrink-0 overflow-y-auto border-t border-line bg-panel px-4 py-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-3">
        {entries.map(([name, def]) => (
          <Control key={name} name={name} def={def} />
        ))}
      </div>
    </div>
  );
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
      <Input def={shown} set={set} />
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

function Input({ def, set }: { def: UniformDef; set: (v: UniformValue) => void }) {
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

function format(value: number, type: "float" | "int"): string {
  return type === "int" ? String(value) : value.toFixed(Math.abs(value) >= 100 ? 0 : 2);
}

function toHex(rgb: number[]): string {
  return "#" + rgb.slice(0, 3).map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}
