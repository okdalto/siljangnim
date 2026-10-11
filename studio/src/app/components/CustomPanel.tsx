// The scene's custom panel (scene.panel): agent-written HTML in an iframe
// with an opaque origin. See app/panel.ts for what it can and can't do.
import { useEffect, useMemo, useRef, useState } from "react";
import { panelDocument, panelValues, readPanelMessage } from "../panel";
import { setUniformValue } from "../session";
import { useApp } from "../state";

const SEND_EVERY_MS = 100;

export function CustomPanel({ html, height }: { html: string; height: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const srcdoc = useMemo(() => panelDocument(html), [html]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const send = () => {
      const { scene, monitors } = useApp.getState();
      const uniforms = Object.fromEntries(Object.entries(scene.uniforms).map(([name, def]) => [name, def.value]));
      frame.current?.contentWindow?.postMessage(panelValues(uniforms, monitors), "*");
    };
    const onMessage = (e: MessageEvent) => {
      // The panel's origin is opaque; it is recognized by its window instead.
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const message = readPanelMessage(e.data, useApp.getState().scene);
      if (!message) return;
      if ("error" in message) setProblem(message.error);
      else if (message.type === "ready") send();
      else setUniformValue(message.name, message.value);
    };
    window.addEventListener("message", onMessage);
    // Values follow the scene (controls, monitors) at a steady, cheap rate.
    let last = "";
    const timer = setInterval(() => {
      const { scene, monitors } = useApp.getState();
      const key = JSON.stringify([scene.uniforms, monitors]);
      if (key !== last) {
        last = key;
        send();
      }
    }, SEND_EVERY_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [srcdoc]);

  return (
    <section data-testid="custom-panel">
      <iframe
        ref={frame}
        title="Scene panel"
        sandbox="allow-scripts"
        srcDoc={srcdoc}
        className="block w-full rounded-md border border-line bg-bg"
        style={{ height }}
      />
      {problem && <p className="mt-1 text-[11px] text-warn">Panel: {problem}</p>}
    </section>
  );
}
