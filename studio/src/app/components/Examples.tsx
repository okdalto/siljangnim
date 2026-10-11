// Example gallery: opens one as a new project (scene + assets from /examples).
import { EXAMPLES } from "../../project/examples";
import { openExample, setExamplesOpen } from "../session";
import { XIcon } from "./icons";

export function ExamplesDialog() {
  const close = () => setExamplesOpen(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-xl border border-line bg-panel shadow-2xl" data-testid="examples">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">Examples</h2>
            <p className="text-xs text-muted">Each one opens as a new project you can change, or ask the agent to change.</p>
          </div>
          <button type="button" onClick={close} className="text-muted hover:text-fg">
            <XIcon />
          </button>
        </div>
        <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 overflow-y-auto p-4">
          {EXAMPLES.map((e) => (
            <button
              key={e.slug}
              type="button"
              data-example={e.slug}
              onClick={() => void openExample(e.slug)}
              className="group overflow-hidden rounded-lg border border-line text-left transition-colors hover:border-faint"
            >
              <img src={e.thumbnail} alt="" className="h-28 w-full bg-bg object-cover" />
              <div className="p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-fg">{e.title}</span>
                  {e.mode === "timeline" && <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">Timeline</span>}
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted">{e.description}</p>
                <p className="mt-1.5 truncate text-[10px] text-faint">{e.made_with}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
