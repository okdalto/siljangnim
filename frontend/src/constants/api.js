export const API_BASE = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000`
  : "";
