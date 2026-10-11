import { Controls } from "./components/Controls";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Viewport } from "./components/Viewport";
import { useApp } from "./state";

export function App() {
  const settingsOpen = useApp((s) => s.settingsOpen);
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <Viewport />
          <Controls />
        </main>
        <Sidebar />
      </div>
      {settingsOpen && <SettingsDialog />}
    </div>
  );
}
