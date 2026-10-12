// The Examples view: every example (opens as a new project, or by a shared
// link), and every other tool from the reference list (index.opensource) that
// has no example yet, which the agent can be asked to build.
import { useEffect, useMemo, useState } from "react";
import { CATALOG, REFERENCES, REFERENCE_SOURCE, referenceFor, type CatalogEntry, type ReferenceEntry } from "../../catalog/catalog";
import { EXAMPLES, type Example } from "../../project/examples";
import { buildWithAgent, exampleLink, openExample, setExamplesOpen } from "../session";
import { useApp } from "../state";
import { CheckIcon, XIcon } from "./icons";

const HOW: Record<CatalogEntry["tier"], string> = { B: "in the scene", C: "Python", D: "program", E: "GPU model" };
const MADE_HERE = "Made in Siljangnim";

/** The reference list's principles, merged where it spells one two ways. */
function category(principle: string | undefined): string {
  if (!principle) return "Other";
  if (principle.startsWith("Image · signal")) return "Image · signal";
  if (principle.startsWith("Making")) return "Making · tools";
  return principle;
}

interface Item {
  key: string;
  category: string;
  text: string;
  example?: Example;
  tools?: CatalogEntry[];
  reference?: ReferenceEntry;
}

function useItems(): Item[] {
  return useMemo(() => {
    const examples: Item[] = EXAMPLES.map((e) => {
      const tools = (e.uses ?? []).flatMap((id) => CATALOG.filter((c) => c.id === id));
      const ref = tools.map(referenceFor).find(Boolean);
      return {
        key: e.slug,
        category: tools.length ? category(ref?.principle) : MADE_HERE,
        text: [e.title, e.description, e.made_with, ...e.features, ...tools.flatMap((t) => [t.name, ...t.tags]), ref?.concept ?? ""].join(" ").toLowerCase(),
        example: e,
        tools,
      };
    });
    const built = new Set(EXAMPLES.flatMap((e) => e.uses ?? []));
    // Curated tools without an example are listed too, by their index entry.
    const curatedOnly = CATALOG.filter((c) => !built.has(c.id)).flatMap((c) => referenceFor(c) ?? []);
    const references: Item[] = [...REFERENCES, ...curatedOnly].map((r) => ({
      key: `ref:${r.id}`,
      category: category(r.principle),
      text: [r.name, r.concept, r.area, r.medium, r.input, ...r.keywords].join(" ").toLowerCase(),
      reference: r,
    }));
    return [...examples, ...references.sort((a, b) => a.reference!.index.no - b.reference!.index.no)];
  }, []);
}

