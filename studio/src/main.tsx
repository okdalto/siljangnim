import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./app/App";
import { boot } from "./app/session";

// The web deploy serves the same files on the scene origin; scene code runs
// there, so the app (keys, projects) must never run on it.
const onSceneOrigin = Boolean(import.meta.env.VITE_SCENE_ORIGIN) && location.origin === import.meta.env.VITE_SCENE_ORIGIN;

if (onSceneOrigin) {
  document.getElementById("root")!.textContent = "This address only hosts scenes for Siljangnim.";
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  void boot();
}
