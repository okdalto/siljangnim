import { useState, useEffect, useCallback, useMemo } from "react";
import { saveJson } from "../utils/localStorage.js";

const STORAGE_KEY = "app-settings";

const DEFAULTS = {
  theme: "dark",
  canvasBg: "#000000",
  gridGap: 24,
  gridDotSize: 1,
  snapEnabled: true,
  snapThreshold: 8,
  defaultDuration: 30,
  defaultLoop: true,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

/** @returns {{ settings: Record<string, any>, update: (key: string, value: any) => void }} */
export default function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  // Persist to localStorage
  useEffect(() => {
    saveJson(STORAGE_KEY, settings);
  }, [settings]);

  // Apply data-theme attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme);
  }, [settings.theme]);

  const update = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  return useMemo(() => ({ settings, update }), [settings, update]);
}
