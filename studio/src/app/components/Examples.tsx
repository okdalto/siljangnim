// Example gallery: opens one as a new project (scene + assets from /examples).
import { CATALOG, type CatalogEntry } from "../../catalog/catalog";
import { EXAMPLES, type Example } from "../../project/examples";
import { openExample, setExamplesOpen } from "../session";
import { XIcon } from "./icons";

export function ExamplesDialog() {
  const close = () => setExamplesOpen(false);
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col rounded-xl border border-line bg-panel shadow-2xl" data-testid="examples">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">Examples</h2>
            <p className="text-xs text-muted">Each one opens as a new project you can change, or ask the agent to change.</p>
          </div>
          <button type="button" onClick={close} className="text-muted hover:text-fg">
            <XIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Section
            title="Open source in Siljangnim"
            note="Each one is an open-source tool connected to Siljangnim: a library running in the scene, or a Python package or program the agent ran through a recipe."
            examples={EXAMPLES.filter((e) => e.uses?.length)}
            gpu={gpu}
          />
          <Section title="Made in Siljangnim" note="Scenes written by agents and by hand." examples={EXAMPLES.filter((e) => !e.uses?.length)} gpu={gpu} />
        </div>
      </div>
    </div>
  );
}

const HOW: Record<CatalogEntry["tier"], string> = { B: "in the scene", C: "Python", D: "program", E: "GPU model" };

function Section({ title, note, examples, gpu }: { title: string; note: string; examples: Example[]; gpu: boolean }) {
  if (!examples.length) return null;
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="text-sm font-medium text-fg">{title}</h3>
      <p className="mb-2.5 text-xs text-muted">{note}</p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {examples.map((e) => (
          <Card key={e.slug} example={e} gpu={gpu} />
        ))}
      </div>
    </section>
  );
}

function Card({ example: e, gpu }: { example: Example; gpu: boolean }) {
  const tools = (e.uses ?? []).flatMap((id) => CATALOG.filter((c) => c.id === id));
  return (
    <div className="overflow-hidden rounded-lg border border-line transition-colors hover:border-faint">
      <button type="button" data-example={e.slug} data-requires={(e.requires ?? []).join(" ")} onClick={() => void openExample(e.slug)} className="block w-full text-left">
        {e.thumbnail ? <img src={e.thumbnail} alt="" className="h-28 w-full bg-bg object-cover" /> : <div className="h-28 w-full bg-bg" />}
        <div className="p-2.5 pb-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-fg">{e.title}</span>
            {e.mode === "timeline" && <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">Timeline</span>}
            {e.requires?.includes("webgpu") && (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted" title={gpu ? "Uses WebGPU" : "This browser has no WebGPU"}>
                WebGPU{gpu ? "" : " ✕"}
              </span>
            )}
            {e.requires?.includes("camera") && (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted" title="Asks for the camera">
                Camera
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted">{e.description}</p>
          {!tools.length && <p className="mt-1.5 truncate text-[10px] text-faint">{e.made_with}</p>}
        </div>
      </button>
      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-2.5">
          {tools.map((t) => (
            <a
              key={t.id}
              href={t.repo}
              target="_blank"
              rel="noreferrer"
              title={`${t.purpose} License: ${t.license}.`}
              className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted hover:text-fg"
            >
              {t.name} · {t.license} · {HOW[t.tier]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
