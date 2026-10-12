// The viewport's frame: fill the window, keep an aspect ratio (landscape, portrait, square…), or render
// at exact pixels. Exact sizes also set the scene's resolution, so ctx.resolution and captures match.
export type Frame = { kind: "fit" } | { kind: "aspect"; w: number; h: number } | { kind: "pixels"; width: number; height: number };

export const FIT: Frame = { kind: "fit" };

export const FRAME_PRESETS: Array<{ label: string; group: string; frame: Frame }> = [
  { label: "Fit window", group: "", frame: FIT },
  { label: "16:9", group: "Landscape", frame: { kind: "aspect", w: 16, h: 9 } },
  { label: "4:3", group: "Landscape", frame: { kind: "aspect", w: 4, h: 3 } },
  { label: "9:16", group: "Portrait", frame: { kind: "aspect", w: 9, h: 16 } },
  { label: "4:5", group: "Portrait", frame: { kind: "aspect", w: 4, h: 5 } },
  { label: "1:1", group: "Square", frame: { kind: "aspect", w: 1, h: 1 } },
  { label: "1920×1080", group: "Exact", frame: { kind: "pixels", width: 1920, height: 1080 } },
  { label: "1080×1920", group: "Exact", frame: { kind: "pixels", width: 1080, height: 1920 } },
  { label: "1080×1080", group: "Exact", frame: { kind: "pixels", width: 1080, height: 1080 } },
  { label: "3840×2160", group: "Exact", frame: { kind: "pixels", width: 3840, height: 2160 } },
];

export const MAX_PIXELS = 7680;

export function frameLabel(frame: Frame): string {
  if (frame.kind === "fit") return "Fit";
  if (frame.kind === "aspect") return `${frame.w}:${frame.h}`;
  return `${frame.width}×${frame.height}`;
}

/** "1280x720", "1280 × 720", "16:9" → a frame; null when it isn't one. */
export function parseFrame(text: string): Frame | null {
  const t = text.trim().toLowerCase();
  const px = t.match(/^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/);
  if (px) {
    const width = Number(px[1]), height = Number(px[2]);
    return width <= MAX_PIXELS && height <= MAX_PIXELS ? { kind: "pixels", width, height } : null;
  }
  const ar = t.match(/^(\d{1,3}(?:\.\d+)?)\s*:\s*(\d{1,3}(?:\.\d+)?)$/);
  if (ar && Number(ar[1]) > 0 && Number(ar[2]) > 0) return { kind: "aspect", w: Number(ar[1]), h: Number(ar[2]) };
  return null;
}

/** The box (CSS px, centered) the scene occupies inside the available area; null fills it. */
export function frameBox(frame: Frame, avail: { width: number; height: number }): { width: number; height: number } | null {
  if (frame.kind === "fit" || avail.width <= 0 || avail.height <= 0) return null;
  const aspect = frame.kind === "aspect" ? frame.w / frame.h : frame.width / frame.height;
  const width = Math.min(avail.width, avail.height * aspect);
  return { width: Math.floor(width), height: Math.floor(width / aspect) };
}

/** The exact render size the runtime should use, if any. */
export function frameResolution(frame: Frame): { width: number; height: number } | null {
  return frame.kind === "pixels" ? { width: frame.width, height: frame.height } : null;
}

export function sameFrame(a: Frame, b: Frame): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function readFrame(value: unknown): Frame {
  if (typeof value !== "object" || value === null) return FIT;
  const v = value as Record<string, unknown>;
  if (v.kind === "aspect" && Number(v.w) > 0 && Number(v.h) > 0) return { kind: "aspect", w: Number(v.w), h: Number(v.h) };
  if (v.kind === "pixels" && Number(v.width) > 0 && Number(v.height) > 0 && Number(v.width) <= MAX_PIXELS && Number(v.height) <= MAX_PIXELS) {
    return { kind: "pixels", width: Number(v.width), height: Number(v.height) };
  }
  return FIT;
}
