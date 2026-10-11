import { useEffect } from "react";
import { Controls } from "./components/Controls";
import { DropOverlay } from "./components/DropOverlay";
import { ExamplesDialog } from "./components/Examples";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Viewport } from "./components/Viewport";
import { Timeline } from "./components/Timeline";
import { redo, undo } from "./session";
import { useApp } from "./state";

/** Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z (or Ctrl+Y) for controls and keyframes; text fields keep their own undo. */
function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const typing = target?.isContentEditable || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !["range", "color", "checkbox", "button"].includes(target.type));
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y" && !e.metaKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  const settingsOpen = useApp((s) => s.settingsOpen);
  const examplesOpen = useApp((s) => s.examplesOpen);
  useUndoShortcuts();
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <Viewport />
          <Timeline />
          <Controls />
        </main>
        <Sidebar />
      </div>
      <DropOverlay />
      {settingsOpen && <SettingsDialog />}
      {examplesOpen && <ExamplesDialog />}
    </div>
  );
}
