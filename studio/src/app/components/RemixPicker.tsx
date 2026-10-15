// The remix list: every technique (moves) and every example piece as cards to pick from, several at once, sent to
// the agent as one request. The "Try next" cards are the short, suggested version of the same list.
import { useMemo, useState } from "react";
import { MOVES, MOVE_CATEGORIES, suggestMoves, type Move } from "../../moves/moves";
import { EXAMPLES, exampleText } from "../../project/examples";
import { exampleFamily, groupExamples } from "../../project/exampleGroups";
import { ExampleFolders } from "./ExampleFolders";
import { resolveLanguage } from "../language";
import { appliedMoves, remix, setRemixOpen } from "../session";
import { useApp } from "../state";
import { XIcon } from "./icons";

const CATEGORY_LABEL: Record<Move["category"], { en: string; ko: string }> = {
  dimension: { en: "3D & form", ko: "3D · 형태" },
  render: { en: "Rendering & light", ko: "렌더링 · 빛" },
  motion: { en: "Motion & simulation", ko: "모션 · 시뮬레이션" },
  image: { en: "Image & glitch", ko: "이미지 · 글리치" },
  sound: { en: "Sound", ko: "사운드" },
  input: { en: "Input & performance", ko: "입력 · 공연" },
  output: { en: "Output", ko: "출력" },
};

const WEIGHT: Record<Move["weight"], { en: string; ko: string } | null> = {
  light: null,
  heavy: { en: "GPU heavy", ko: "GPU 무거움" },
  python: { en: "Python", ko: "Python" },
  "gpu-model": { en: "ML model", ko: "ML 모델" },
};