export function ExamplesDialog() {
  const items = useItems();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [showUnbuilt, setShowUnbuilt] = useState(true);
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const close = () => setExamplesOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExamplesOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return [...counts].sort((a, b) => (a[0] === MADE_HERE ? 1 : b[0] === MADE_HERE ? -1 : b[1] - a[1]));
  }, [items]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => (!picked || i.category === picked) && words.every((w) => i.text.includes(w)));
  const examples = shown.filter((i) => i.example);
  const unbuilt = shown.filter((i) => i.reference);

  return (
    // The backdrop closes the view (the smoke test relies on it too).
    <div className="absolute inset-x-0 bottom-0 top-11 z-40 flex bg-bg" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-col" data-testid="examples">
        <div className="shrink-0 space-y-3 border-b border-line px-6 pb-3 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Examples</h2>
              <p className="text-xs text-muted">
                {EXAMPLES.length} examples, each opening as a project you can change or ask the agent to change. Below them, {items.length - EXAMPLES.length} more open-source tools from{" "}
                <a href="https://indexopensource.com/index" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  index.opensource
                </a>{" "}
                that don't have an example yet: the agent can build one.
              </p>
            </div>
            <button type="button" onClick={close} className="shrink-0 rounded-md p-1 text-muted hover:bg-raised hover:text-fg" title="Back to the studio (Esc)">
              <XIcon />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: physics, font, audio, mesh, three…"
              className="h-8 w-72 rounded-md border border-line bg-panel px-2.5 text-sm outline-none focus:border-faint"
              data-testid="examples-search"
            />
            <Chip label="All" count={items.length} active={!picked} onClick={() => setPicked(null)} />
            {categories.map(([name, count]) => (
              <Chip key={name} label={name} count={count} active={picked === name} onClick={() => setPicked(picked === name ? null : name)} />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {examples.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {examples.map((i) => (
                <ExampleCard key={i.key} example={i.example!} tools={i.tools!} gpu={gpu} />
              ))}
            </div>
          )}
          {unbuilt.length > 0 && (
            <section className="mt-7">
              <button type="button" onClick={() => setShowUnbuilt(!showUnbuilt)} className="mb-1 text-sm font-medium text-fg hover:text-muted">
                {showUnbuilt ? "▾" : "▸"} Not built yet ({unbuilt.length})
              </button>
              <p className="mb-3 text-xs text-muted">From {REFERENCE_SOURCE}. Pick one and the agent connects it in a new project.</p>
              {showUnbuilt && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
                  {unbuilt.map((i) => (
                    <ReferenceCard key={i.key} reference={i.reference!} />
                  ))}
                </div>
              )}
            </section>
          )}
          {!examples.length && !unbuilt.length && <p className="pt-10 text-center text-sm text-muted">Nothing matches "{query}".</p>}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded-full border px-2.5 text-xs ${active ? "border-faint bg-raised text-fg" : "border-line text-muted hover:text-fg"}`}
    >
      {label} <span className="text-faint">{count}</span>
    </button>
  );
}

function CopyLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy a link that opens this example"
      onClick={() => {
        void navigator.clipboard.writeText(exampleLink(slug)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-faint hover:bg-raised hover:text-fg"
    >
      {copied ? <CheckIcon size={11} /> : "Link"}
    </button>
  );
}

function ExampleCard({ example: e, tools, gpu }: { example: Example; tools: CatalogEntry[]; gpu: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-faint">
      <button type="button" data-example={e.slug} data-requires={(e.requires ?? []).join(" ")} onClick={() => void openExample(e.slug)} className="block w-full text-left">
        {e.thumbnail ? <img src={e.thumbnail} alt="" loading="lazy" className="h-28 w-full bg-bg object-cover" /> : <div className="h-28 w-full bg-bg" />}
        <div className="p-2.5 pb-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-fg">{e.title}</span>
            {e.mode === "timeline" && <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">Timeline</span>}
            {e.requires?.includes("webgpu") && (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted" title={gpu ? "Uses WebGPU" : "This browser has no WebGPU"}>
                WebGPU{gpu ? "" : " ✕"}
              </span>
            )}
            {e.requires?.includes("camera") && <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">Camera</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{e.description}</p>
        </div>
      </button>
      <div className="flex items-center gap-1 px-2.5 pb-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {tools.length ? (
            tools.map((t) => (
              <a
                key={t.id}
                href={t.repo}
                target="_blank"
                rel="noreferrer"
                title={`${t.purpose} License: ${t.license}.`}
                className="truncate rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted hover:text-fg"
              >
                {t.name} · {t.license} · {HOW[t.tier]}
              </a>
            ))
          ) : (
            <span className="truncate text-[10px] text-faint">{e.made_with}</span>
          )}
        </div>
        <CopyLink slug={e.slug} />
      </div>
    </div>
  );
}

function ReferenceCard({ reference: r }: { reference: ReferenceEntry }) {
  const external = useApp((s) => Boolean(s.external));
  return (
    <div className="flex flex-col rounded-lg border border-line/70 p-2.5 text-xs" data-reference={r.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-fg">{r.name}</span>
        <span className="shrink-0 text-[10px] text-faint">#{r.index.no}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-muted">{r.concept}</p>
      <p className="mt-1 truncate text-[10px] text-faint">
        {r.medium} · {r.license ?? "license?"}
        {r.repo && (
          <>
            {" · "}
            <a href={r.repo} target="_blank" rel="noreferrer" className="hover:text-fg hover:underline">
              repository
            </a>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => void buildWithAgent(r)}
        title={external ? "Copies the request for your agent" : "Opens a new project and asks the agent to connect it"}
        className="mt-2 self-start rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:border-faint hover:text-fg"
      >
        {external ? "Copy request for your agent" : "Build with the agent"}
      </button>
    </div>
  );
}
