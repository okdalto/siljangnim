// The Examples view: every example (opens as a new project, or by a shared
// link), and every other tool from the reference list (index.opensource) that
// has no example yet, which the agent can be asked to build.
import { useEffect, useMemo, useState } from "react";
import { CATALOG, REFERENCES, REFERENCE_SOURCE, referenceFor, referenceLabels, type CatalogEntry, type ReferenceEntry } from "../../catalog/catalog";
import { EXAMPLES, exampleText, type Example } from "../../project/examples";
import { buildWithAgent, exampleLink, mixExample, openExample, setExamplesOpen } from "../session";
import type { Language } from "../language";
import { useApp, useLanguage } from "../state";
import { CheckIcon, MixIcon, XIcon } from "./icons";

const MADE_HERE = "Made in Siljangnim";

/** Everything this view says, in each language it shows descriptions in, so the two never mix. */
const STRINGS = {
  en: {
    title: "Examples",
    intro: (examples: number, more: number) =>
      `${examples} examples, each opening as a project you can change or ask the agent to change. Below them, ${more} more open-source tools from`,
    introEnd: "that don't have an example yet: the agent can build one.",
    credits: "Credits and licenses",
    close: "Back to the studio (Esc)",
    search: "Search: physics, font, audio, mesh, three…",
    all: "All",
    notBuilt: "Not built yet",
    notBuiltNote: `From ${REFERENCE_SOURCE}. Pick one and the agent connects it in a new project.`,
    nothing: (q: string) => `Nothing matches "${q}".`,
    try: "Try",
    tool: "The tool",
    howMade: "How it was made",
    creditsHeading: "Credits",
    allNotices: "All third-party notices ↗",
    technical: "Technical details",
    open: "Open",
    mix: "Mix in",
    mixTitle: "Ask the agent to blend this into the project that's open now",
    link: "Link",
    linkTitle: "Copy a link that opens this example",
    about: "About",
    aboutTitle: "About this example",
    madeHere: "Made in Siljangnim",
    timeline: "Timeline",
    camera: "Camera",
    webgpuTitle: (gpu: boolean): string => (gpu ? "Uses WebGPU" : "This browser has no WebGPU"),
    license: "License",
    noLicense: "license?",
    repository: "repository",
    build: "Build with the agent",
    buildTitle: "Opens a new project and asks the agent to connect it",
    copyRequest: "Copy request for your agent",
    copyTitle: "Copies the request for your agent",
    how: { B: "in the scene", C: "Python", D: "program", E: "GPU model" } as Record<CatalogEntry["tier"], string>,
    other: "Other",
  },
  ko: {
    title: "예제",
    intro: (examples: number, more: number) =>
      `예제 ${examples}개. 하나를 열면 프로젝트가 되고, 직접 바꾸거나 에이전트에게 바꿔 달라고 할 수 있어요. 아래에는 아직 예제가 없는 오픈소스 도구 ${more}개가 있어요. 출처:`,
    introEnd: "— 에이전트에게 연결해 달라고 할 수 있어요.",
    credits: "출처와 라이선스",
    close: "스튜디오로 돌아가기 (Esc)",
    search: "검색: 물리, 폰트, 소리, 메시, three…",
    all: "전체",
    notBuilt: "아직 예제가 없는 도구",
    notBuiltNote: `${REFERENCE_SOURCE}의 목록이에요. 고르면 에이전트가 새 프로젝트에서 연결해 줘요.`,
    nothing: (q: string) => `"${q}"에 맞는 결과가 없어요.`,
    try: "해 보기",
    tool: "쓰인 도구",
    howMade: "만든 방법",
    creditsHeading: "출처",
    allNotices: "서드파티 고지 전체 ↗",
    technical: "기술 정보",
    open: "열기",
    mix: "섞기",
    mixTitle: "지금 열린 프로젝트에 이 예제를 섞어 달라고 에이전트에게 요청해요",
    link: "링크",
    linkTitle: "이 예제를 바로 여는 링크 복사",
    about: "소개",
    aboutTitle: "이 예제 소개",
    madeHere: "실장님에서 만듦",
    timeline: "타임라인",
    camera: "카메라",
    webgpuTitle: (gpu: boolean): string => (gpu ? "WebGPU를 써요" : "이 브라우저에는 WebGPU가 없어요"),
    license: "라이선스",
    noLicense: "라이선스 미상",
    repository: "저장소",
    build: "에이전트로 만들기",
    buildTitle: "새 프로젝트를 열고 에이전트에게 연결해 달라고 해요",
    copyRequest: "에이전트에게 보낼 요청 복사",
    copyTitle: "외부 에이전트에게 붙여 넣을 요청을 복사해요",
    how: { B: "씬 안에서", C: "Python", D: "프로그램", E: "GPU 모델" } as Record<CatalogEntry["tier"], string>,
    other: "기타",
  },
} satisfies Record<Language, unknown>;

