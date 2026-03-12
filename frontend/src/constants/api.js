export const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : "";

export const BROWSER_ONLY = import.meta.env.VITE_MODE === "browser";
