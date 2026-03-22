export const FORMATS = ["MP4", "WebM", "PNG"];
export const FPS_PRESETS = [24, 30, 60];
export const FPS_MIN = 1;
export const FPS_MAX = 240;
export const QUALITIES = ["Low", "Med", "High", "Ultra"];
export const MODES = ["Realtime", "Offline"];

export const QUALITY_MULTIPLIER = { Low: 4, Med: 8, High: 12, Ultra: 20 };

export const RESOLUTION_PRESETS = [
  { label: "Canvas", w: 0, h: 0 },
  { label: "1920×1080", w: 1920, h: 1080 },
  { label: "1280×720", w: 1280, h: 720 },
  { label: "960×540", w: 960, h: 540 },
  { label: "640×360", w: 640, h: 360 },
];