type Strings = (typeof STRINGS)["en"];

/** The reference list's principles, merged where it spells one two ways. */
function category(principle: string | undefined): string {
  if (!principle) return "Other";
  if (principle.startsWith("Image · signal")) return "Image · signal";
  if (principle.startsWith("Making")) return "Making · tools";
  return principle;
}

// Category names in Korean, from the list's own Korean labels.
const CATEGORY_KO = new Map<string, string>();
for (const r of REFERENCES) if (r.ko) CATEGORY_KO.set(category(r.principle), r.ko.principle);
for (const c of CATALOG) {
  const r = referenceFor(c);
  if (r?.ko) CATEGORY_KO.set(category(r.principle), r.ko.principle);
}

function categoryLabel(name: string, t: Strings, korean: boolean): string {
  if (name === MADE_HERE) return t.madeHere;
  if (name === "Other") return t.other;
  return (korean && CATEGORY_KO.get(name)) || name;
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
        text: [e.title, e.title_ko ?? "", e.summary ?? "", e.summary_ko ?? "", e.description, e.made_with, ...e.features, ...tools.flatMap((t) => [t.name, ...t.tags]), ref?.concept ?? "", ref?.ko?.concept ?? ""].join(" ").toLowerCase(),
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
      text: [r.name, r.concept, r.area, r.medium, r.input, ...r.keywords, ...(r.ko ? [r.ko.concept, r.ko.area, r.ko.medium, r.ko.input, ...r.ko.keywords] : [])].join(" ").toLowerCase(),
      reference: r,
    }));
    return [...examples, ...references.sort((a, b) => a.reference!.index.no - b.reference!.index.no)];
  }, []);
}

