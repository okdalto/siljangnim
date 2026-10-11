// Catches files dropped anywhere in the window. It has to cover the scene
// iframe too: drag events over the iframe go to the scene document, not here.
import { useEffect, useState } from "react";
import { uploadAssets } from "../session";

const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));

export function DropOverlay() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (hasFiles(e)) setActive(true);
    };
    window.addEventListener("dragenter", onEnter);
    return () => window.removeEventListener("dragenter", onEnter);
  }, []);

  if (!active) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-bg/80 backdrop-blur-sm"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        // Leaving to a child of the overlay isn't leaving the window.
        if (e.relatedTarget === null) setActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        void uploadAssets([...e.dataTransfer.files]);
      }}
    >
      <div className="pointer-events-none rounded-2xl border-2 border-dashed border-faint px-10 py-8 text-center">
        <p className="text-sm text-fg">Drop to add assets</p>
        <p className="mt-1 text-xs text-muted">Images, video, audio, fonts, 3D models and data files · up to 200 MB each</p>
      </div>
    </div>
  );
}