export function RemixPicker() {
  const scene = useApp((s) => s.scene);
  const projectId = useApp((s) => s.project?.id);
  const projectName = useApp((s) => s.project?.name ?? "");
  const language = useApp((s) => s.settings.language);
  const download = useApp((s) => s.exampleDownload);
  const korean = resolveLanguage(language) === "ko";
  const [tab, setTab] = useState<"moves" | "examples">("moves");
  const [query, setQuery] = useState("");
  const [moves, setMoves] = useState<string[]>([]);
  const [examples, setExamples] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const close = () => setRemixOpen(false);

  const suggested = useMemo(() => new Set(projectId ? suggestMoves(scene, { applied: appliedMoves(projectId), limit: 8 }).map((s) => s.move.id) : []), [scene, projectId]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const moveText = (m: Move) => (korean ? { name: m.name_ko, summary: m.summary_ko } : { name: m.name, summary: m.summary });
  const shownMoves = MOVES.filter((m) => matches(`${m.name} ${m.name_ko} ${m.summary} ${m.summary_ko} ${m.category}`));
  const exampleItems = useMemo(
    () => EXAMPLES.map((e) => ({ example: e, text: exampleText(e, korean) })),
    [korean],
  );
  const shownExamples = exampleItems.filter(({ example, text }) => matches(`${exampleFamily(example)?.label ?? ""} ${text.title} ${text.summary} ${example.title} ${(example.uses ?? []).join(" ")}`));
  const toggle = (set: (update: (list: string[]) => string[]) => void, id: string) => set((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const picked = [
    ...moves.map((id) => ({ key: `m:${id}`, label: moveText(MOVES.find((m) => m.id === id)!).name, remove: () => toggle(setMoves, id) })),
    ...examples.map((slug) => ({ key: `e:${slug}`, label: exampleItems.find((i) => i.example.slug === slug)!.text.title, remove: () => toggle(setExamples, slug) })),
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="flex h-[min(760px,92vh)] w-full max-w-4xl flex-col rounded-xl border border-line bg-panel text-sm shadow-2xl" data-testid="remix-picker">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-3 pt-4">
          <div>
            <h2 className="text-base font-semibold">{korean ? "리믹스" : "Remix"}</h2>
            <p className="text-xs text-muted">
              {korean
                ? `기법과 예제를 여러 개 골라 “${projectName}”에 한꺼번에 섞어요. ★는 지금 장면에 잘 맞는 것이에요.`
                : `Pick techniques and examples, as many as you like, and mix them into “${projectName}” in one go. ★ fits the scene on screen.`}
            </p>
          </div>
          <button type="button" onClick={close} className="text-muted hover:text-fg" data-testid="close-remix">
            <XIcon />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
          {(["moves", "examples"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-7 rounded-full border px-3 text-xs ${tab === t ? "border-faint bg-raised text-fg" : "border-line text-muted hover:text-fg"}`}
            >
              {t === "moves" ? (korean ? `기법 ${MOVES.length}` : `Techniques ${MOVES.length}`) : korean ? `예제 ${EXAMPLES.length}` : `Examples ${EXAMPLES.length}`}
            </button>
          ))}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={korean ? "검색: SSAO, 글리치, 유체, three, 소리…" : "Search: SSAO, glitch, fluid, three, sound…"}
            className="ml-auto h-8 w-72 rounded-md border border-line bg-bg px-2.5 text-sm outline-none focus:border-faint"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {tab === "moves" ? (
            MOVE_CATEGORIES.map((category) => {
              const list = shownMoves.filter((m) => m.category === category).sort((a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id)));
              if (!list.length) return null;
              return (
                <section key={category} className="mt-3">
                  <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">{CATEGORY_LABEL[category][korean ? "ko" : "en"]}</h3>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-1.5">
                    {list.map((m) => {
                      const on = moves.includes(m.id);
                      const weight = WEIGHT[m.weight];
                      const t = moveText(m);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          data-remix-move={m.id}
                          aria-pressed={on}
                          onClick={() => toggle(setMoves, m.id)}
                          title={t.summary}
                          className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${on ? "border-accent bg-accent/15" : "border-line hover:border-faint hover:bg-raised"}`}
                        >
                          <span className="flex items-center gap-1 text-xs text-fg">
                            {suggested.has(m.id) && <span className="text-accent">★</span>}
                            {t.name}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-muted">{t.summary}</span>
                          {weight && <span className="mt-1 inline-block rounded bg-raised px-1 text-[9px] text-faint">{weight[korean ? "ko" : "en"]}</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          ) : (
            <div className="mt-3">
              <ExampleFolders groups={groupExamples(shownExamples, (i) => i.example)} korean={korean} searching={words.length > 0} compact renderItem={({ example: e, text }) => {
                const on = examples.includes(e.slug);
                return (
                  <button
                    key={e.slug}
                    type="button"
                    data-remix-example={e.slug}
                    aria-pressed={on}
                    onClick={() => toggle(setExamples, e.slug)}
                    title={text.summary}
                    className={`overflow-hidden rounded-lg border text-left transition-colors ${on ? "border-accent ring-1 ring-accent" : "border-line hover:border-faint"}`}
                  >
                    {e.thumbnail ? <img src={e.thumbnail} alt="" loading="lazy" className="h-20 w-full bg-bg object-cover" /> : <div className="h-20 w-full bg-bg" />}
                    <span className="block truncate px-2 py-1.5 text-[11px] text-fg">{text.title}</span>
                  </button>
                );
              }} />
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-line px-5 py-3">
          <div className="flex min-h-7 flex-wrap items-center gap-1.5">
            {picked.length ? (
              picked.map((p) => (
                <button key={p.key} type="button" onClick={p.remove} className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-xs text-fg hover:bg-line">
                  {p.label} <XIcon size={11} />
                </button>
              ))
            ) : (
              <span className="text-xs text-faint">{korean ? "카드를 눌러 고르세요. 여러 개를 고를 수 있어요." : "Click cards to pick them; pick several to combine."}</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={korean ? "덧붙일 말 (선택): 예) 보라색 톤으로, 천천히" : "Anything to add (optional): e.g. purple tones, slower"}
              className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 text-sm outline-none focus:border-faint"
            />
            <button
              type="button"
              disabled={!picked.length || Boolean(download)}
              onClick={() => void remix({ moves, examples, note })}
              data-testid="remix-go"
              className="shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              {download ? (korean ? "예제 받는 중…" : "Downloading…") : korean ? `리믹스 (${picked.length})` : `Remix (${picked.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