export function ExamplesDialog() {
  const items = useItems();
  const korean = useLanguage() === "ko";
  const t = STRINGS[korean ? "ko" : "en"];
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [showUnbuilt, setShowUnbuilt] = useState(true);
  const [detail, setDetail] = useState<Item | null>(null);
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const close = () => setExamplesOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Esc closes the detail first, then the view.
      setDetail((d) => {
        if (!d) setExamplesOpen(false);
        return null;
      });
    };
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
      <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-7xl flex-col" data-testid="examples">
        <div className="shrink-0 space-y-3 border-b border-line px-6 pb-3 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{t.title}</h2>
              <p className="text-xs text-muted">
                {t.intro(EXAMPLES.length, items.length - EXAMPLES.length)}{" "}
                <a href="https://indexopensource.com/index" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  index.opensource
                </a>{" "}
                {t.introEnd}{" "}
                <a href={NOTICES_URL} target="_blank" rel="noreferrer" className="text-faint underline-offset-2 hover:text-muted hover:underline">
                  {t.credits}
                </a>
              </p>
            </div>
            <button type="button" onClick={close} className="shrink-0 rounded-md p-1 text-muted hover:bg-raised hover:text-fg" title={t.close}>
              <XIcon />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              className="h-8 w-72 rounded-md border border-line bg-panel px-2.5 text-sm outline-none focus:border-faint"
              data-testid="examples-search"
            />
            <Chip label={t.all} count={items.length} active={!picked} onClick={() => setPicked(null)} />
            {categories.map(([name, count]) => (
              <Chip key={name} label={categoryLabel(name, t, korean)} count={count} active={picked === name} onClick={() => setPicked(picked === name ? null : name)} />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {examples.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {examples.map((i) => (
                <ExampleCard key={i.key} example={i.example!} tools={i.tools!} gpu={gpu} korean={korean} onInfo={() => setDetail(i)} />
              ))}
            </div>
          )}
          {unbuilt.length > 0 && (
            <section className="mt-7">
              <button type="button" onClick={() => setShowUnbuilt(!showUnbuilt)} className="mb-1 text-sm font-medium text-fg hover:text-muted">
                {showUnbuilt ? "▾" : "▸"} {t.notBuilt} ({unbuilt.length})
              </button>
              <p className="mb-3 text-xs text-muted">{t.notBuiltNote}</p>
              {showUnbuilt && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
                  {unbuilt.map((i) => (
                    <ReferenceCard key={i.key} reference={i.reference!} korean={korean} />
                  ))}
                </div>
              )}
            </section>
          )}
          {!examples.length && !unbuilt.length && <p className="pt-10 text-center text-sm text-muted">{t.nothing(query)}</p>}
        </div>
      </div>
      {detail?.example && <Detail example={detail.example} tools={detail.tools!} korean={korean} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Everything about one example, in plain words first. */
function Detail({ example: e, tools, korean, onClose }: { example: Example; tools: CatalogEntry[]; korean: boolean; onClose: () => void }) {
  const text = exampleText(e, korean);
  const t = STRINGS[korean ? "ko" : "en"];
  const hasProject = useApp((s) => Boolean(s.project));
  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-panel" data-testid="example-detail">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="truncate text-sm font-medium text-fg">{text.title}</span>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-raised hover:text-fg" title="Close">
          <XIcon size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {e.thumbnail && <img src={e.thumbnail} alt="" className="w-full rounded-md border border-line" />}
        <p className="leading-relaxed text-fg">{text.summary}</p>
        {text.tries.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{t.try}</h4>
            <ul className="space-y-1 text-muted">
              {text.tries.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-accent">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {text.tool && (
          <section>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{tools.length ? t.tool : t.howMade}</h4>
            <p className="leading-relaxed text-muted">{text.tool}</p>
            {tools.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tools.map((tool) => (
                  <a key={tool.id} href={tool.repo} target="_blank" rel="noreferrer" className="rounded bg-raised px-1.5 py-0.5 text-[11px] text-muted hover:text-fg">
                    {tool.name} · {tool.license} ↗
                  </a>
                ))}
              </div>
            )}
          </section>
        )}
        <Credits example={e} tools={tools} t={t} korean={korean} />
        <details className="text-xs text-faint">
          <summary className="cursor-pointer select-none hover:text-muted">{t.technical}</summary>
          <p className="mt-1.5 leading-relaxed">{text.details}</p>
          <p className="mt-1.5">{e.made_with}</p>
        </details>
      </div>
      <div className="flex items-center gap-2 border-t border-line p-3">
        <button type="button" onClick={() => void openExample(e.slug)} className="flex-1 rounded-md bg-accent py-1.5 text-sm font-medium text-white hover:opacity-90" data-testid="example-open">
          {t.open}
        </button>
        {hasProject && (
          <button
            type="button"
            onClick={() => void mixExample(e.slug)}
            title={t.mixTitle}
            data-testid="example-mix"
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted hover:border-faint hover:text-fg"
          >
            <MixIcon size={14} /> {t.mix}
          </button>
        )}
        <CopyLink slug={e.slug} t={t} />
      </div>
    </aside>
  );
}

const NOTICES_URL = "https://github.com/okdalto/siljangnim/blob/main/THIRD_PARTY_NOTICES.md";

