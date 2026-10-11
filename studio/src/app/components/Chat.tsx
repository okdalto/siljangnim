import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import type Anthropic from "@anthropic-ai/sdk";
import { isStudioNote, STUDIO_NOTE_PREFIX } from "../../agent/context";
import { ANTHROPIC_MODELS } from "../../agent/llm/anthropic";
import type { MessageParam } from "../../agent/llm/types";
import { answerQuestion, clearChat, detachAsset, dismissNotice, sendPrompt, stopAgent } from "../session";
import { activeModel } from "../settings";
import { useApp, type LiveTurn } from "../state";
import { FilePickerButton } from "./Assets";
import { AlertIcon, CheckIcon, PaperclipIcon, SendIcon, Spinner, StopIcon, XIcon } from "./icons";

type ToolResult = Anthropic.Beta.BetaToolResultBlockParam;

const TOOL_LABELS: Record<string, string> = {
  scene_read: "Read scene",
  scene_write: "Wrote scene",
  scene_edit: "Edited scene",
  viewport_capture: "Looked at the viewport",
  viewport_status: "Checked status",
  history_list: "Checked history",
  history_restore: "Restored a version",
  asset_list: "Checked assets",
  asset_read: "Read an asset",
};

const EXAMPLES = [
  "Slow blue waves drifting across the screen",
  "A reaction-diffusion simulation I can disturb with the mouse",
  "레이마칭으로 무한 평면 위의 반사 구체",
];

/** Model name and "New chat", shown in the sidebar header on the chat tab. */
export function ChatHeaderActions() {
  const settings = useApp((s) => s.settings);
  const hasMessages = useApp((s) => s.messages.length > 0);
  const busy = useApp((s) => Boolean(s.live));
  const modelLabel =
    settings.provider === "anthropic"
      ? (ANTHROPIC_MODELS.find((m) => m.id === settings.anthropicModel)?.label ?? settings.anthropicModel)
      : activeModel(settings) || "no model chosen";
  return (
    <>
      <span className="truncate text-faint">{modelLabel}</span>
      {hasMessages && !busy && (
        <button type="button" onClick={() => void clearChat()} className="shrink-0 text-faint hover:text-fg">
          New chat
        </button>
      )}
    </>
  );
}

export function Chat() {
  const messages = useApp((s) => s.messages);
  const live = useApp((s) => s.live);
  const notice = useApp((s) => s.notice);
  const results = useMemo(() => collectResults(messages), [messages]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, live]);

  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm leading-relaxed">
        {messages.length === 0 && !live && <Empty />}
        {messages.map((m, i) => (
          <Message key={i} message={m} results={results} />
        ))}
        {live && <Live live={live} />}
      </div>

      {notice && (
        <div className={`mx-3 mb-2 flex items-start gap-2 rounded-md px-3 py-2 text-xs ${notice.kind === "error" ? "bg-danger/10 text-danger" : "bg-raised text-muted"}`}>
          <AlertIcon size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={dismissNotice} className="opacity-70 hover:opacity-100">
            <XIcon size={13} />
          </button>
        </div>
      )}
      <Composer busy={Boolean(live)} />
    </>
  );
}

