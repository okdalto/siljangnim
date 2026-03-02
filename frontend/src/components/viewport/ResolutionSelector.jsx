import { useState, useEffect, useRef } from "react";

const RESOLUTION_PRESETS = [
  { label: "Auto", w: 0, h: 0 },
  { label: "3840 \u00d7 2160", w: 3840, h: 2160 },
  { label: "2560 \u00d7 1440", w: 2560, h: 1440 },
  { label: "1920 \u00d7 1080", w: 1920, h: 1080 },
  { label: "1280 \u00d7 720",  w: 1280, h: 720 },
  { label: "1080 \u00d7 1080", w: 1080, h: 1080 },
  { label: "1080 \u00d7 1920", w: 1080, h: 1920 },
  { label: "854 \u00d7 480",   w: 854,  h: 480 },
  { label: "640 \u00d7 480",   w: 640,  h: 480 },
];

export default function ResolutionSelector({ resolution, fixedResolution, onResolutionChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const menuRef = useRef(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [showMenu]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu((v) => !v)}
        className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        title="Change render resolution"
      >
        {resolution[0]}&times;{resolution[1]}{fixedResolution ? "" : " (auto)"}
      </button>
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl py-1 min-w-[150px] nodrag">
          {RESOLUTION_PRESETS.map((p) => {
            const isActive = p.w === 0
              ? !fixedResolution
              : fixedResolution?.[0] === p.w && fixedResolution?.[1] === p.h;
            return (
              <button
                key={p.label}
                onClick={() => {
                  onResolutionChange(p.w === 0 ? null : [p.w, p.h]);
                  setShowMenu(false);
                }}
                className={`w-full text-left px-3 py-1 text-[11px] tabular-nums transition-colors ${
                  isActive
                    ? "text-indigo-400 bg-indigo-950"
                    : "text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <div className="border-t border-zinc-600 mt-1 pt-1 px-2 pb-1">
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const w = parseInt(customW, 10);
                const h = parseInt(customH, 10);
                if (w > 0 && h > 0) {
                  onResolutionChange([w, h]);
                  setShowMenu(false);
                }
              }}
            >
              <input
                type="text"
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="W"
                className="w-14 text-[11px] text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-zinc-300 outline-none focus:border-indigo-500 tabular-nums"
              />
              <span className="text-[10px] text-zinc-500">&times;</span>
              <input
                type="text"
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="H"
                className="w-14 text-[11px] text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-zinc-300 outline-none focus:border-indigo-500 tabular-nums"
              />
              <button
                type="submit"
                className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-700 hover:bg-zinc-600 rounded px-1.5 py-0.5 transition-colors"
              >
                OK
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