/** Who made what this example uses: each tool's repository and license, and any outside material. */
function Credits({ example: e, tools, t, korean }: { example: Example; tools: CatalogEntry[]; t: Strings; korean: boolean }) {
  if (!tools.length && !e.credits?.length) return null;
  return (
    <section className="text-xs" data-testid="example-credits">
      <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{t.creditsHeading}</h4>
      <ul className="space-y-1 text-muted">
        {tools.map((tool) => {
          const ref = referenceFor(tool);
          return (
            <li key={tool.id}>
              <a href={tool.repo} target="_blank" rel="noreferrer" className="text-fg underline-offset-2 hover:underline">
                {tool.name}
              </a>{" "}
              · {tool.license}
              {ref && <span className="text-faint"> · index.opensource #{ref.index.no}</span>}
              <div className="truncate text-[10px] text-faint">{tool.repo.replace("https://", "")}</div>
            </li>
          );
        })}
        {e.credits?.map((c) => (
          <li key={c.what}>
            {(korean && c.what_ko) || c.what} —{" "}
            <a href={c.url} target="_blank" rel="noreferrer" className="text-fg underline-offset-2 hover:underline">
              {c.source}
            </a>{" "}
            · {c.license}
          </li>
        ))}
      </ul>
      <a href={NOTICES_URL} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[10px] text-faint hover:text-muted hover:underline">
        {t.allNotices}
      </a>
    </section>
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

function CopyLink({ slug, t }: { slug: string; t: Strings }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={t.linkTitle}
      onClick={() => {
        void navigator.clipboard.writeText(exampleLink(slug)).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-faint hover:bg-raised hover:text-fg"
    >
      {copied ? <CheckIcon size={11} /> : t.link}
    </button>
  );
}

function ExampleCard({ example: e, tools, gpu, korean, onInfo }: { example: Example; tools: CatalogEntry[]; gpu: boolean; korean: boolean; onInfo: () => void }) {
  const text = exampleText(e, korean);
  const t = STRINGS[korean ? "ko" : "en"];
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-faint">
      <button type="button" data-example={e.slug} data-requires={(e.requires ?? []).join(" ")} onClick={() => void openExample(e.slug)} className="block w-full text-left">
        {e.thumbnail ? <img src={e.thumbnail} alt="" loading="lazy" className="h-28 w-full bg-bg object-cover" /> : <div className="h-28 w-full bg-bg" />}
        <div className="p-2.5 pb-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-fg">{text.title}</span>
            {e.mode === "timeline" && <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">{t.timeline}</span>}
            {e.requires?.includes("webgpu") && (
              <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted" title={t.webgpuTitle(gpu)}>
                WebGPU{gpu ? "" : " ✕"}
              </span>
            )}
            {e.requires?.includes("camera") && <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted">{t.camera}</span>}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{text.summary}</p>
        </div>
      </button>
      <div className="flex items-center gap-1 px-2.5 pb-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {tools.length ? (
            tools.map((tool) => (
              <a
                key={tool.id}
                href={tool.repo}
                target="_blank"
                rel="noreferrer"
                title={`${(korean && referenceFor(tool)?.ko?.concept) || tool.purpose} · ${t.license}: ${tool.license}`}
                className="truncate rounded bg-raised px-1.5 py-0.5 text-[10px] text-muted hover:text-fg"
              >
                {tool.name} · {tool.license} · {t.how[tool.tier]}
              </a>
            ))
          ) : (
            <span className="truncate text-[10px] text-faint" title={e.made_with}>
              {t.madeHere}
            </span>
          )}
        </div>
        <button type="button" onClick={onInfo} title={t.aboutTitle} data-example-info={e.slug} className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-faint hover:bg-raised hover:text-fg">
          {t.about}
        </button>
        <CopyLink slug={e.slug} t={t} />
      </div>
    </div>
  );
}

function ReferenceCard({ reference: r, korean }: { reference: ReferenceEntry; korean: boolean }) {
  const external = useApp((s) => Boolean(s.external));
  const t = STRINGS[korean ? "ko" : "en"];
  const labels = referenceLabels(r, korean);
  return (
    <div className="flex flex-col rounded-lg border border-line/70 p-2.5 text-xs" data-reference={r.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-fg">{r.name}</span>
        <span className="shrink-0 text-[10px] text-faint">#{r.index.no}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-muted">{labels.concept}</p>
      <p className="mt-1 truncate text-[10px] text-faint">
        {labels.medium} · {r.license ?? t.noLicense}
        {r.repo && (
          <>
            {" · "}
            <a href={r.repo} target="_blank" rel="noreferrer" className="hover:text-fg hover:underline">
              {t.repository}
            </a>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => void buildWithAgent(r)}
        title={external ? t.copyTitle : t.buildTitle}
        className="mt-2 self-start rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:border-faint hover:text-fg"
      >
        {external ? t.copyRequest : t.build}
      </button>
    </div>
  );
}
