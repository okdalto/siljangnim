import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// Register Service Worker in browser-only mode (for /api/uploads/* interception)
if (import.meta.env.VITE_MODE === "browser" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// Stale chunk detection: after a new deployment, cached HTML may reference
// old JS chunk filenames that no longer exist on the server (HTTP 404).
// Detect this and reload once to fetch the latest build.
{
  const RELOAD_KEY = "__chunk_reload";
  const handleChunkError = (e) => {
    const msg = e?.message || e?.reason?.message || "";
    if (
      (msg.includes("Failed to fetch dynamically imported module") ||
       msg.includes("Importing a module script failed") ||
       msg.includes("error loading dynamically imported module")) &&
      !sessionStorage.getItem(RELOAD_KEY)
    ) {
      sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    }
  };
  window.addEventListener("error", (e) => handleChunkError(e));
  window.addEventListener("unhandledrejection", (e) => handleChunkError(e));
  // Clear the flag on successful load so future deploys can trigger reload again
  window.addEventListener("load", () => sessionStorage.removeItem(RELOAD_KEY));
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