function Empty() {
  return (
    <div className="pt-10 text-center">
      <p className="text-base font-medium">What should we make?</p>
      <p className="mt-1 text-xs text-muted">Describe a visual. The agent writes it, runs it and checks the result.</p>
      <div className="mt-6 space-y-2">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => void sendPrompt(e)}
            className="block w-full rounded-lg border border-line px-3 py-2 text-left text-xs text-muted transition-colors hover:border-faint hover:text-fg"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ message, results }: { message: MessageParam; results: Map<string, ToolResult> }) {
  const blocks = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content;
  if (message.role === "user") {
    const notes = blocks.flatMap((b) => (b.type === "text" && isStudioNote(b) ? [b.text.slice(STUDIO_NOTE_PREFIX.length)] : []));
    const text = blocks.flatMap((b) => (b.type === "text" && !isStudioNote(b) ? [b.text] : [])).join("\n");
    const images = blocks.flatMap((b) => (b.type === "image" && b.source.type === "base64" ? [`data:${b.source.media_type};base64,${b.source.data}`] : []));
    if (!text) return null; // tool results render under their tool calls
    return (
      <div className="space-y-1.5">
        {notes.map((note, i) => (
          <p key={i} className="text-center text-[11px] text-faint">
            {note}
          </p>
        ))}
        {images.length > 0 && (
          <div className="flex justify-end gap-1.5">
            {images.map((src, i) => (
              <img key={i} src={src} alt="Attached image" className="max-h-24 rounded-md border border-line" />
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-raised px-3.5 py-2">{text}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === "text" && block.text.trim()) {
          return (
            <div key={i} className="prose-chat">
              <Markdown>{block.text}</Markdown>
            </div>
          );
        }
        if (block.type === "thinking" && block.thinking.trim()) return <Thought key={i} text={block.thinking} />;
        if (block.type === "tool_use" && block.name === "ask_user") return <AnsweredQuestion key={i} input={block.input} result={results.get(block.id)} />;
        if (block.type === "tool_use") return <ToolChip key={i} name={block.name} result={results.get(block.id)} />;
        return null;
      })}
    </div>
  );
}

function Thought({ text, live = false }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs text-faint">
      <button type="button" onClick={() => setOpen(!open)} className={`hover:text-muted ${live ? "animate-pulse" : ""}`}>
        {live ? "Thinking…" : "Thought"} {open ? "▾" : "▸"}
      </button>
      {open && <div className="mt-1 whitespace-pre-wrap border-l border-line pl-3">{text}</div>}
    </div>
  );
}

export function ToolChip({ name, result, running = false }: { name: string; result?: ToolResult; running?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[name] ?? name;
  const content = result?.content;
  const items = typeof content === "string" ? [{ type: "text" as const, text: content }] : (content ?? []);
  const image = items.find((c) => c.type === "image");
  const text = items.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
  const failed = Boolean(result?.is_error);

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={!result}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${failed ? "border-danger/40 text-danger" : "border-line text-muted"} ${result ? "hover:text-fg" : ""}`}
      >
        {running ? <Spinner size={12} /> : failed ? <AlertIcon size={12} /> : <CheckIcon size={12} />}
        {running ? `${label}…` : failed ? `${label} — failed` : label}
      </button>
      {image?.type === "image" && image.source.type === "base64" && (
        <img
          src={`data:${image.source.media_type};base64,${image.source.data}`}
          alt="Viewport capture"
          className="mt-2 max-h-40 rounded-md border border-line"
        />
      )}
      {open && text && <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-bg p-2 font-mono text-[11px] text-muted">{text}</pre>}
    </div>
  );
}

/** An earlier ask_user call: the question and what the person answered. */
function AnsweredQuestion({ input, result }: { input: unknown; result?: ToolResult }) {
  const question = (input as { question?: unknown })?.question;
  const answer = typeof result?.content === "string" ? result.content.replace(/^The person (chose|answered in their own words): /, "") : null;
  return (
    <div className="rounded-lg border border-line px-3 py-2 text-xs">
      <div className="text-muted">{typeof question === "string" ? question : "Question"}</div>
      <div className="mt-1 text-fg">{result?.is_error ? <span className="text-faint">No answer</span> : (answer ?? "…")}</div>
    </div>
  );
}

/** The agent's open question: pick an option, or type an answer in the composer. */
function QuestionCard() {
  const question = useApp((s) => s.question);
  if (!question) return null;
  return (
    <div className="rounded-lg border border-accent/40 bg-raised/50 p-3 text-xs" data-testid="question">
      <p className="mb-2 text-sm text-fg">{question.question}</p>
      <div className="space-y-1.5">
        {question.options.map((o) => (
          <button
            key={o.label}
            type="button"
            data-question-option={o.label}
            onClick={() => answerQuestion(o.label)}
            className="block w-full rounded-md border border-line px-3 py-2 text-left hover:border-faint"
          >
            <span className="text-fg">{o.label}</span>
            {o.description && <span className="mt-0.5 block text-[11px] text-faint">{o.description}</span>}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">Or type your own answer below.</p>
    </div>
  );
}

function Live({ live }: { live: LiveTurn }) {
  const asking = useApp((s) => Boolean(s.question));
  const idle = !live.text && !live.tools.length;
  return (
    <div className="space-y-2">
      {live.thinking && <Thought text={live.thinking} live />}
      {live.text && (
        <div className="prose-chat">
          <Markdown>{live.text}</Markdown>
        </div>
      )}
      {live.tools.map((t) => (t.name === "ask_user" ? null : <ToolChip key={t.id} name={t.name} running />))}
      {asking && <QuestionCard />}
      {idle && !live.thinking && !asking && (
        <div className="flex items-center gap-2 text-xs text-faint">
          <Spinner size={12} /> Working…
        </div>
      )}
    </div>
  );
}

function Composer({ busy }: { busy: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const asking = useApp((s) => Boolean(s.question));
  const submit = () => {
    if (!text.trim()) return;
    if (asking) answerQuestion(text);
    else if (!busy) void sendPrompt(text);
    else return;
    setText("");
  };

  return (
    <div className="shrink-0 border-t border-line p-3">
      <Attachments />
      <div className="flex items-end gap-2 rounded-xl border border-line bg-bg px-3 py-2 focus-within:border-faint">
        <FilePickerButton title="Attach files" className="rounded-lg p-1.5 text-faint hover:text-fg">
          <PaperclipIcon size={15} />
        </FilePickerButton>
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Don't send while an IME (Korean, Japanese…) is still composing.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={asking ? "Type your own answer…" : busy ? "The agent is working…" : "Describe what you want to see"}
          className="max-h-[200px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-faint"
        />
        {/* While the agent waits for an answer, typed text is sent as the answer. */}
        {busy && !(asking && text.trim()) ? (
          <button type="button" onClick={stopAgent} className="rounded-lg bg-raised p-1.5 text-fg hover:bg-line" title="Stop">
            <StopIcon size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="rounded-lg bg-accent p-1.5 text-white transition-opacity disabled:opacity-30"
            title="Send"
          >
            <SendIcon size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Assets uploaded since the last prompt; the next prompt tells the agent about them. */
function Attachments() {
  const attachments = useApp((s) => s.attachments);
  if (!attachments.length) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {attachments.map((name) => (
        <span key={name} className="inline-flex max-w-full items-center gap-1 rounded-md bg-raised px-2 py-1 text-[11px] text-muted">
          <span className="truncate">{name}</span>
          <button type="button" onClick={() => detachAsset(name)} title="Don't mention in the next message" className="hover:text-fg">
            <XIcon size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}

function collectResults(messages: MessageParam[]): Map<string, ToolResult> {
  const map = new Map<string, ToolResult>();
  for (const m of messages) {
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const b of m.content) if (b.type === "tool_result") map.set(b.tool_use_id, b);
  }
  return map;
}
